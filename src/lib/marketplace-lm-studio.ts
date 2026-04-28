import type { LlmMessage } from './backpack-lm-studio'

const DEFAULT_MARKETPLACE_LLM_API_BASE_URL = 'http://192.168.0.13:1234/v1'
const DEFAULT_MARKETPLACE_LLM_MODEL = 'xiaomi-mimo-vl-miloco-7b'

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '')
}

export function getMarketplaceLlmBaseUrl(): string {
  return cleanBaseUrl(
    process.env.MARKETPLACE_LLM_BASE_URL ||
      process.env.LLM_API_BASE_URL ||
      process.env.LM_STUDIO_BASE_URL ||
      process.env.BACKPACK_LLM_BASE_URL ||
      DEFAULT_MARKETPLACE_LLM_API_BASE_URL
  )
}

export function getMarketplaceLlmModel(): string {
  return (
    process.env.MARKETPLACE_LLM_MODEL ||
    process.env.LLM_MODEL ||
    process.env.LM_STUDIO_MODEL ||
    process.env.BACKPACK_LLM_MODEL ||
    DEFAULT_MARKETPLACE_LLM_MODEL
  )
}

export function getMarketplaceLlmMaxResponseTokens(): number {
  const raw =
    process.env.MARKETPLACE_LLM_MAX_RESPONSE_TOKENS ||
    process.env.LLM_MAX_TOKENS ||
    process.env.BACKPACK_LLM_MAX_RESPONSE_TOKENS ||
    '512'
  const n = parseInt(raw, 10)
  if (raw.trim() === '-1') return -1
  if (!Number.isFinite(n) || n < 64) return 512
  return Math.min(n, 4096)
}

function getMarketplaceLlmRequestTimeoutMs(): number {
  const explicitMs = parseInt(
    process.env.MARKETPLACE_LLM_REQUEST_TIMEOUT_MS || '',
    10
  )
  if (Number.isFinite(explicitMs) && explicitMs >= 30_000) {
    return Math.min(explicitMs, 600_000)
  }

  const seconds = parseFloat(process.env.LLM_HTTP_TIMEOUT || '300')
  if (Number.isFinite(seconds) && seconds >= 30) {
    return Math.min(seconds * 1000, 600_000)
  }

  return 300_000
}

function extractAssistantText(data: {
  choices?: {
    message?: {
      content?: unknown
      reasoning_content?: unknown
      thinking?: unknown
    }
  }[]
}): string | null {
  const msg = data.choices?.[0]?.message
  const raw = msg?.content ?? msg?.reasoning_content ?? msg?.thinking
  if (raw == null) return null
  const text = String(raw).trim()
  return text.length > 0 ? text : null
}

export async function marketplaceLlmChat(params: {
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const base = getMarketplaceLlmBaseUrl()
  const apiKey =
    process.env.MARKETPLACE_LLM_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.LM_STUDIO_API_KEY ||
    process.env.BACKPACK_LLM_API_KEY

  const body: Record<string, unknown> = {
    model: getMarketplaceLlmModel(),
    messages: params.messages,
    stream: false,
    temperature: params.temperature ?? 0.45,
    max_tokens: params.maxTokens ?? getMarketplaceLlmMaxResponseTokens()
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }

  const timeoutMs = getMarketplaceLlmRequestTimeoutMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${base}/chat/completions`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Timeout (${timeoutMs / 1000}s) llamando a LM Studio Marketplace.`
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }

  const rawText = await res.text()
  let data: {
    error?: { message?: string }
    choices?: {
      message?: {
        content?: unknown
        reasoning_content?: unknown
        thinking?: unknown
      }
    }[]
  } = {}
  try {
    data = JSON.parse(rawText) as typeof data
  } catch {
    /* LM Studio debe responder JSON OpenAI-compatible. */
  }

  if (!res.ok) {
    const snippet = rawText.slice(0, 400).replace(/\s+/g, ' ')
    throw new Error(data.error?.message || snippet || res.statusText)
  }

  const text = extractAssistantText(data)
  if (!text) {
    throw new Error('El modelo devolvio una respuesta vacia')
  }
  return text
}
