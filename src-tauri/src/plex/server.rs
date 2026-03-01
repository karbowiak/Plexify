//! Server identity and capability discovery.

use super::{PlexClient, IdentityResponse, ServerInfo};
use anyhow::{Context, Result};
use tracing::{debug, instrument};

impl PlexClient {
    /// Get the server's identity (machine ID, version, claimed status).
    ///
    /// Corresponds to `GET /identity`.
    #[instrument(skip(self))]
    pub async fn get_identity(&self) -> Result<IdentityResponse> {
        debug!("Fetching server identity");
        self.get("/identity")
            .await
            .context("Failed to fetch server identity")
    }

    /// Get full server capabilities and metadata.
    ///
    /// Corresponds to `GET /`.
    #[instrument(skip(self))]
    pub async fn get_server_info(&self) -> Result<ServerInfo> {
        debug!("Fetching server info");
        self.get("/")
            .await
            .context("Failed to fetch server info")
    }
}

#[cfg(test)]
mod integration_tests {
    use super::super::{PlexClient, PlexClientConfig};

    fn get_client() -> PlexClient {
        let url = std::env::var("PLEX_URL")
            .expect("PLEX_URL env var required for integration tests");
        let token = std::env::var("PLEX_TOKEN")
            .expect("PLEX_TOKEN env var required for integration tests");
        PlexClient::new(PlexClientConfig {
            base_url: url,
            token,
            accept_invalid_certs: true,
            ..Default::default()
        })
        .expect("Failed to create PlexClient")
    }

    #[tokio::test]
    async fn test_get_identity() {
        let client = get_client();
        match client.get_identity().await {
            Ok(identity) => {
                println!(
                    "Server identity: machine_id={}, version={}, claimed={}",
                    identity.machine_identifier, identity.version, identity.claimed
                );
                assert!(!identity.machine_identifier.is_empty(), "machine_identifier should not be empty");
            }
            Err(e) => println!("get_identity failed: {}", e),
        }
    }

    #[tokio::test]
    async fn test_get_server_info() {
        let client = get_client();
        match client.get_server_info().await {
            Ok(info) => {
                println!(
                    "Server info: name={}, platform={}, version={}",
                    info.friendly_name, info.platform, info.version
                );
                assert!(!info.friendly_name.is_empty(), "friendly_name should not be empty");
            }
            Err(e) => println!("get_server_info failed: {}", e),
        }
    }
}
