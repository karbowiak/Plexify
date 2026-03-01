//! Streaming URL builders for direct play and transcoding.
//!
//! These methods never make a network request — they simply construct the
//! URLs that an audio element or media player can hit directly.

use super::PlexClient;

impl PlexClient {
    /// Build a direct-play URL for a media part.
    ///
    /// `part_key` comes from `track.media[0].parts[0].key`, e.g.
    /// `/library/parts/12345/1234567890/file.flac`.
    ///
    /// The returned URL can be set as the `src` of an `<audio>` element.
    pub fn direct_play_url(&self, part_key: &str) -> String {
        self.build_url(&format!("{}?X-Plex-Token={}", part_key, self.token))
    }

    /// Build an artwork/thumbnail URL.
    ///
    /// `thumb_path` comes from `track.thumb`, `album.thumb`, etc.,
    /// e.g. `/library/metadata/12345/thumb/1234567890`.
    pub fn thumb_url(&self, thumb_path: &str) -> String {
        self.build_url(&format!("{}?X-Plex-Token={}", thumb_path, self.token))
    }

    /// Build an audio transcode URL.
    ///
    /// Use this when the client cannot play the native container/codec.
    /// Plex will transcode to the requested format on the fly.
    ///
    /// # Arguments
    /// * `part_key` — path from `track.media[0].parts[0].key`
    /// * `bitrate`  — max bitrate in kbps (e.g. 320)
    /// * `codec`    — target codec, e.g. "mp3", "aac", "opus"
    pub fn audio_transcode_url(
        &self,
        part_key: &str,
        bitrate: Option<i32>,
        codec: Option<&str>,
    ) -> String {
        let mut url = format!(
            "/music/:/transcode/universal/start.mp3\
             ?path={}&X-Plex-Token={}&directPlay=0&directStream=1",
            part_key, self.token
        );

        if let Some(b) = bitrate {
            url.push_str(&format!("&maxAudioBitrate={}", b));
        }
        if let Some(c) = codec {
            url.push_str(&format!("&audioCodec={}", c));
        }

        self.build_url(&url)
    }
}

#[cfg(test)]
mod tests {
    use super::super::{PlexClient, PlexClientConfig};

    fn make_client() -> PlexClient {
        PlexClient::new(PlexClientConfig {
            base_url: "http://localhost:32400".to_string(),
            token: "mytoken".to_string(),
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn test_direct_play_url() {
        let c = make_client();
        let url = c.direct_play_url("/library/parts/12345/1234567890/file.flac");
        assert!(url.starts_with("http://localhost:32400/"), "URL should include base: {}", url);
        assert!(url.contains("X-Plex-Token=mytoken"), "URL should include token: {}", url);
        assert!(url.contains("library/parts/12345"), "URL should include part path: {}", url);
    }

    #[test]
    fn test_thumb_url() {
        let c = make_client();
        let url = c.thumb_url("/library/metadata/12345/thumb/1234567890");
        assert!(url.starts_with("http://localhost:32400/"), "URL should include base: {}", url);
        assert!(url.contains("X-Plex-Token=mytoken"), "URL should include token: {}", url);
        assert!(url.contains("thumb"), "URL should include thumb path: {}", url);
    }

    #[test]
    fn test_audio_transcode_url_no_options() {
        let c = make_client();
        let url = c.audio_transcode_url("/library/parts/12345/1234567890/file.flac", None, None);
        assert!(url.contains("X-Plex-Token=mytoken"), "URL should include token: {}", url);
        assert!(url.contains("transcode"), "URL should include transcode path: {}", url);
        assert!(!url.contains("maxAudioBitrate"), "URL should not include bitrate when not set: {}", url);
        assert!(!url.contains("audioCodec"), "URL should not include codec when not set: {}", url);
    }

    #[test]
    fn test_audio_transcode_url_with_options() {
        let c = make_client();
        let url = c.audio_transcode_url("/library/parts/12345/1234567890/file.flac", Some(320), Some("mp3"));
        assert!(url.contains("maxAudioBitrate=320"), "URL should include bitrate: {}", url);
        assert!(url.contains("audioCodec=mp3"), "URL should include codec: {}", url);
    }
}
