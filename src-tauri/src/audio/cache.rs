#![allow(dead_code)]

use std::fs::File;
use std::io::{Cursor, Read, Seek};
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

/// Fetch audio bytes from a URL using the provided HTTP client.
/// Retries once on transient errors (503, connection resets).
pub fn fetch_audio(url: &str, client: &reqwest::Client) -> Result<Vec<u8>, String> {
    info!(url = url, "Fetching audio data");
    DECODER_RT.block_on(async {
        let mut last_err = String::new();
        for attempt in 0..2u8 {
            if attempt > 0 {
                warn!(url = url, attempt = attempt + 1, "Retrying audio fetch");
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            match client.get(url).send().await {
                Ok(resp) => {
                    if resp.status() == reqwest::StatusCode::SERVICE_UNAVAILABLE {
                        last_err = "HTTP 503 Service Unavailable for audio URL".into();
                        continue; // retry 503
                    }
                    if !resp.status().is_success() {
                        return Err(format!("HTTP {} for audio URL", resp.status()));
                    }
                    match resp.bytes().await {
                        Ok(bytes) => {
                            info!(size = bytes.len(), "Audio data fetched");
                            return Ok(bytes.to_vec());
                        }
                        Err(e) => {
                            last_err = format!("Failed to read audio bytes: {e}");
                            continue; // retry body read errors (connection resets)
                        }
                    }
                }
                Err(e) if e.is_connect() || e.is_request() => {
                    last_err = format!("HTTP fetch failed: {e}");
                    continue; // retry connection errors
                }
                Err(e) => return Err(format!("HTTP fetch failed: {e}")),
            }
        }
        Err(last_err)
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

/// Open a cached audio file, fixing Deezer MP3 issues if present:
/// - Strips empty ID3v2 headers (symphonia probe bug)
/// - Prepends zero-padding for MP3 bit reservoir underflow
///
/// Normal (Plex) files are streamed directly from disk with zero overhead.
/// Only Deezer-style files needing fixup are read into memory (~480KB).
pub fn open_audio_file(path: &std::path::Path, url: &str) -> Result<(MediaSourceStream, String), String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open: {e}"))?;
    let mut buf = [0u8; 32];
    let n = file.read(&mut buf).unwrap_or(0);

    let mut skip = 0usize;

    // Check for empty ID3v2 header (10-byte header with size=0)
    if n >= 10 && &buf[..3] == b"ID3" && id3v2_total_size(&buf) == 10 {
        skip = 10;
    }

    // Check for MP3 bit reservoir underflow on the first frame
    let pad = if skip + 8 <= n
        && buf[skip] == 0xFF
        && (buf[skip + 1] & 0xE0) == 0xE0
    {
        mp3_main_data_begin(&buf[skip..n]) as usize
    } else {
        0
    };

    if skip > 0 || pad > 0 {
        // Read rest of file into memory and fix
        let mut rest = Vec::new();
        file.read_to_end(&mut rest).map_err(|e| format!("Read failed: {e}"))?;

        let mut fixed = Vec::with_capacity(pad + (n - skip) + rest.len());
        fixed.resize(pad, 0u8);
        fixed.extend_from_slice(&buf[skip..n]);
        fixed.extend_from_slice(&rest);

        if skip > 0 {
            debug!("Stripped empty ID3v2 header from cached file: {}", path.display());
        }
        if pad > 0 {
            debug!(padding = pad, "Added MP3 bit reservoir padding for: {}", path.display());
        }

        let mss = MediaSourceStream::new(Box::new(Cursor::new(fixed)), Default::default());
        Ok((mss, url.to_string()))
    } else {
        // Normal file — seek back to start and stream directly from disk
        file.seek(std::io::SeekFrom::Start(0)).map_err(|e| format!("Seek failed: {e}"))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        Ok((mss, url.to_string()))
    }
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
            return open_audio_file(&cache_path, url);
        }
    }

    // Cache miss — fetch from network
    let client = shared.http_client();
    let bytes = fetch_audio(url, &client)?;

    // Fix Deezer MP3 issues: strip empty ID3v2 header + add bit reservoir padding.
    let bytes = fix_mp3_bytes(bytes);

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
                    Some((e.path(), meta.len(), meta.modified().ok()?))
                })
                .collect(),
            Err(_) => return,
        };

    let total: u64 = entries.iter().map(|(_, s, _)| s).sum();
    if total <= max_bytes {
        return;
    }

    // Sort oldest first
    entries.sort_by_key(|(_, _, t)| *t);
    let mut remaining = total;
    for (path, size, _) in &entries {
        if remaining <= max_bytes {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            remaining = remaining.saturating_sub(*size);
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

        let client = shared.http_client();
        let resp = match client.get(&url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => { warn!(url = %url, status = %r.status(), "Audio prefetch: bad status"); return; }
            Err(e) => { warn!(url = %url, error = %e, "Audio prefetch: request failed"); return; }
        };

        let tmp_path = cache_path.with_extension("part");
        match prefetch_stream_to_file(resp, &tmp_path).await {
            Ok(total) => {
                fix_prefetched_audio(&tmp_path).await;
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

/// Fix a prefetched audio file on disk: strip empty ID3v2 headers and add
/// MP3 bit reservoir padding for Deezer previews. No-op for normal files.
async fn fix_prefetched_audio(path: &std::path::Path) {
    let data = match tokio::fs::read(path).await {
        Ok(d) if d.len() > 10 => d,
        _ => return,
    };

    let mut skip = 0usize;

    // Strip empty ID3v2 header
    if &data[..3] == b"ID3" && id3v2_total_size(&data) == 10 {
        skip = 10;
    }

    // Check for MP3 bit reservoir underflow
    let pad = if skip + 8 <= data.len()
        && data[skip] == 0xFF
        && (data[skip + 1] & 0xE0) == 0xE0
    {
        mp3_main_data_begin(&data[skip..]) as usize
    } else {
        0
    };

    if skip == 0 && pad == 0 {
        return;
    }

    let mut fixed = Vec::with_capacity(pad + data.len() - skip);
    fixed.resize(pad, 0u8);
    fixed.extend_from_slice(&data[skip..]);

    debug!(
        id3v2_stripped = skip > 0,
        reservoir_padding = pad,
        "Fixed prefetched audio: {}",
        path.display()
    );

    let _ = tokio::fs::write(path, &fixed).await;
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

/// Compute the total size of an ID3v2 header (header + tag data) if present at the
/// start of the buffer. Returns 0 if no ID3v2 header found.
fn id3v2_total_size(buf: &[u8]) -> usize {
    if buf.len() < 10 || &buf[..3] != b"ID3" {
        return 0;
    }
    let size_bytes = &buf[6..10];
    let tag_size = ((size_bytes[0] as u32 & 0x7f) << 21)
        | ((size_bytes[1] as u32 & 0x7f) << 14)
        | ((size_bytes[2] as u32 & 0x7f) << 7)
        | (size_bytes[3] as u32 & 0x7f);
    (tag_size + 10) as usize
}

/// Parse the `main_data_begin` field from an MP3 Layer III frame header.
/// Returns 0 if not a valid Layer III frame or if main_data_begin is 0.
///
/// Deezer 30-second previews are cut from the middle of a full MP3 track,
/// so the first frame references bit reservoir data from prior frames that
/// aren't included. Prepending `main_data_begin` zero bytes before the
/// first sync word creates a valid (silent) reservoir and prevents
/// symphonia's "invalid main_data_begin, underflow by N bytes" errors.
fn mp3_main_data_begin(frame: &[u8]) -> u16 {
    if frame.len() < 8 || frame[0] != 0xFF || (frame[1] & 0xE0) != 0xE0 {
        return 0;
    }
    // Layer: 01=III, 10=II, 11=I (counter-intuitive encoding)
    let layer = (frame[1] >> 1) & 0x03;
    if layer != 1 {
        return 0; // Not Layer III — no bit reservoir
    }
    let mpeg_version = (frame[1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    let has_crc = (frame[1] & 0x01) == 0; // protection_bit: 0 = CRC present
    let si_start = 4 + if has_crc { 2 } else { 0 };
    if si_start + 2 > frame.len() {
        return 0;
    }
    if mpeg_version == 3 {
        // MPEG1: main_data_begin is 9 bits
        ((frame[si_start] as u16) << 1) | ((frame[si_start + 1] as u16) >> 7)
    } else {
        // MPEG2/2.5: main_data_begin is 8 bits
        frame[si_start] as u16
    }
}

/// Fix Deezer MP3 preview issues in raw audio bytes:
/// 1. Strip empty ID3v2 headers (symphonia 0.5 "out of bounds" probe bug)
/// 2. Prepend zero-padding for MP3 bit reservoir underflow (cut-from-middle previews)
///
/// Headers with actual content (title, artist, etc.) are left intact.
/// Non-MP3 and non-Layer-III files are returned unchanged.
fn fix_mp3_bytes(bytes: Vec<u8>) -> Vec<u8> {
    let mut skip = 0usize;

    // Strip empty ID3v2 (10-byte header with size=0, no tag frames)
    let total = id3v2_total_size(&bytes);
    if total == 10 && bytes.len() > 10 {
        skip = 10;
        debug!("Stripping empty ID3v2 header (size=0) from audio data");
    }

    // Check first MP3 frame for bit reservoir underflow
    let pad = if skip + 8 <= bytes.len()
        && bytes[skip] == 0xFF
        && (bytes[skip + 1] & 0xE0) == 0xE0
    {
        mp3_main_data_begin(&bytes[skip..]) as usize
    } else {
        0
    };

    if skip == 0 && pad == 0 {
        return bytes;
    }

    if pad > 0 {
        debug!(padding = pad, "Adding MP3 bit reservoir padding (main_data_begin={pad})");
    }

    let mut fixed = Vec::with_capacity(pad + bytes.len() - skip);
    fixed.resize(pad, 0u8);
    fixed.extend_from_slice(&bytes[skip..]);
    fixed
}

/// If the probed duration differs from metadata by more than 5s, use the probed value.
/// This corrects Deezer previews where the API returns full track duration (~172s)
/// but the actual audio is only ~30s.
pub fn corrected_duration(meta_ms: i64, probed_ms: Option<i64>) -> i64 {
    match probed_ms {
        Some(p) if (meta_ms - p).abs() > 5_000 => {
            // If probed duration is suspiciously short (< 50% of metadata)
            // while metadata claims a reasonable duration (> 30s), the probe
            // likely misread the container (e.g. FLAC-in-MP4). Trust metadata.
            if p < meta_ms / 2 && meta_ms > 30_000 {
                tracing::warn!(
                    meta_ms = meta_ms,
                    probed_ms = p,
                    "Probed duration suspiciously short — keeping metadata duration"
                );
                meta_ms
            } else {
                p
            }
        }
        _ => meta_ms,
    }
}

/// Probe a `MediaSourceStream` and return a format reader + decoder + track info.
pub fn probe_audio(
    mss: MediaSourceStream,
    url: &str,
) -> Result<
    (
        Box<dyn FormatReader>,
        Box<dyn symphonia::core::codecs::Decoder>,
        u32,         // track_id
        u32,         // sample_rate
        u32,         // channels
        CodecType,   // codec
        Option<i64>, // probed_duration_ms (from n_frames)
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

    let probed_duration_ms: Option<i64> = track.codec_params.n_frames
        .map(|frames| (frames as f64 / sample_rate as f64 * 1000.0) as i64);

    Ok((format, decoder, track_id, sample_rate, channels, codec, probed_duration_ms))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: fetch the Deezer preview URL for a known track.
    fn get_deezer_preview_url() -> String {
        // Deezer track 3135556 = "Harder, Better, Faster, Stronger" by Daft Punk
        DECODER_RT.block_on(async {
            let resp = AUDIO_HTTP
                .get("https://api.deezer.com/track/3135556")
                .send()
                .await
                .expect("Deezer API request failed");
            let json: serde_json::Value = resp.json().await.expect("Failed to parse JSON");
            json["preview"]
                .as_str()
                .expect("No preview field in Deezer response")
                .to_string()
        })
    }

    /// Verify that raw Deezer preview bytes (with empty ID3v2 header) fail symphonia probe.
    /// This documents the symphonia 0.5 bug that our strip_id3v2_header workaround addresses.
    #[test]
    fn raw_deezer_bytes_fail_symphonia_probe() {
        let preview_url = get_deezer_preview_url();
        let bytes = fetch_audio(&preview_url, &AUDIO_HTTP).expect("fetch should succeed");

        // Verify file has an empty ID3v2 header
        assert_eq!(&bytes[..3], b"ID3", "Should have ID3v2 header");
        let total = id3v2_total_size(&bytes);
        assert_eq!(total, 10, "Deezer preview ID3v2 tag should be 10 bytes (header only, size=0)");

        // Without stripping, symphonia fails
        let cursor = Cursor::new(bytes);
        let mss = MediaSourceStream::new(Box::new(cursor), Default::default());
        let result = probe_audio(mss, &preview_url);
        assert!(result.is_err(), "Raw Deezer bytes should fail symphonia probe (known bug)");
        println!("Expected failure confirmed");
    }

    /// Verify that fix_mp3_bytes fixes the probe for Deezer previews.
    #[test]
    fn fix_mp3_bytes_fixes_deezer_probe() {
        let preview_url = get_deezer_preview_url();
        let bytes = fetch_audio(&preview_url, &AUDIO_HTTP).expect("fetch should succeed");
        println!("Fetched {} bytes", bytes.len());

        // After fixing, probe should succeed
        let fixed = fix_mp3_bytes(bytes);
        assert_ne!(&fixed[..3], b"ID3", "Fixed data should not start with ID3");

        let cursor = Cursor::new(fixed);
        let mss = MediaSourceStream::new(Box::new(cursor), Default::default());
        let (_, _, _, sr, ch, codec, _) =
            probe_audio(mss, &preview_url).expect("probe should succeed after fix_mp3_bytes");

        println!("Probed OK: sr={sr}, ch={ch}, codec={codec:?}");
        assert_eq!(sr, 44100, "Deezer previews should be 44.1kHz");
        assert!(ch == 1 || ch == 2, "Channels should be 1 or 2");
    }

    /// Full integration: fetch → fix → probe → decode first packets without errors.
    /// Verifies the bit reservoir padding prevents "main_data_begin underflow".
    #[test]
    fn deezer_preview_full_pipeline() {
        let preview_url = get_deezer_preview_url();
        let bytes = fetch_audio(&preview_url, &AUDIO_HTTP).expect("fetch should succeed");

        // Verify the raw file has a non-zero main_data_begin (the reservoir problem)
        let id3_skip = if &bytes[..3] == b"ID3" { id3v2_total_size(&bytes) } else { 0 };
        let mdb = mp3_main_data_begin(&bytes[id3_skip..]);
        println!("Raw Deezer preview: main_data_begin={mdb}");
        assert!(mdb > 0, "Deezer previews should have non-zero main_data_begin (cut from middle)");

        let fixed = fix_mp3_bytes(bytes);
        let cursor = Cursor::new(fixed);
        let mss = MediaSourceStream::new(Box::new(cursor), Default::default());
        let (mut fmt, mut dec, tid, sr, ch, codec, _) =
            probe_audio(mss, &preview_url).expect("full pipeline should succeed");

        assert_eq!(sr, 44100);
        assert!(ch > 0);
        assert_ne!(codec, CODEC_TYPE_NULL);

        // Decode first 5 packets — should all succeed (no DecodeError from reservoir underflow)
        let mut decoded_ok = 0;
        for _ in 0..20 {
            match fmt.next_packet() {
                Ok(pkt) if pkt.track_id() == tid => {
                    match dec.decode(&pkt) {
                        Ok(_) => { decoded_ok += 1; if decoded_ok >= 5 { break; } }
                        Err(e) => panic!("Decode should not fail with reservoir padding: {e}"),
                    }
                }
                Ok(_) => continue,
                Err(e) => panic!("Unexpected packet error: {e}"),
            }
        }
        assert!(decoded_ok >= 5, "Should decode at least 5 packets without error, got {decoded_ok}");
        println!("Full pipeline OK: sr={sr}, ch={ch}, codec={codec:?}, first {decoded_ok} packets decoded");
    }

    /// Test that audio_cache_key handles Deezer URLs correctly.
    #[test]
    fn cache_key_deezer_url() {
        let url = "https://cdnt-preview.dzcdn.net/api/1/1/3/b/4/0/abc123.mp3?hdnea=exp=1234";
        let key = audio_cache_key(url);
        assert!(key.ends_with(".audio"), "Cache key should end with .audio");
        assert!(!key.contains('?'), "Cache key should not contain query params");
        println!("Cache key: {key}");
    }

    /// Test extension extraction from Deezer-style URLs with query params.
    #[test]
    fn hint_extension_from_deezer_url() {
        let url = "https://cdnt-preview.dzcdn.net/api/1/1/3/b/4/0/abc123.mp3?hdnea=exp=1234";
        let ext = url.rsplit('.').next().unwrap();
        let ext_lower = ext.split('?').next().unwrap_or(ext).to_lowercase();
        assert_eq!(ext_lower, "mp3", "Should extract 'mp3' extension");
    }

    /// Verify fix_mp3_bytes preserves files with real ID3 tag content.
    #[test]
    fn fix_preserves_nonempty_id3() {
        // Simulate an MP3 with a small but real ID3v2 tag (e.g. just a title frame)
        let mut bytes = vec![0u8; 60];
        bytes[0] = b'I'; bytes[1] = b'D'; bytes[2] = b'3';
        bytes[3] = 4; // version 2.4
        // Size = 40 in synchsafe: 0x00 0x00 0x00 0x28
        bytes[6] = 0x00; bytes[7] = 0x00; bytes[8] = 0x00; bytes[9] = 0x28;
        let result = fix_mp3_bytes(bytes.clone());
        assert_eq!(result.len(), bytes.len(), "Non-empty ID3 should not be stripped");
    }

    /// Verify fix_mp3_bytes strips empty ID3v2 and adds reservoir padding.
    #[test]
    fn fix_strips_empty_id3_and_pads_reservoir() {
        // Simulate Deezer-style: empty ID3v2.4 header + MP3 Layer III sync
        // with main_data_begin = 200
        let mut bytes = vec![0u8; 200];
        bytes[0] = b'I'; bytes[1] = b'D'; bytes[2] = b'3';
        bytes[3] = 4; // version 2.4
        // size = 0 (all zero) → empty ID3v2
        bytes[10] = 0xFF; bytes[11] = 0xFB; // MPEG1, Layer III, no CRC
        // Side info starts at byte 14 (frame offset 4, no CRC)
        // Set main_data_begin = 200: 9 bits → byte[14] = 0x64 (100), byte[15] bit 7 = 0
        bytes[14] = 100; // upper 8 bits of main_data_begin
        bytes[15] = 0x00; // bit 7 = 0 → main_data_begin = 100<<1 | 0 = 200

        let result = fix_mp3_bytes(bytes);
        // Should strip 10-byte ID3v2 + prepend 200 bytes of padding
        // Original: 200 bytes. After strip: 190. After pad: 390.
        assert_eq!(result.len(), 390, "Should be 200 pad + 190 data = 390");
        // First 200 bytes should be zeros (reservoir padding)
        assert!(result[..200].iter().all(|&b| b == 0), "Padding should be zeros");
        // Then MP3 sync word
        assert_eq!(result[200], 0xFF, "MP3 sync should follow the padding");
        assert_eq!(result[201], 0xFB, "MP3 sync byte 2");
    }

    /// Verify fix_mp3_bytes handles empty ID3v2 + zero main_data_begin (no padding needed).
    #[test]
    fn fix_strips_id3_no_reservoir_pad() {
        let mut bytes = vec![0u8; 100];
        bytes[0] = b'I'; bytes[1] = b'D'; bytes[2] = b'3';
        bytes[3] = 4; // version 2.4
        // size = 0
        bytes[10] = 0xFF; bytes[11] = 0xFB; // MP3 sync
        // main_data_begin = 0 (all zeros in side info)
        let result = fix_mp3_bytes(bytes);
        assert_eq!(result.len(), 90, "Empty ID3 stripped, no reservoir pad needed");
        assert_eq!(result[0], 0xFF, "Should start with MP3 sync");
    }

    /// Verify mp3_main_data_begin parses correctly.
    #[test]
    fn parse_main_data_begin() {
        // MPEG1 Layer III, no CRC: side info at byte 4
        let mut frame = [0u8; 10];
        frame[0] = 0xFF; frame[1] = 0xFB; // sync + MPEG1 + Layer III + no CRC
        // main_data_begin = 466 → 9 bits: 0b0_1110_1001_0
        // byte[4] = 0b11101001 = 0xE9, byte[5] bit 7 = 0
        frame[4] = 0xE9; frame[5] = 0x00;
        assert_eq!(mp3_main_data_begin(&frame), 466);

        // main_data_begin = 0
        frame[4] = 0x00; frame[5] = 0x00;
        assert_eq!(mp3_main_data_begin(&frame), 0);

        // Not MP3 (no sync)
        frame[0] = 0x00;
        assert_eq!(mp3_main_data_begin(&frame), 0);
    }
}
