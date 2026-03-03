import { create } from "zustand"
import { persist } from "zustand/middleware"
import { idbJSONStorage } from "./idbStorage"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiProvider = "openrouter" | "openai" | "ollama"

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  ollama: "Ollama",
}

export const PROVIDER_DESCRIPTIONS: Record<AiProvider, string> = {
  openrouter: "Access hundreds of models through a single API key",
  openai: "Use OpenAI models directly (GPT-4o, GPT-4o-mini, etc.)",
  ollama: "Run models locally with Ollama (no API key needed)",
}

export const DEFAULT_BASE_URLS: Record<AiProvider, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434/v1",
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openrouter: "anthropic/claude-sonnet-4",
  openai: "gpt-4o-mini",
  ollama: "llama3.2",
}

export interface AiModel {
  id: string
  name: string
}

/** Well-known models per provider (user can also type a custom ID). */
export const POPULAR_MODELS: Record<AiProvider, AiModel[]> = {
  openrouter: [
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
    { id: "anthropic/claude-haiku-4", name: "Claude Haiku 4" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "mistralai/mistral-small-3.2", name: "Mistral Small 3.2" },
  ],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
    { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
  ],
  ollama: [
    { id: "llama3.2", name: "Llama 3.2" },
    { id: "llama3.2:1b", name: "Llama 3.2 1B" },
    { id: "mistral", name: "Mistral 7B" },
    { id: "gemma2", name: "Gemma 2" },
    { id: "qwen2.5", name: "Qwen 2.5" },
    { id: "phi3", name: "Phi-3" },
  ],
}

// ---------------------------------------------------------------------------
// RAG indexing state
// ---------------------------------------------------------------------------

export type RagIndexStatus = "idle" | "indexing" | "ready" | "error"

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AiState {
  // Provider configuration
  provider: AiProvider
  apiKey: string
  baseUrl: string
  model: string

  // Feature toggles
  lyricsTranslationEnabled: boolean
  ragEnabled: boolean

  // RAG state
  ragStatus: RagIndexStatus
  ragDocumentCount: number
  ragLastIndexedAt: number | null
  ragError: string | null

  // Connection test
  isTestingConnection: boolean
  connectionTestResult: "success" | "error" | null
  connectionTestError: string | null

  // Actions
  setProvider: (provider: AiProvider) => void
  setApiKey: (key: string) => void
  setBaseUrl: (url: string) => void
  setModel: (model: string) => void
  setLyricsTranslationEnabled: (enabled: boolean) => void
  setRagEnabled: (enabled: boolean) => void
  setRagStatus: (status: RagIndexStatus) => void
  setRagDocumentCount: (count: number) => void
  setRagLastIndexedAt: (at: number | null) => void
  setRagError: (error: string | null) => void
  testConnection: () => Promise<void>

  /** True if enough config exists to make AI calls. */
  isConfigured: () => boolean
}

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      provider: "openrouter",
      apiKey: "",
      baseUrl: DEFAULT_BASE_URLS.openrouter,
      model: DEFAULT_MODELS.openrouter,

      lyricsTranslationEnabled: true,
      ragEnabled: true,

      ragStatus: "idle",
      ragDocumentCount: 0,
      ragLastIndexedAt: null,
      ragError: null,

      isTestingConnection: false,
      connectionTestResult: null,
      connectionTestError: null,

      setProvider: (provider) => {
        const current = get()
        // Reset base URL and model to defaults when switching providers,
        // but only if the user hasn't customized them for the new provider.
        const newBaseUrl = DEFAULT_BASE_URLS[provider]
        const newModel = DEFAULT_MODELS[provider]
        set({
          provider,
          baseUrl: current.baseUrl === DEFAULT_BASE_URLS[current.provider] ? newBaseUrl : newBaseUrl,
          model: current.model === DEFAULT_MODELS[current.provider] ? newModel : newModel,
          connectionTestResult: null,
          connectionTestError: null,
        })
      },

      setApiKey: (apiKey) => set({ apiKey, connectionTestResult: null, connectionTestError: null }),
      setBaseUrl: (baseUrl) => set({ baseUrl, connectionTestResult: null, connectionTestError: null }),
      setModel: (model) => set({ model }),
      setLyricsTranslationEnabled: (lyricsTranslationEnabled) => set({ lyricsTranslationEnabled }),
      setRagEnabled: (ragEnabled) => set({ ragEnabled }),
      setRagStatus: (ragStatus) => set({ ragStatus }),
      setRagDocumentCount: (ragDocumentCount) => set({ ragDocumentCount }),
      setRagLastIndexedAt: (ragLastIndexedAt) => set({ ragLastIndexedAt }),
      setRagError: (ragError) => set({ ragError }),

      testConnection: async () => {
        const { provider, apiKey, baseUrl, model } = get()
        if (provider !== "ollama" && !apiKey) {
          set({ connectionTestResult: "error", connectionTestError: "API key is required" })
          return
        }

        set({ isTestingConnection: true, connectionTestResult: null, connectionTestError: null })
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" }
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`
          }
          if (provider === "openrouter") {
            headers["HTTP-Referer"] = "https://plexify.app"
            headers["X-Title"] = "Plexify"
          }

          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
              max_tokens: 5,
            }),
          })

          if (!res.ok) {
            const body = await res.text().catch(() => "")
            throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`)
          }

          set({ connectionTestResult: "success", connectionTestError: null })
        } catch (err) {
          set({ connectionTestResult: "error", connectionTestError: String(err) })
        } finally {
          set({ isTestingConnection: false })
        }
      },

      isConfigured: () => {
        const { provider, apiKey, baseUrl, model } = get()
        if (!baseUrl || !model) return false
        if (provider === "ollama") return true
        return !!apiKey
      },
    }),
    {
      name: "plexify-ai-settings-v1",
      storage: idbJSONStorage,
      partialize: (state) => ({
        provider: state.provider,
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        model: state.model,
        lyricsTranslationEnabled: state.lyricsTranslationEnabled,
        ragEnabled: state.ragEnabled,
        ragDocumentCount: state.ragDocumentCount,
        ragLastIndexedAt: state.ragLastIndexedAt,
      }),
    },
  ),
)
