#![allow(dead_code)]

use std::fs::File;
use std::io::Cursor;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use once_cell::sync::Lazy;
use symphonia::core::codecs::{CodecRegistry, CodecType, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{Limit, MetadataOptions};
use symphonia::core::probe::Hint;
use tracing::{debug, info, warn};

use super::state::DecoderShared;

/// Dedicated HTTP client for audio fetching (accepts self-signed certs)
pub static AUDIO_HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .expect("failed to build audio HTTP client")
});

/// Limit concurrent audio prefetch downloads to avoid overwhelming the Plex server.
pub static PREFETCH_SEMAPHORE: Lazy<tokio::sync::Semaphore> =
    Lazy::new(|| tokio::sync::Semaphore::new(2));

/// Extended codec registry that adds Opus on top of symphonia's built-in defaults.
pub static OPUS_REGISTRY: Lazy<CodecRegistry> = Lazy::new(|| {
    let mut r = CodecRegistry::new();
    r.register_all::<symphonia_adapter_libopus::OpusDecoder>();
    r
});

/// Dedicated tokio runtime for async HTTP I/O in the decoder thread
pub static DECODER_RT: Lazy<tokio::runtime::Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .thread_name("audio-http")
        .enable_all()
        .build()
        .expect("failed to build decoder tokio runtime")
});

/// Fetch audio bytes from a URL
pub fn fetch_audio(url: &str) -> Result<Vec<u8>, String> {
    info!(url = url, "Fetching audio data");
    DECODER_RT.block_on(async {
        let resp = AUDIO_HTTP
            .get(url)
            .send()
            .await
            .map_err(|e| format!("HTTP fetch failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP {} for audio URL", resp.status()));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Failed to read audio bytes: {e}"))?;

        info!(size = bytes.len(), "Audio data fetched");
        Ok(bytes.to_vec())
    })
}

/// Derive a deterministic cache filename from a URL.
pub fn audio_cache_key(url: &str) -> String {
    let without_query = url.split('?').next().unwrap_or(url);
    let path = without_query
        .split("://")
        .nth(1)
        .and_then(|rest| rest.splitn(2, '/').nth(1))
        .unwrap_or(without_query);
    format!("{}.audio", path.replace('/', "_"))
}

/// Open a URL for streaming decode (cache hit → File::open; miss → fetch + save).
pub fn open_for_decode(
    url: &str,
    shared: &Arc<DecoderShared>,
) -> Result<(MediaSourceStream, String), String> {
    if let Some(ref cache_dir) = shared.cache_dir {
        let _ = std::fs::create_dir_all(cache_dir);
        let cache_path = cache_dir.join(audio_cache_key(url));
        if cache_path.exists() {
            info!(url = url, "Audio cache hit — streaming from disk");
            let file = File::open(&cache_path)
                .map_err(|e| format!("Failed to open cached audio: {e}"))?;
            let mss = MediaSourceStream::new(Box::new(file), Default::default());
            return Ok((mss, url.to_string()));
        }
    }

    // Cache miss — fetch from network
    let bytes = fetch_audio(url)?;

    if let Some(ref cache_dir) = shared.cache_dir {
        let cache_path = cache_dir.join(audio_cache_key(url));
        if std::fs::write(&cache_path, &bytes).is_ok() {
            let max_bytes = shared.max_cache_bytes.load(Ordering::Relaxed);
            if max_bytes > 0 {
                evict_cache_if_needed(cache_dir, max_bytes);
            }
            if let Ok(file) = File::open(&cache_path) {
                let mss = MediaSourceStream::new(Box::new(file), Default::default());
                return Ok((mss, url.to_string()));
            }
        }
    }

    // Fallback: in-memory cursor
    let cursor = Cursor::new(bytes);
    let mss = MediaSourceStream::new(Box::new(cursor), Default::default());
    Ok((mss, url.to_string()))
}

/// Delete oldest `.audio` cache files until total size is within `max_bytes`.
pub fn evict_cache_if_needed(cache_dir: &std::path::Path, max_bytes: u64) {
    let mut entries: Vec<(std::path::PathBuf, u64, std::time::SystemTime)> =
        match std::fs::read_dir(cache_dir) {
            Ok(rd) => rd
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path().extension().and_then(|x| x.to_str()) == Some("audio")
                })
                .filter_map(|e| {
                    let meta = e.metadata().ok()?;
                    let mtime = meta.modified().ok()?;
                    Some((e.path(), meta.len(), mtime))
                })
                .collect(),
            Err(_) => return,
        };

    let total: u64 = entries.iter().map(|(_, size, _)| size).sum();
    if total <= max_bytes {
        return;
    }

    entries.sort_by_key(|(_, _, mtime)| *mtime);

    let mut remaining = total;
    for (path, size, _) in entries {
        if remaining <= max_bytes {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            remaining = remaining.saturating_sub(size);
            debug!(path = ?path, "Evicted audio cache entry");
        }
    }
}

/// Warm the audio disk cache for `url` in the background.
pub fn prefetch_url_bg(url: String, shared: Arc<DecoderShared>) {
    DECODER_RT.spawn(async move {
        let Some(ref cache_dir) = shared.cache_dir else { return };
        let cache_path = cache_dir.join(audio_cache_key(&url));
        if cache_path.exists() {
            debug!(url = %url, "Audio prefetch: already cached");
            return;
        }
        let _ = std::fs::create_dir_all(cache_dir);

        let _permit = match PREFETCH_SEMAPHORE.try_acquire() {
            Ok(p) => p,
            Err(_) => {
                debug!(url = %url, "Audio prefetch: skipped (concurrency limit)");
                return;
            }
        };

        if cache_path.exists() {
            return;
        }

        let resp = match AUDIO_HTTP.get(&url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => { warn!(url = %url, status = %r.status(), "Audio prefetch: bad status"); return; }
            Err(e) => { warn!(url = %url, error = %e, "Audio prefetch: request failed"); return; }
        };

        let tmp_path = cache_path.with_extension("part");
        match prefetch_stream_to_file(resp, &tmp_path).await {
            Ok(total) => {
                match tokio::fs::rename(&tmp_path, &cache_path).await {
                    Ok(_) => {
                        let max_bytes = shared.max_cache_bytes.load(Ordering::Relaxed);
                        if max_bytes > 0 { evict_cache_if_needed(cache_dir, max_bytes); }
                        info!(url = %url, size = total, "Audio prefetch complete");
                    }
                    Err(e) => {
                        warn!(url = %url, error = %e, "Audio prefetch: rename failed");
                        let _ = tokio::fs::remove_file(&tmp_path).await;
                    }
                }
            }
            Err(e) => {
                debug!(url = %url, error = %e, "Audio prefetch: stream failed (non-critical)");
                let _ = tokio::fs::remove_file(&tmp_path).await;
            }
        }
    });
}

/// Stream a reqwest response body to `path`, returning the total bytes written.
async fn prefetch_stream_to_file(resp: reqwest::Response, path: &std::path::Path) -> anyhow::Result<usize> {
    use futures::TryStreamExt;
    use tokio::io::AsyncWriteExt;

    let mut file = tokio::fs::File::create(path).await?;
    let mut stream = resp.bytes_stream();
    let mut total = 0usize;
    while let Some(chunk) = stream.try_next().await? {
        file.write_all(&chunk).await?;
        total += chunk.len();
    }
    file.flush().await?;
    Ok(total)
}

/// Probe a `MediaSourceStream` and return a format reader + decoder + track info.
pub fn probe_audio(
    mss: MediaSourceStream,
    url: &str,
) -> Result<
    (
        Box<dyn FormatReader>,
        Box<dyn symphonia::core::codecs::Decoder>,
        u32,       // track_id
        u32,       // sample_rate
        u32,       // channels
        CodecType, // codec
    ),
    String,
> {
    let mut hint = Hint::new();
    if let Some(ext) = url.rsplit('.').next() {
        let ext_lower = ext.split('?').next().unwrap_or(ext).to_lowercase();
        hint.with_extension(&ext_lower);
    }

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };
    let metadata_opts = MetadataOptions {
        limit_metadata_bytes: Limit::Maximum(16 * 1024),
        limit_visual_bytes: Limit::Maximum(0),
    };

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &metadata_opts)
        .map_err(|e| format!("Failed to probe audio format: {e}"))?;

    let format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("No audio track found")?;

    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or("Unknown sample rate")?;
    let channels = track
        .codec_params
        .channels
        .map(|c| c.count() as u32)
        .unwrap_or(2);

    let decoder_opts = DecoderOptions::default();
    let decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &decoder_opts)
        .or_else(|_| OPUS_REGISTRY.make(&track.codec_params, &decoder_opts))
        .map_err(|e| format!("Failed to create decoder: {e}"))?;

    info!(
        sample_rate = sample_rate,
        channels = channels,
        codec = ?track.codec_params.codec,
        "Audio probed successfully"
    );

    let codec = track.codec_params.codec;
    Ok((format, decoder, track_id, sample_rate, channels, codec))
}
