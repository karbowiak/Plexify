//! Shared rate limiter + retry logic for all iTunes Search API calls.
//!
//! iTunes rate-limits at ~20 req/min per IP. This module enforces a minimum
//! 500ms gap between requests (~2/sec, well under the limit) and retries on
//! transient errors (429/503) with exponential backoff.
//!
//! 403 is NOT retried — it indicates a persistent ban where retrying makes
//! things worse.

use anyhow::{bail, Context, Result};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Shared HTTP client for all iTunes API calls.
static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .expect("Failed to build iTunes throttle HTTP client")
});

/// Minimum gap between consecutive iTunes requests.
static LAST_REQUEST: Lazy<Mutex<Instant>> =
    Lazy::new(|| Mutex::new(Instant::now() - Duration::from_secs(1)));

const MIN_GAP: Duration = Duration::from_millis(500);
const MAX_RETRIES: u32 = 3;
const BASE_BACKOFF: Duration = Duration::from_secs(2);

/// Wait until at least `MIN_GAP` has elapsed since the last request, then
/// update the timestamp.
async fn throttle() {
    let wait = {
        let mut last = LAST_REQUEST.lock().unwrap();
        let elapsed = last.elapsed();
        let wait = if elapsed < MIN_GAP {
            MIN_GAP - elapsed
        } else {
            Duration::ZERO
        };
        *last = Instant::now() + wait;
        wait
    };
    if !wait.is_zero() {
        tokio::time::sleep(wait).await;
    }
}

/// Single entry point for all iTunes Search API GET requests.
///
/// Applies throttling (500ms gap) and retries on 429/503 with exponential
/// backoff. Respects `Retry-After` header when present.
pub async fn itunes_get(
    url: &str,
    query: &[(&str, &str)],
) -> Result<reqwest::Response> {
    let mut attempt = 0u32;

    loop {
        throttle().await;

        let resp = CLIENT
            .get(url)
            .query(query)
            .send()
            .await
            .context("iTunes request failed")?;

        let status = resp.status();

        if status.is_success() {
            return Ok(resp);
        }

        // 403 = persistent ban, don't retry
        if status == reqwest::StatusCode::FORBIDDEN {
            bail!("iTunes returned 403 Forbidden — rate limit ban, not retrying");
        }

        // 429 or 503 = transient, retry with backoff
        if (status == reqwest::StatusCode::TOO_MANY_REQUESTS
            || status == reqwest::StatusCode::SERVICE_UNAVAILABLE)
            && attempt < MAX_RETRIES
        {
            attempt += 1;

            // Respect Retry-After header if present (seconds)
            let retry_after = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .map(Duration::from_secs);

            let backoff = retry_after
                .unwrap_or(BASE_BACKOFF * 2u32.pow(attempt - 1));

            tracing::warn!(
                "iTunes {} (attempt {}/{}), backing off {:?}",
                status,
                attempt,
                MAX_RETRIES,
                backoff,
            );

            tokio::time::sleep(backoff).await;
            continue;
        }

        // Other error status — propagate immediately
        bail!(
            "iTunes returned {} {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or("Unknown")
        );
    }
}
