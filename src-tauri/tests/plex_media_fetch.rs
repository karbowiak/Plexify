//! Configuration probe for Plex media-file downloads.
//!
//! Plex's media-file endpoint hangs up on reqwest mid-body with "end of file
//! before message length reached" while HTMLAudioElement on the same Mac
//! downloads it cleanly. This test runs the same URL through several reqwest
//! configurations to find which combination Plex actually likes, so we can
//! apply that config to `PlexClient::fetch_bytes`.
//!
//! Usage (skips silently if PLEX_MEDIA_TEST_URL isn't set):
//!
//!   PLEX_MEDIA_TEST_URL='https://your-server.plex.direct:32400/library/parts/.../file.flac?X-Plex-Token=...' \
//!     cargo test --test plex_media_fetch -- --nocapture --test-threads=1
//!
//! Run from `src-tauri/`. The URL must already include the token (since we're
//! testing the raw HTTP layer, not the PlexClient wrapper).

use std::time::{Duration, Instant};

use futures::StreamExt;

const APPLE_COREMEDIA_UA: &str =
    "AppleCoreMedia/1.0.0.22F76 (Macintosh; U; Intel Mac OS X 13_4; en_us)";

fn test_url() -> Option<String> {
    std::env::var("PLEX_MEDIA_TEST_URL").ok()
}

/// Run a fetch + body read with a specific client and report the outcome.
/// Always succeeds as a test (the goal is to *report*, not to assert) so the
/// runner shows results from all configurations even when some fail.
async fn probe(label: &str, client: reqwest::Client, url: &str, send_range: bool) {
    let started = Instant::now();
    let mut req = client.get(url);
    if send_range {
        req = req.header("Range", "bytes=0-");
    }
    let send_result = req.send().await;
    let response = match send_result {
        Ok(r) => r,
        Err(e) => {
            println!(
                "[{:<22}] REQ-ERR  elapsed={:?}  err={:#}",
                label,
                started.elapsed(),
                e,
            );
            return;
        }
    };

    let status = response.status();
    let content_length = response.content_length();
    let version = format!("{:?}", response.version());

    match response.bytes().await {
        Ok(bytes) => {
            println!(
                "[{:<22}] OK       http={}  status={}  content_length={:?}  got={} bytes  elapsed={:?}",
                label,
                version,
                status,
                content_length,
                bytes.len(),
                started.elapsed(),
            );
        }
        Err(e) => {
            println!(
                "[{:<22}] BODY-ERR http={}  status={}  content_length={:?}  elapsed={:?}  err={:#}",
                label,
                version,
                status,
                content_length,
                started.elapsed(),
                e,
            );
        }
    }
}

/// Variant of `probe` that reads the body chunk-by-chunk via bytes_stream
/// instead of `.bytes()`. Different code path inside hyper, may behave
/// differently when the connection is fragile.
async fn probe_streamed(label: &str, client: reqwest::Client, url: &str, send_range: bool) {
    let started = Instant::now();
    let mut req = client.get(url);
    if send_range {
        req = req.header("Range", "bytes=0-");
    }
    let response = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            println!(
                "[{:<22}] REQ-ERR  elapsed={:?}  err={:#}",
                label,
                started.elapsed(),
                e,
            );
            return;
        }
    };

    let status = response.status();
    let content_length = response.content_length();
    let version = format!("{:?}", response.version());

    let mut total = 0usize;
    let mut stream = response.bytes_stream();
    loop {
        match stream.next().await {
            Some(Ok(chunk)) => total += chunk.len(),
            Some(Err(e)) => {
                println!(
                    "[{:<22}] STREAM-ERR http={}  status={}  content_length={:?}  got={} bytes  elapsed={:?}  err={:#}",
                    label,
                    version,
                    status,
                    content_length,
                    total,
                    started.elapsed(),
                    e,
                );
                return;
            }
            None => {
                println!(
                    "[{:<22}] OK       http={}  status={}  content_length={:?}  got={} bytes  elapsed={:?}",
                    label,
                    version,
                    status,
                    content_length,
                    total,
                    started.elapsed(),
                );
                return;
            }
        }
    }
}

fn base_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(0) // fresh connection per request — isolates pooling effects
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_default() {
    let Some(url) = test_url() else {
        eprintln!("skipping: PLEX_MEDIA_TEST_URL not set");
        return;
    };
    let client = base_builder().build().unwrap();
    probe("default", client, &url, false).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_default_with_range() {
    let Some(url) = test_url() else { return };
    let client = base_builder().build().unwrap();
    probe("default+range", client, &url, true).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_http1_only() {
    let Some(url) = test_url() else { return };
    let client = base_builder().http1_only().build().unwrap();
    probe("http1_only", client, &url, false).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_http1_only_with_range() {
    let Some(url) = test_url() else { return };
    let client = base_builder().http1_only().build().unwrap();
    probe("http1_only+range", client, &url, true).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_http1_apple_ua() {
    let Some(url) = test_url() else { return };
    let client = base_builder()
        .http1_only()
        .user_agent(APPLE_COREMEDIA_UA)
        .build()
        .unwrap();
    probe("http1+apple_ua", client, &url, true).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_default_apple_ua() {
    let Some(url) = test_url() else { return };
    let client = base_builder()
        .user_agent(APPLE_COREMEDIA_UA)
        .build()
        .unwrap();
    probe("default+apple_ua", client, &url, true).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_streamed_default() {
    let Some(url) = test_url() else { return };
    let client = base_builder().build().unwrap();
    probe_streamed("streamed_default", client, &url, true).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn probe_streamed_http1() {
    let Some(url) = test_url() else { return };
    let client = base_builder().http1_only().build().unwrap();
    probe_streamed("streamed_http1", client, &url, true).await;
}

/// Reproduce the *production* scenario for the new media_client: two concurrent
/// `fetch_bytes` calls against Plex on the same `pool_max_idle_per_host(0)`
/// client (active track + preloaded next track, both kicked off back-to-back).
/// One unit test at a time succeeds; the production app fails the first one.
/// Hypothesis: concurrency on the no-pool client causes one of the fetches to
/// see a corrupted body or get a connection that's somehow shared/closed.
#[tokio::test(flavor = "multi_thread")]
async fn probe_concurrent_no_pool() {
    let Some(url) = test_url() else { return };

    // Match production media_client config exactly
    let client = reqwest::Client::builder()
        .pool_max_idle_per_host(0)
        .timeout(Duration::from_secs(120))
        .danger_accept_invalid_certs(true)
        .build()
        .unwrap();

    // Two concurrent fetches, like active + preload in the audio engine
    let c1 = client.clone();
    let c2 = client.clone();
    let u1 = url.clone();
    let u2 = url.clone();
    let h1 = tokio::spawn(async move { probe("concurrent[1]", c1, &u1, false).await });
    let h2 = tokio::spawn(async move { probe("concurrent[2]", c2, &u2, false).await });
    let _ = tokio::join!(h1, h2);
}

/// Reproduce the **actual** production scenario: two concurrent fetches of
/// **different** Plex media files. The audio engine fires `fetch_bytes` for
/// the active track AND immediately starts a preload for the next track
/// against a different part_key. The earlier `probe_concurrent_no_pool` test
/// only fetched the same URL twice — Plex serves the second hit from its
/// in-memory cache, which masks whatever this bug actually is.
///
/// Set both env vars (token shared by default with PLEX_MEDIA_TEST_URL):
///   PLEX_MEDIA_TEST_URL_A='https://...file.flac?X-Plex-Token=...'
///   PLEX_MEDIA_TEST_URL_B='https://...file.flac?X-Plex-Token=...'
#[tokio::test(flavor = "multi_thread")]
async fn probe_concurrent_two_files() {
    let url_a = match std::env::var("PLEX_MEDIA_TEST_URL_A").ok() {
        Some(u) => u,
        None => return,
    };
    let url_b = match std::env::var("PLEX_MEDIA_TEST_URL_B").ok() {
        Some(u) => u,
        None => return,
    };

    // Match the *exact* current production fetch_bytes config: fresh client
    // per call, no pool, no headers beyond what reqwest sends by default.
    let make_client = || {
        reqwest::Client::builder()
            .pool_max_idle_per_host(0)
            .timeout(Duration::from_secs(120))
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap()
    };

    let h1 = tokio::spawn(async move { probe("two_files[A]", make_client(), &url_a, false).await });
    let h2 = tokio::spawn(async move { probe("two_files[B]", make_client(), &url_b, false).await });
    let _ = tokio::join!(h1, h2);
}

/// Same as above but with pooling enabled (matching the OLD client config).
/// Used to compare whether disabling pool actually changes anything for the
/// concurrent case.
#[tokio::test(flavor = "multi_thread")]
async fn probe_concurrent_pooled() {
    let Some(url) = test_url() else { return };

    let client = reqwest::Client::builder()
        .pool_max_idle_per_host(100)
        .timeout(Duration::from_secs(120))
        .danger_accept_invalid_certs(true)
        .build()
        .unwrap();

    let c1 = client.clone();
    let c2 = client.clone();
    let u1 = url.clone();
    let u2 = url.clone();
    let h1 = tokio::spawn(async move { probe("pooled-concurrent[1]", c1, &u1, false).await });
    let h2 = tokio::spawn(async move { probe("pooled-concurrent[2]", c2, &u2, false).await });
    let _ = tokio::join!(h1, h2);
}

/// Reproduce the production scenario: a SHARED client with the same connection
/// pooling settings PlexClient uses (`pool_max_idle_per_host(100)`), which has
/// already been used for several smaller requests. The hypothesis is that the
/// reqwest pool is handing out a stale, server-closed connection when the
/// later media fetch finally runs.
#[tokio::test(flavor = "multi_thread")]
async fn probe_pooled_after_warmup() {
    let Some(url) = test_url() else { return };

    // Match PlexClient's actual reqwest config: 100 max idle per host, NO
    // explicit http1_only, default user-agent. Single shared client across
    // every request, just like the production code.
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(100)
        .build()
        .unwrap();

    // Derive an API URL from the media URL: same origin, replace the file
    // path with /identity (a small, always-200 Plex endpoint). Keep the
    // query string for the token.
    let api_url = {
        let parsed = reqwest::Url::parse(&url).unwrap();
        let scheme = parsed.scheme();
        let host = parsed.host_str().unwrap();
        let port = parsed.port().unwrap_or(32400);
        let token = parsed
            .query_pairs()
            .find(|(k, _)| k == "X-Plex-Token")
            .map(|(_, v)| v.into_owned())
            .unwrap_or_default();
        format!("{}://{}:{}/identity?X-Plex-Token={}", scheme, host, port, token)
    };

    // Warm up the pool with a handful of small requests.
    for i in 0..5 {
        let started = Instant::now();
        match client.get(&api_url).send().await {
            Ok(r) => {
                let status = r.status();
                let body = r.bytes().await;
                println!(
                    "[pool warmup {}      ] status={} bytes={:?} elapsed={:?}",
                    i,
                    status,
                    body.as_ref().map(|b| b.len()),
                    started.elapsed(),
                );
            }
            Err(e) => {
                println!("[pool warmup {}      ] ERR elapsed={:?} err={:#}", i, started.elapsed(), e);
            }
        }
    }

    // Now wait long enough for Plex's server-side keepalive to fire on
    // the pooled idle connection. Plex's default is around 5-15s.
    let idle_secs = 20;
    println!("[pool warmup          ] sleeping {}s to let pool go stale...", idle_secs);
    tokio::time::sleep(Duration::from_secs(idle_secs)).await;

    // Now hit the media URL through the same (now-likely-stale) pool.
    probe("pooled_after_warmup", client, &url, true).await;
}
