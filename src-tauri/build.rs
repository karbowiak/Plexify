fn main() {
    // Forward PI_KEY / PI_SECRET to the compiler.
    // Reads from process env first (CI), falls back to ../.env (local dev).
    println!("cargo:rerun-if-changed=../.env");
    println!("cargo:rerun-if-env-changed=PI_KEY");
    println!("cargo:rerun-if-env-changed=PI_SECRET");

    let dotenv = std::fs::read_to_string("../.env").unwrap_or_default();
    for key in ["PI_KEY", "PI_SECRET"] {
        if std::env::var(key).is_ok() {
            // Already in process env (CI / shell export) — cargo picks it up via env!().
            continue;
        }
        // Parse from ../.env
        for line in dotenv.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                if k.trim() == key {
                    println!("cargo:rustc-env={}={}", key, v.trim());
                }
            }
        }
    }

    tauri_build::build()
}
