//! Plex API HTTP client with retry logic and connection pooling
#![allow(dead_code)]

use reqwest::header::{HeaderMap, HeaderValue};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::RetryTransientMiddleware;
use reqwest_retry::policies::ExponentialBackoff;
use serde::de::DeserializeOwned;
use anyhow::{Result, Context};
use tracing::{debug, instrument};

use crate::plex::models::PlexApiResponse;

const PRODUCT_NAME: &str = "Hibiki";
const PRODUCT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Configuration for the PlexClient
#[derive(Debug, Clone)]
pub struct PlexClientConfig {
    /// Base URL of the Plex server (e.g., "http://localhost:32400")
    pub base_url: String,
    /// Plex authentication token
    pub token: String,
    /// Stable per-installation UUID used as X-Plex-Client-Identifier.
    /// Required by Plex for timeline/session tracking.
    pub client_id: String,
    /// Maximum concurrent connections (default: 100)
    pub max_connections: usize,
    /// Enable debug logging (default: false)
    pub debug: bool,
    /// Disable TLS certificate verification (useful for local servers with self-signed certs)
    pub accept_invalid_certs: bool,
}

impl Default for PlexClientConfig {
    fn default() -> Self {
        Self {
            base_url: String::from("http://localhost:32400"),
            token: String::new(),
            client_id: String::from("hibiki-client"),
            max_connections: 100,
            debug: false,
            accept_invalid_certs: false,
        }
    }
}

/// Plex API client with retry logic and connection pooling
#[derive(Debug, Clone)]
pub struct PlexClient {
    base_url: String,
    pub token: String,
    pub client_id: String,
    pub machine_identifier: String,
    pub client: ClientWithMiddleware,
    /// Separate reqwest client for `fetch_bytes` (audio download path).
    ///
    /// Plex closes idle keep-alive connections aggressively, and reqwest's
    /// pool happily hands those stale sockets out for new requests. For the
    /// large-body media path we use a dedicated client with **pooling disabled**
    /// so every download opens a fresh TCP/TLS connection. ~50–100ms handshake
    /// overhead per fetch, fully reliable.
    media_client: reqwest::Client,
    /// Serializes media fetches process-wide. Plex has a bug (at least on the
    /// versions we've tested against) where two concurrent large-body downloads
    /// from the same client cause one in-flight transfer to be killed mid-body
    /// with "end of file before message length reached". The standalone
    /// integration test `probe_concurrent_two_files` can't reproduce it, but
    /// it's 100% reproducible inside the Tauri app where the active track
    /// fetch and preloaded next-track fetch fire back-to-back. Serializing
    /// trades a bit of preload parallelism for reliability. The lock is
    /// async-safe so other tokio work runs freely while a fetch holds it.
    fetch_lock: std::sync::Arc<tokio::sync::Mutex<()>>,
}

impl PlexClient {
    /// Create a new PlexClient with the given configuration
    ///
    /// # Arguments
    /// * `config` - Client configuration
    ///
    /// # Returns
    /// * `Result<PlexClient>` - The configured client or an error
    ///
    /// # Example
    /// ```no_run
    /// use plex::client::{PlexClient, PlexClientConfig};
    ///
    /// # tokio_test::block_on(async {
    /// let config = PlexClientConfig {
    ///     base_url: "http://localhost:32400".to_string(),
    ///     token: "your-token-here".to_string(),
    ///     ..Default::default()
    /// };
    ///
    /// let client = PlexClient::new(config)?;
    /// # Ok::<(), anyhow::Error>(())
    /// # });
    /// ```
    pub fn new(config: PlexClientConfig) -> Result<Self> {
        // Build retry policy with exponential backoff
        // Only 1 retry — large playlist item requests can take a long time to
        // evaluate server-side, and retrying a 60-second timeout 4 times would
        // leave the user waiting 4+ minutes before seeing an error.
        let retry_policy = ExponentialBackoff::builder()
            .retry_bounds(
                std::time::Duration::from_millis(100),
                std::time::Duration::from_millis(3200),
            )
            .build_with_max_retries(1);

        let retry_middleware = RetryTransientMiddleware::new_with_policy(retry_policy);

        // Build default headers sent on every request so Plex can identify
        // and name this client in its dashboard / sessions view.
        let platform = std::env::consts::OS; // "macos", "linux", "windows"
        let mut default_headers = HeaderMap::new();
        default_headers.insert("X-Plex-Product",      HeaderValue::from_static(PRODUCT_NAME));
        default_headers.insert("X-Plex-Version",      HeaderValue::from_static(PRODUCT_VERSION));
        default_headers.insert("X-Plex-Platform",     HeaderValue::from_str(platform).unwrap_or(HeaderValue::from_static("Desktop")));
        default_headers.insert("X-Plex-Device",       HeaderValue::from_static("Desktop"));
        default_headers.insert("X-Plex-Device-Name",  HeaderValue::from_static(PRODUCT_NAME));
        if let Ok(v) = HeaderValue::from_str(&config.client_id) {
            default_headers.insert("X-Plex-Client-Identifier", v);
        }

        // Build HTTP client.
        //
        // `pool_idle_timeout(3s)` defends against Plex closing idle keep-alive
        // connections from under us — reqwest's default of 90s is well above
        // Plex's server-side timeout, which means the pool keeps handing out
        // dead sockets after even brief idle periods. 3s is short enough to
        // avoid stale entries while still allowing back-to-back API calls to
        // reuse a connection.
        let client = reqwest::Client::builder()
            .pool_max_idle_per_host(config.max_connections)
            .pool_idle_timeout(std::time::Duration::from_secs(3))
            // 120s: smart playlists with 100k+ tracks can take a long time to
            // evaluate server-side even with correct pagination params.
            .timeout(std::time::Duration::from_secs(120))
            .danger_accept_invalid_certs(config.accept_invalid_certs)
            .default_headers(default_headers.clone())
            .build()
            .context("Failed to build HTTP client")?;

        // Dedicated client for `fetch_bytes`. No connection pooling at all —
        // every audio download opens a fresh TCP/TLS connection. See the
        // `media_client` field doc for the rationale.
        let media_client = reqwest::Client::builder()
            .pool_max_idle_per_host(0)
            .timeout(std::time::Duration::from_secs(120))
            .danger_accept_invalid_certs(config.accept_invalid_certs)
            .default_headers(default_headers)
            .build()
            .context("Failed to build media HTTP client")?;

        // Add middleware
        let client = ClientBuilder::new(client)
            .with(retry_middleware)
            .build();

        Ok(Self {
            base_url: config.base_url,
            token: config.token,
            client_id: config.client_id,
            machine_identifier: String::new(),
            client,
            media_client,
            fetch_lock: std::sync::Arc::new(tokio::sync::Mutex::new(())),
        })
    }

    /// Perform a GET request and deserialize the JSON response.
    ///
    /// Plex wraps every response in `{"MediaContainer": <T>}`. This method
    /// automatically unwraps that envelope and returns the inner value.
    ///
    /// # Arguments
    /// * `path` - API path (e.g., "/library/sections")
    #[instrument(skip(self))]
    pub async fn get<T>(&self, path: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let url = self.build_url(path);
        debug!("GET request to {}", url);

        let response = self
            .client
            .get(&url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .send()
            .await
            .context("GET request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        let wrapper = response
            .json::<PlexApiResponse<T>>()
            .await
            .context("Failed to parse JSON response")?;

        Ok(wrapper.container)
    }

    /// Fetch raw response text — for non-JSON endpoints (e.g., TTML/LRC lyrics).
    pub async fn get_text(&self, path: &str) -> Result<String> {
        let url = self.build_url(path);
        let response = self.client.get(&url)
            .header("X-Plex-Token", &self.token)
            .send().await.context("GET request failed")?;
        if !response.status().is_success() {
            return Err(anyhow::anyhow!("HTTP error: {} for URL: {}", response.status(), url));
        }
        response.text().await.context("Failed to read response text")
    }

    /// Fetch raw response text — for debugging API responses in tests.
    #[cfg(test)]
    pub async fn get_raw(&self, path: &str) -> Result<String> {
        let url = self.build_url(path);
        let response = self.client.get(&url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .send().await.context("GET request failed")?;
        response.text().await.context("Failed to read response text")
    }

    /// Perform a POST request with a JSON body.
    ///
    /// Automatically unwraps the Plex `{"MediaContainer": <T>}` envelope.
    #[instrument(skip(self, body))]
    pub async fn post<T>(&self, path: &str, body: serde_json::Value) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let url = self.build_url(path);
        debug!("POST request to {}", url);

        let response = self
            .client
            .post(&url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .json(&body)
            .send()
            .await
            .context("POST request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        let wrapper = response
            .json::<PlexApiResponse<T>>()
            .await
            .context("Failed to parse JSON response")?;

        Ok(wrapper.container)
    }

    /// Perform a PUT request with a JSON body
    ///
    /// # Arguments
    /// * `path` - API path
    /// * `body` - Request body to serialize as JSON
    ///
    /// # Returns
    /// * `Result<T>` - The deserialized response or an error
    #[instrument(skip(self, body))]
    pub async fn put<T>(&self, path: &str, body: serde_json::Value) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let url = self.build_url(path);
        debug!("PUT request to {}", url);
        debug!("Request body: {}", body);

        let response = self
            .client
            .put(&url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .json(&body)
            .send()
            .await
            .context("PUT request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        let json = response
            .json::<T>()
            .await
            .context("Failed to parse JSON response")?;

        Ok(json)
    }

    /// Perform a POST request with query parameters and no body.
    ///
    /// Automatically unwraps the Plex `{"MediaContainer": <T>}` envelope.
    #[instrument(skip(self))]
    pub async fn post_params<T>(&self, path: &str, params: &[(&str, &str)]) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let url = self.build_url(path);
        debug!("POST (params) request to {}", url);

        let response = self
            .client
            .post(&url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .query(params)
            .send()
            .await
            .context("POST request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        let wrapper = response
            .json::<PlexApiResponse<T>>()
            .await
            .context("Failed to parse JSON response")?;

        Ok(wrapper.container)
    }

    /// Perform a PUT request with query parameters and no body, ignoring the response body.
    #[instrument(skip(self))]
    pub async fn put_params_ok(&self, path: &str, params: &[(&str, &str)]) -> Result<()>
    {
        let url = self.build_url(path);
        debug!("PUT (params) request to {}", url);

        let response = self
            .client
            .put(&url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .query(params)
            .send()
            .await
            .context("PUT request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        Ok(())
    }

    /// Perform a DELETE request
    ///
    /// # Arguments
    /// * `path` - API path
    ///
    /// # Returns
    /// * `Result<()>` - Success or an error
    #[instrument(skip(self))]
    pub async fn delete(&self, path: &str) -> Result<()> {
        let url = self.build_url(path);
        debug!("DELETE request to {}", url);

        let response = self
            .client
            .delete(&url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .send()
            .await
            .context("DELETE request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        Ok(())
    }

    /// Perform a GET request against a pre-built full URL (no `build_url` call).
    ///
    /// Use this when you already have the complete URL including query params.
    /// Like `get()`, automatically unwraps the Plex `{"MediaContainer": <T>}` envelope.
    #[instrument(skip(self))]
    pub async fn get_url<T>(&self, url: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        debug!("GET request to {}", url);

        let response = self
            .client
            .get(url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .send()
            .await
            .context("GET request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        let wrapper = response
            .json::<PlexApiResponse<T>>()
            .await
            .context("Failed to parse JSON response")?;

        Ok(wrapper.container)
    }

    /// Get cloneable handles for streaming audio fetches.
    ///
    /// Returns the fetch serialization lock, the no-pool HTTP client, and the
    /// Plex token. The caller can move these into an async task to hold the lock
    /// for the duration of a streaming download.
    pub fn media_fetch_parts(
        &self,
    ) -> (
        std::sync::Arc<tokio::sync::Mutex<()>>,
        reqwest::Client,
        String,
    ) {
        (
            self.fetch_lock.clone(),
            self.media_client.clone(),
            self.token.clone(),
        )
    }

    /// Fetch the raw response body bytes for a pre-built full URL.
    ///
    /// Used by the audio engine to download media files for in-memory decoding.
    /// Routes through `media_client` (no connection pooling) and serializes
    /// against any other in-flight `fetch_bytes` call via `fetch_lock`. See the
    /// field docs for the rationale on both — TL;DR Plex's media endpoint hates
    /// reused pooled connections AND hates concurrent large-body downloads.
    #[instrument(skip(self))]
    pub async fn fetch_bytes(&self, url: &str) -> Result<Vec<u8>> {
        debug!("fetch_bytes: {}", url);
        let _guard = self.fetch_lock.lock().await;

        let response = self
            .media_client
            .get(url)
            .header("X-Plex-Token", &self.token)
            .send()
            .await
            .context("fetch_bytes request failed")?;

        let status = response.status();
        if !status.is_success() {
            return Err(anyhow::anyhow!("HTTP {} for URL: {}", status, url));
        }

        let bytes = response
            .bytes()
            .await
            .context("fetch_bytes failed reading body")?;
        debug!("fetch_bytes complete: {} bytes", bytes.len());
        Ok(bytes.to_vec())
    }


    /// Perform a PUT request against a pre-built full URL (no `build_url` call).
    ///
    /// Use this when the URL already contains query params (e.g. `?after=N`).
    #[instrument(skip(self, body))]
    pub async fn put_url<T>(&self, url: &str, body: serde_json::Value) -> Result<T>
    where
        T: DeserializeOwned,
    {
        debug!("PUT request to {}", url);

        let response = self
            .client
            .put(url)
            .header("X-Plex-Token", &self.token)
            .header("Accept", "application/json")
            .json(&body)
            .send()
            .await
            .context("PUT request failed")?;

        debug!("Response status: {}", response.status());

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "HTTP error: {} for URL: {}",
                response.status(),
                url
            ));
        }

        response
            .json::<T>()
            .await
            .context("Failed to parse JSON response")
    }

    /// Build a full URL from a path
    ///
    /// # Arguments
    /// * `path` - API path (e.g., "/library/sections")
    ///
    /// # Returns
    /// * `String` - The full URL
    pub fn build_url(&self, path: &str) -> String {
        let base = self.base_url.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        let url = format!("{}/{}", base, path);
        // Always request loudness ramps so crossfade data is available
        if url.contains('?') {
            format!("{}&includeLoudnessRamps=1", url)
        } else {
            format!("{}?includeLoudnessRamps=1", url)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_url() {
        let client = PlexClient::new(PlexClientConfig {
            base_url: "http://localhost:32400".to_string(),
            token: "test-token".to_string(),
            ..Default::default()
        }).unwrap();

        assert_eq!(client.build_url("/library/sections"), "http://localhost:32400/library/sections?includeLoudnessRamps=1");
        assert_eq!(client.build_url("library/sections"), "http://localhost:32400/library/sections?includeLoudnessRamps=1");
        // Paths with existing query params get & instead of ?
        assert_eq!(client.build_url("/library/metadata/123?type=audio"), "http://localhost:32400/library/metadata/123?type=audio&includeLoudnessRamps=1");
    }

    #[test]
    fn test_client_creation() {
        let result = PlexClient::new(PlexClientConfig {
            base_url: "http://localhost:32400".to_string(),
            token: "test-token".to_string(),
            ..Default::default()
        });

        assert!(result.is_ok());
    }
}
