import { useState } from "react"
import { open } from "@tauri-apps/plugin-shell"
import { useLastfmStore } from "./authStore"
import { useLastfmMetadataStore } from "./store"
import { lastfmSaveCredentials, lastfmGetToken } from "./api"

type LastfmAuthStep = "idle" | "waiting"

export function LastfmSettings() {
  const {
    isAuthenticated, isEnabled, username, loveThreshold,
    setEnabled, completeAuth, disconnect, setLoveThreshold,
  } = useLastfmStore()

  const lastfmMetadata = useLastfmMetadataStore()
  const lastfmStats = lastfmMetadata.stats()

  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [authStep, setAuthStep] = useState<LastfmAuthStep>("idle")
  const [pendingToken, setPendingToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function handleConnect() {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError("Please enter both API Key and API Secret.")
      return
    }
    setError(null)
    setIsConnecting(true)
    try {
      await lastfmSaveCredentials(apiKey.trim(), apiSecret.trim())
      const { token, auth_url } = await lastfmGetToken()
      setPendingToken(token)
      await open(auth_url)
      setAuthStep("waiting")
    } catch (e) {
      setError(String(e))
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleComplete() {
    setError(null)
    setIsConnecting(true)
    try {
      await completeAuth(pendingToken)
      setAuthStep("idle")
      setPendingToken("")
      setApiKey("")
      setApiSecret("")
    } catch (e) {
      setError(`Could not complete auth: ${String(e)}`)
    } finally {
      setIsConnecting(false)
    }
  }

  function handleCancel() {
    setAuthStep("idle")
    setPendingToken("")
    setError(null)
  }

  function handleClearCache() {
    setClearing(true)
    lastfmMetadata.clearCache()
    setTimeout(() => setClearing(false), 400)
  }

  const thresholdStars = Math.round(loveThreshold / 2)

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Account & Auth */}
      <div className="space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/30">Account</h2>

        {!isAuthenticated ? (
          authStep === "idle" ? (
            <div className="space-y-4">
              <p className="text-sm text-white/50">
                Connect your Last.fm account to enable scrobbling and metadata enrichment.{" "}
                <button
                  className="text-accent/80 hover:text-accent underline-offset-2 hover:underline"
                  onClick={() => void open("https://www.last.fm/api/account/create")}
                >
                  Get your free API key
                </button>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/50">API Key</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="32-character hex key"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-accent/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/50">API Secret</label>
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={e => setApiSecret(e.target.value)}
                    placeholder="32-character secret"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-accent/50 focus:outline-none"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                onClick={() => void handleConnect()}
                disabled={isConnecting || !apiKey.trim() || !apiSecret.trim()}
                className="rounded-lg bg-accent/80 hover:bg-accent px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Opening browser..." : "Connect to Last.fm"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                <p className="text-sm font-medium text-white">Complete Connection</p>
                <ol className="text-sm text-white/60 space-y-1 list-decimal list-inside">
                  <li>Approve the request in your browser.</li>
                  <li>Return here and click <strong className="text-white">Complete</strong>.</li>
                </ol>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => void handleComplete()}
                  disabled={isConnecting}
                  className="rounded-lg bg-accent/80 hover:bg-accent px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  {isConnecting ? "Connecting..." : "Complete Connection"}
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:border-white/25 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-bold">
                lfm
              </div>
              <div>
                <p className="text-sm font-medium text-white">{username}</p>
                <p className="text-xs text-white/40">Connected to Last.fm</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-white">Scrobbling</p>
                <p className="text-xs text-white/40">Report what you're listening to Last.fm</p>
              </div>
              <button
                onClick={() => void setEnabled(!isEnabled)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isEnabled ? "bg-accent" : "bg-white/20"
                }`}
                role="switch"
                aria-checked={isEnabled}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {isEnabled && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-white">Love tracks rated ≥</p>
                  <p className="text-xs text-white/40">Automatically love/unlove tracks on Last.fm when rated</p>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      title={`${star} star${star > 1 ? "s" : ""}`}
                      onClick={() => void setLoveThreshold(star * 2)}
                      className={`transition-colors ${thresholdStars >= star ? "text-accent" : "text-white/20 hover:text-accent/50"}`}
                    >
                      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                        <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => void disconnect()}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Cache */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/30 mb-4">Metadata Cache</h2>
        <div className="rounded-xl border border-white/10 bg-white/3 divide-y divide-white/5">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-white/60">Artists</span>
            <span className="text-sm font-medium text-white tabular-nums">{lastfmStats.artistCount}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-white/60">Albums</span>
            <span className="text-sm font-medium text-white tabular-nums">{lastfmStats.albumCount}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-white/60">Tracks</span>
            <span className="text-sm font-medium text-white tabular-nums">{lastfmStats.trackCount}</span>
          </div>
        </div>
        <button
          onClick={handleClearCache}
          disabled={clearing || (lastfmStats.artistCount + lastfmStats.albumCount + lastfmStats.trackCount === 0)}
          className="mt-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:border-white/20 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {clearing ? "Cleared" : "Clear Cache"}
        </button>
      </div>
    </div>
  )
}
