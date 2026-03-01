// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod plex;
mod plextv;

use commands::PlexState;
use once_cell::sync::Lazy;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Image cache — persistent disk cache for Plex artwork.
//
// The frontend uses the `pleximg://img?src=<url-encoded-plex-url>` scheme.
// This handler:
//   1. Derives a deterministic filename from the URL path (token excluded).
//   2. Returns cached bytes from disk if present.
//   3. Otherwise fetches from Plex, saves to disk, then returns bytes.
//
// Cache dir: {app_cache_dir}/pleximg/
// Clear via the `clear_image_cache` Tauri command (wired to the Refresh button).
// ---------------------------------------------------------------------------

/// Dedicated Tokio runtime for image fetching — isolated from Tauri's runtime.
static IMGCACHE_RT: Lazy<tokio::runtime::Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .thread_name("pleximg-cache")
        .enable_all()
        .build()
        .expect("Failed to create image-cache async runtime")
});

/// Shared HTTP client for image fetching (accepts self-signed certs for local Plex servers).
static IMG_HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("Failed to build image HTTP client")
});

/// Converts a full Plex URL into a safe, deterministic filename.
///
/// Strips scheme, host:port, and query string — keeping only the path.
/// Example: `https://plex.example.com:32400/library/metadata/42/thumb?X-Plex-Token=abc`
///       → `library_metadata_42_thumb.img`
fn plex_img_cache_key(src_url: &str) -> String {
    let without_query = src_url.split('?').next().unwrap_or(src_url);
    let path = without_query
        .split("://")
        .nth(1)
        .and_then(|rest| rest.splitn(2, '/').nth(1))
        .unwrap_or(without_query);
    format!("{}.img", path.replace('/', "_"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PlexState::new())
        // ---- Custom image-caching protocol ----
        .register_uri_scheme_protocol("pleximg", |app, request| {
            // Extract and decode the `src` query param (the full Plex URL).
            let query = request.uri().query().unwrap_or("");
            let src = url::form_urlencoded::parse(query.as_bytes())
                .find(|(k, _)| k == "src")
                .map(|(_, v)| v.into_owned())
                .unwrap_or_default();

            if src.is_empty() {
                return tauri::http::Response::builder()
                    .status(400)
                    .body(vec![])
                    .unwrap();
            }

            // Locate the cache file.
            let cache_key = plex_img_cache_key(&src);
            let cache_dir: Option<std::path::PathBuf> = app
                .app_handle()
                .path()
                .app_cache_dir()
                .ok()
                .map(|d| d.join("pleximg"));

            if let Some(ref dir) = cache_dir {
                let _ = std::fs::create_dir_all(dir);
                let file_path = dir.join(&cache_key);
                if file_path.exists() {
                    if let Ok(bytes) = std::fs::read(&file_path) {
                        return tauri::http::Response::builder()
                            .header("Content-Type", "image/jpeg")
                            .header("Cache-Control", "max-age=86400")
                            .body(bytes)
                            .unwrap();
                    }
                }
            }

            // Cache miss — fetch from Plex.
            let result = IMGCACHE_RT.block_on(async {
                IMG_HTTP.get(&src).send().await?.bytes().await
            });

            match result {
                Ok(bytes) => {
                    if let Some(ref dir) = cache_dir {
                        let _ = std::fs::write(dir.join(&cache_key), &bytes);
                    }
                    tauri::http::Response::builder()
                        .header("Content-Type", "image/jpeg")
                        .header("Cache-Control", "max-age=86400")
                        .body(bytes.to_vec())
                        .unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(vec![])
                    .unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Connection
            commands::connect_plex,
            // Library
            commands::get_library_sections,
            commands::search_library,
            commands::get_recently_added,
            commands::get_hubs,
            commands::get_on_deck,
            // Metadata
            commands::get_track,
            commands::get_artist,
            commands::get_album,
            commands::get_artist_albums,
            commands::get_album_tracks,
            commands::get_artist_popular_tracks,
            commands::get_artist_popular_leaves,
            commands::get_artist_similar,
            commands::get_artist_sonically_similar,
            commands::get_artist_albums_in_section,
            commands::get_artist_popular_tracks_in_section,
            commands::get_related_hubs,
            // Playlists
            commands::get_playlists,
            commands::get_playlist_items,
            commands::get_liked_tracks,
            commands::create_playlist,
            // Play queue
            commands::create_play_queue,
            commands::get_play_queue,
            commands::add_to_play_queue,
            // Playback tracking
            commands::mark_played,
            commands::mark_unplayed,
            commands::report_timeline,
            // Ratings (Phase 3)
            commands::rate_item,
            // Sonic / PlexAmp (Phase 2)
            commands::get_sonically_similar,
            commands::get_track_radio,
            commands::get_artist_stations,
            commands::get_section_stations,
            commands::compute_sonic_path,
            commands::get_stream_levels,
            // Streaming URLs (Phase 4)
            commands::get_stream_url,
            commands::get_thumb_url,
            commands::get_audio_transcode_url,
            // Server info (Phase 5)
            commands::get_identity,
            commands::get_server_info,
            // Settings (Phase 5)
            commands::load_settings,
            commands::save_settings,
            // Cache
            commands::clear_image_cache,
            // Plex.tv OAuth
            commands::plex_auth_start,
            commands::plex_auth_poll,
            commands::plex_get_resources,
            commands::test_server_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run()
}
