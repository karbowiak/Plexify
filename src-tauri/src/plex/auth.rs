//! Persistent settings management (server URL + token).
//!
//! Settings are stored as a JSON file in the OS app config directory.
//! This module is pure Rust std — no Tauri dependencies — so it can be
//! tested independently. The Tauri command layer handles resolving the
//! config directory via `AppHandle`.

use super::models::PlexSettings;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

/// Return the path to the settings file within `config_dir`.
pub fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join("plex_settings.json")
}

/// Load settings from `config_dir`. Returns default (empty) settings if
/// the file does not exist yet.
pub fn load(config_dir: &Path) -> Result<PlexSettings> {
    let path = settings_path(config_dir);
    if !path.exists() {
        return Ok(PlexSettings::default());
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read settings from {:?}", path))?;
    serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse settings from {:?}", path))
}

/// Persist settings to `config_dir`, creating directories as needed.
pub fn save(config_dir: &Path, settings: &PlexSettings) -> Result<()> {
    std::fs::create_dir_all(config_dir)
        .with_context(|| format!("Failed to create config dir {:?}", config_dir))?;
    let path = settings_path(config_dir);
    let content = serde_json::to_string_pretty(settings)
        .context("Failed to serialize settings")?;
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write settings to {:?}", path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_and_load_settings() {
        let dir = tempfile::tempdir().expect("Failed to create temp dir");
        let settings = PlexSettings {
            base_url: "http://test.local:32400".to_string(),
            token: "test-token-abc".to_string(),
            ..Default::default()
        };

        save(dir.path(), &settings).expect("save failed");

        let loaded = load(dir.path()).expect("load failed");
        assert_eq!(loaded.base_url, settings.base_url);
        assert_eq!(loaded.token, settings.token);
    }

    #[test]
    fn test_load_missing_returns_empty_defaults() {
        let dir = tempfile::tempdir().expect("Failed to create temp dir");
        let loaded = load(dir.path()).expect("load failed");
        assert_eq!(loaded.base_url, "", "base_url should be empty when no settings file exists");
        assert_eq!(loaded.token, "", "token should be empty when no settings file exists");
    }

    #[test]
    fn test_settings_path() {
        let dir = tempfile::tempdir().expect("Failed to create temp dir");
        let path = settings_path(dir.path());
        assert!(path.ends_with("plex_settings.json"));
    }

    #[test]
    fn test_save_creates_directory() {
        let dir = tempfile::tempdir().expect("Failed to create temp dir");
        let nested = dir.path().join("a").join("b").join("c");
        let settings = PlexSettings {
            base_url: "http://nested.local:32400".to_string(),
            token: "nested-token".to_string(),
            ..Default::default()
        };
        save(&nested, &settings).expect("save should create parent dirs");
        assert!(nested.join("plex_settings.json").exists());
    }
}
