/**
 * OpenAI-compatible AI client.
 *
 * Works with OpenAI, OpenRouter, and Ollama — all three expose the same
 * `/v1/chat/completions` endpoint format.
 */

import { useAiStore } from "../stores/aiStore"
import type { AiProvider } from "../stores/aiStore"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ToolFunction {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface Tool {
  type: "function"
  function: ToolFunction
}

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface ChatChoice {
  index: number
  message: {
    role: "assistant"
    content: string | null
    tool_calls?: ToolCall[]
  }
  finish_reason: string
}

export interface ChatCompletionResponse {
  id: string
  choices: ChatChoice[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHeaders(provider: AiProvider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`
  }
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://plexify.app"
    headers["X-Title"] = "Plexify"
  }
  return headers
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/** Send a chat completion request and return the full response. */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: {
    model?: string
    maxTokens?: number
    temperature?: number
    tools?: Tool[]
    toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } }
  },
): Promise<ChatCompletionResponse> {
  const { provider, apiKey, baseUrl, model } = useAiStore.getState()

  const body: Record<string, unknown> = {
    model: opts?.model ?? model,
    messages,
  }
  if (opts?.maxTokens) body.max_tokens = opts.maxTokens
  if (opts?.temperature !== undefined) body.temperature = opts.temperature
  if (opts?.tools) {
    body.tools = opts.tools
    body.tool_choice = opts.toolChoice ?? "auto"
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: getHeaders(provider, apiKey),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`AI request failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`)
  }

  return res.json()
}

/** Simple helper: send messages and return the text content of the first choice. */
export async function ask(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const response = await chatCompletion(messages, opts)
  return response.choices[0]?.message?.content ?? ""
}

// ---------------------------------------------------------------------------
// Lyrics translation
// ---------------------------------------------------------------------------

export interface TranslatedLyricLine {
  original: string
  romanized: string | null
  translated: string | null
}

/**
 * Detect whether a string contains non-Latin characters that would benefit
 * from romanization (Japanese, Chinese, Korean, Thai, Arabic, Cyrillic, etc.).
 */
export function hasNonLatinScript(text: string): boolean {
  // Match CJK, Hangul, Thai, Arabic, Devanagari, Cyrillic, and other non-Latin blocks
  return /[\u3000-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F\u0600-\u06FF\u0900-\u097F\u0400-\u04FF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF]/.test(text)
}

/**
 * Translate and romanize lyrics using a single AI call.
 *
 * Accepts an array of lyric lines. Returns the same number of translated lines.
 * Only processes lines that contain non-Latin text. Lines that are already Latin
 * are returned as-is with null romanized/translated fields.
 */
export async function translateLyrics(
  lines: string[],
  trackTitle: string,
  artistName: string,
): Promise<TranslatedLyricLine[]> {
  // Find which lines need translation
  const needsTranslation = lines.map(hasNonLatinScript)
  const hasAny = needsTranslation.some(Boolean)

  if (!hasAny) {
    return lines.map((original) => ({ original, romanized: null, translated: null }))
  }

  // Build a numbered list of only the non-Latin lines
  const numberedLines: string[] = []
  const indexMap: number[] = []
  lines.forEach((line, i) => {
    if (needsTranslation[i] && line.trim()) {
      numberedLines.push(`${indexMap.length + 1}. ${line}`)
      indexMap.push(i)
    }
  })

  const systemPrompt = `You are a precise lyrics translator and romanization expert. Given song lyrics in any non-Latin script, provide:
1. Romanization (romaji for Japanese, pinyin for Chinese, romanization for Korean/Thai/Arabic/Cyrillic, etc.)
2. English translation

Use context from the song title and artist to improve accuracy of readings (especially for kanji/Chinese characters where readings depend on context).

Respond in JSON format ONLY — no markdown, no code fences, just the JSON array:
[{"n":1,"r":"romanized text","t":"english translation"},...]

Where n is the line number from the input. Keep the same line count. For instrumental or empty lines, use empty strings.`

  const userPrompt = `Song: "${trackTitle}" by ${artistName}

Lyrics to translate:
${numberedLines.join("\n")}`

  const response = await ask(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { maxTokens: 4096, temperature: 0.2 },
  )

  // Parse the AI response
  const result: TranslatedLyricLine[] = lines.map((original) => ({
    original,
    romanized: null,
    translated: null,
  }))

  try {
    // Strip markdown fences if the model wrapped it
    const cleaned = response.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed: { n: number; r: string; t: string }[] = JSON.parse(cleaned)

    for (const item of parsed) {
      const originalIdx = indexMap[item.n - 1]
      if (originalIdx !== undefined && result[originalIdx]) {
        result[originalIdx].romanized = item.r || null
        result[originalIdx].translated = item.t || null
      }
    }
  } catch {
    // If parsing fails, return without translations — don't break the UI
    console.warn("Failed to parse AI lyrics translation response:", response)
  }

  return result
}

// ---------------------------------------------------------------------------
// Playlist generation (used by RAG chat)
// ---------------------------------------------------------------------------

/**
 * Generate a playlist from an AI conversation with tool use.
 * The AI can search the RAG context to find matching tracks.
 */
export async function generatePlaylist(
  prompt: string,
  ragContext: string,
): Promise<{ title: string; description: string; trackIds: number[] }> {
  const systemPrompt = `You are Plexify's AI music curator. The user wants you to create a playlist from their music library.

You have access to a database of the user's music library. Here is the relevant context:

<music_library>
${ragContext}
</music_library>

Based on the user's request, select tracks from the library that best match their intent. Consider genre, mood, artist, album, lyrics themes, and any other relevant metadata.

Respond with a JSON object ONLY (no markdown, no code fences):
{
  "title": "A creative playlist title",
  "description": "A brief description of the playlist",
  "track_ids": [123, 456, 789]
}

The track_ids should be rating_key values from the library data. Select between 10-50 tracks unless the user specifies a different count. Order them thoughtfully for a good listening flow.`

  const response = await ask(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    { maxTokens: 4096, temperature: 0.7 },
  )

  try {
    const cleaned = response.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned)
    return {
      title: parsed.title ?? "AI Playlist",
      description: parsed.description ?? "",
      trackIds: Array.isArray(parsed.track_ids) ? parsed.track_ids : [],
    }
  } catch {
    throw new Error("Failed to parse AI playlist response")
  }
}
