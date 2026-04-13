//! Audio file cache — stores raw audio files (FLAC/MP3/AAC) on disk for
//! instant replay without re-fetching from Plex.
//!
//! Cache key: `{rating_key}.{ext}` (e.g. `12345.flac`)
//! Temp files: `{rating_key}.{ext}.part` (renamed atomically on completion)
//! Index: `index.json` — loaded at startup, flushed on mutations.
//! Eviction: LRU by `last_accessed`, triggered after each write completion.

use std::collections::HashMap;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

/// Default max cache size: 5 GB.
const DEFAULT_MAX_BYTES: u64 = 5 * 1024 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Cache statistics returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total_bytes: u64,
    pub file_count: usize,
    pub max_bytes: u64,
}

/// The audio file cache. Thread-safe: the `Mutex<CacheIndex>` is only locked
/// by the control thread (never the audio callback).
pub struct AudioCache {
    cache_dir: PathBuf,
    index: Mutex<CacheIndex>,
    max_bytes: AtomicU64,
}

/// Active file writer — tees HTTP chunks to disk while streaming.
pub struct CacheWriter {
    temp_path: PathBuf,
    final_path: PathBuf,
    writer: BufWriter<fs::File>,
    bytes_written: u64,
    rating_key: i64,
    filename: String,
}

// ---------------------------------------------------------------------------
// Index (persisted as JSON)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntry {
    filename: String,
    size_bytes: u64,
    last_accessed: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct CacheIndex {
    entries: HashMap<i64, CacheEntry>,
    total_bytes: u64,
}

impl CacheIndex {
    fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    fn save(&self, path: &Path) {
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = fs::write(path, json);
        }
    }
}

// ---------------------------------------------------------------------------
// AudioCache
// ---------------------------------------------------------------------------

impl AudioCache {
    /// Create or open the cache at the given directory.
    pub fn new(cache_dir: PathBuf, max_bytes: Option<u64>) -> Self {
        let _ = fs::create_dir_all(&cache_dir);
        let index_path = cache_dir.join("index.json");
        let mut index = CacheIndex::load(&index_path);

        // Verify entries still exist on disk — remove orphans
        let before = index.entries.len();
        index.entries.retain(|_key, entry| {
            cache_dir.join(&entry.filename).exists()
        });
        if index.entries.len() != before {
            // Recompute total
            index.total_bytes = index.entries.values().map(|e| e.size_bytes).sum();
            index.save(&index_path);
        }

        let max = max_bytes.unwrap_or(DEFAULT_MAX_BYTES);
        info!(
            dir = %cache_dir.display(),
            entries = index.entries.len(),
            total_mb = index.total_bytes / (1024 * 1024),
            max_mb = max / (1024 * 1024),
            "audio cache loaded"
        );

        Self {
            cache_dir,
            index: Mutex::new(index),
            max_bytes: AtomicU64::new(max),
        }
    }

    /// Look up a cached file by rating key. Returns the file path if cached.
    /// Updates `last_accessed` on hit.
    pub fn lookup(&self, rating_key: i64) -> Option<PathBuf> {
        let mut idx = self.index.lock().ok()?;
        let entry = idx.entries.get_mut(&rating_key)?;
        let path = self.cache_dir.join(&entry.filename);
        if !path.exists() {
            // File disappeared — remove from index
            let size = entry.size_bytes;
            idx.entries.remove(&rating_key);
            idx.total_bytes = idx.total_bytes.saturating_sub(size);
            idx.save(&self.index_path());
            return None;
        }
        entry.last_accessed = now_secs();
        // Don't flush index on every hit — debounce by only saving occasionally.
        // The timestamp is in memory; worst case we lose LRU precision on crash.
        Some(path)
    }

    /// Begin writing a new cache file. Returns a `CacheWriter` that receives
    /// chunks and must be finished (or aborted) when done.
    pub fn begin_write(&self, rating_key: i64, ext: &str) -> Result<CacheWriter, String> {
        let filename = format!("{}.{}", rating_key, ext);
        let final_path = self.cache_dir.join(&filename);
        let temp_path = self.cache_dir.join(format!("{}.part", filename));

        // If already cached, skip
        if final_path.exists() {
            return Err("already cached".into());
        }

        // Clean up stale .part file from a previous interrupted write
        let _ = fs::remove_file(&temp_path);

        let file = fs::File::create(&temp_path)
            .map_err(|e| format!("cache create: {}", e))?;

        Ok(CacheWriter {
            temp_path,
            final_path,
            writer: BufWriter::with_capacity(256 * 1024, file),
            bytes_written: 0,
            rating_key,
            filename,
        })
    }

    /// Update the maximum cache size and trigger eviction if needed.
    pub fn set_max_bytes(&self, max: u64) {
        self.max_bytes.store(max, Ordering::Relaxed);
        self.evict();
    }

    /// Remove all cached files and reset the index.
    pub fn clear(&self) {
        if let Ok(mut idx) = self.index.lock() {
            for entry in idx.entries.values() {
                let _ = fs::remove_file(self.cache_dir.join(&entry.filename));
            }
            // Also remove any .part files
            if let Ok(dir) = fs::read_dir(&self.cache_dir) {
                for entry in dir.flatten() {
                    if entry.path().extension().map_or(false, |e| e == "part") {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
            idx.entries.clear();
            idx.total_bytes = 0;
            idx.save(&self.index_path());
        }
        info!("audio cache cleared");
    }

    /// Get cache statistics.
    pub fn stats(&self) -> CacheStats {
        let idx = self.index.lock().unwrap();
        CacheStats {
            total_bytes: idx.total_bytes,
            file_count: idx.entries.len(),
            max_bytes: self.max_bytes.load(Ordering::Relaxed),
        }
    }

    /// Register a completed write in the index and evict if over limit.
    fn register_and_evict(&self, rating_key: i64, filename: String, size_bytes: u64) {
        if let Ok(mut idx) = self.index.lock() {
            idx.entries.insert(
                rating_key,
                CacheEntry {
                    filename,
                    size_bytes,
                    last_accessed: now_secs(),
                },
            );
            idx.total_bytes += size_bytes;
            self.evict_with_index(&mut idx);
            idx.save(&self.index_path());
        }
    }

    /// Evict least-recently-accessed entries until under the max size.
    fn evict(&self) {
        if let Ok(mut idx) = self.index.lock() {
            self.evict_with_index(&mut idx);
            idx.save(&self.index_path());
        }
    }

    fn evict_with_index(&self, idx: &mut CacheIndex) {
        let max = self.max_bytes.load(Ordering::Relaxed);
        if max == 0 || idx.total_bytes <= max {
            return;
        }

        // Sort by last_accessed ascending (oldest first)
        let mut entries: Vec<(i64, u64, u64)> = idx
            .entries
            .iter()
            .map(|(&key, e)| (key, e.last_accessed, e.size_bytes))
            .collect();
        entries.sort_by_key(|&(_, ts, _)| ts);

        for (key, _, size) in entries {
            if idx.total_bytes <= max {
                break;
            }
            if let Some(entry) = idx.entries.remove(&key) {
                let path = self.cache_dir.join(&entry.filename);
                let _ = fs::remove_file(&path);
                idx.total_bytes = idx.total_bytes.saturating_sub(size);
                debug!(rating_key = key, size, "evicted cached audio file");
            }
        }
    }

    fn index_path(&self) -> PathBuf {
        self.cache_dir.join("index.json")
    }
}

// ---------------------------------------------------------------------------
// CacheWriter
// ---------------------------------------------------------------------------

impl CacheWriter {
    /// Write a chunk of bytes to the temp file.
    pub fn write_chunk(&mut self, data: &[u8]) {
        if self.writer.write_all(data).is_ok() {
            self.bytes_written += data.len() as u64;
        }
    }

    /// Finish the write: flush, rename temp → final, register in cache index.
    pub fn finish(mut self, cache: &AudioCache) {
        if self.writer.flush().is_err() {
            self.abort();
            return;
        }
        drop(self.writer);

        if fs::rename(&self.temp_path, &self.final_path).is_err() {
            let _ = fs::remove_file(&self.temp_path);
            warn!(rating_key = self.rating_key, "cache rename failed");
            return;
        }

        debug!(
            rating_key = self.rating_key,
            size_mb = self.bytes_written / (1024 * 1024),
            "cached audio file"
        );

        cache.register_and_evict(self.rating_key, self.filename, self.bytes_written);
    }

    /// Abort the write — delete the temp file.
    pub fn abort(self) {
        drop(self.writer);
        let _ = fs::remove_file(&self.temp_path);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Extract the file extension from a URL path.
/// e.g. `http://host/library/parts/123/456/file.flac?token=x` → `"flac"`
pub fn extract_extension(url: &str) -> String {
    // Strip query string
    let path = url.split('?').next().unwrap_or(url);
    // Get the last path component's extension
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("dat")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn extract_ext_from_url() {
        assert_eq!(
            extract_extension("http://host/library/parts/123/456/file.flac?X-Plex-Token=abc"),
            "flac"
        );
        assert_eq!(
            extract_extension("http://host/music/track.mp3"),
            "mp3"
        );
        assert_eq!(extract_extension("http://host/noext"), "dat");
    }

    #[test]
    fn cache_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let cache = AudioCache::new(dir.path().to_path_buf(), Some(100 * 1024 * 1024));

        // Miss
        assert!(cache.lookup(42).is_none());

        // Write
        let mut writer = cache.begin_write(42, "flac").unwrap();
        writer.write_chunk(&[1, 2, 3, 4, 5]);
        writer.finish(&cache);

        // Hit
        let path = cache.lookup(42).unwrap();
        assert!(path.exists());
        assert_eq!(fs::read(&path).unwrap(), vec![1, 2, 3, 4, 5]);

        // Stats
        let stats = cache.stats();
        assert_eq!(stats.file_count, 1);
        assert_eq!(stats.total_bytes, 5);

        // Clear
        cache.clear();
        assert!(cache.lookup(42).is_none());
        assert_eq!(cache.stats().file_count, 0);
    }

    #[test]
    fn lru_eviction() {
        let dir = tempfile::tempdir().unwrap();
        let cache = AudioCache::new(dir.path().to_path_buf(), Some(10)); // 10 bytes max

        // Write 3 files: 5 bytes each = 15 total, exceeds 10
        // Manually set last_accessed to ensure deterministic ordering
        for (i, key) in [1i64, 2, 3].iter().enumerate() {
            let mut w = cache.begin_write(*key, "dat").unwrap();
            w.write_chunk(&[0; 5]);
            w.finish(&cache);
            // Set increasing timestamps manually for deterministic LRU order
            if let Ok(mut idx) = cache.index.lock() {
                if let Some(entry) = idx.entries.get_mut(key) {
                    entry.last_accessed = 1000 + i as u64;
                }
            }
        }

        let stats = cache.stats();
        // Should have evicted oldest entries to stay under 10 bytes
        assert!(stats.total_bytes <= 10, "total {} > 10", stats.total_bytes);
        // Key 3 (most recent) should still be cached
        assert!(cache.lookup(3).is_some());
    }
}
