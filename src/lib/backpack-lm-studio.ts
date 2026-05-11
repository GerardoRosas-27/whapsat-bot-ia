/**
 * Cliente OpenAI-compatible para LM Studio (local) u otro servidor /v1/chat/completions.
 */

export type LlmTextPart = { type: 'text'; text: string }
export type LlmImagePart = {
  type: 'image_url'
  image_url: { url: string; detail?: 'low' | 'high' | 'auto' }
}
export type LlmUserContent = string | (LlmTextPart | LlmImagePart)[]

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'user'; content: LlmUserContent }

/** BACKPACK_LLM_ENABLED=true | 1 | yes | on → usa LM Studio; cualquier otro valor → bot clásico. */
export function isBackpackLlmEnabled(): boolean {
  const v = process.env.BACKPACK_LLM_ENABLED?.toLowerCase().trim()
  return (
    v === 'true' || v === '1' || v === 'yes' || v === 'on'
  )
}

export function getLlmBaseUrl(): string {
  const raw =
    process.env.LM_STUDIO_BASE_URL ||
    process.env.BACKPACK_LLM_BASE_URL ||
    'http://localhost:1234/v1'
  return raw.replace(/\/$/, '')
}

export function getLlmModel(): string {
  return (
    process.env.LM_STUDIO_MODEL ||
    process.env.BACKPACK_LLM_MODEL ||
    'xiaomi-mimo-vl-miloco-7b'
  )
}

/**
 * Límite de tokens de la respuesta del modelo (respuestas cortas).
 * Por defecto 512; configurable con BACKPACK_LLM_MAX_RESPONSE_TOKENS.
 */
export function getLlmMaxResponseTokens(): number {
  const n = parseInt(process.env.BACKPACK_LLM_MAX_RESPONSE_TOKENS || '512', 10)
  if (!Number.isFinite(n) || n < 64) return 512
  return Math.min(n, 4096)
}

function getLlmRequestTimeoutMs(): number {
  const n = parseInt(process.env.BACKPACK_LLM_REQUEST_TIMEOUT_MS || '180000', 10)
  return Number.isFinite(n) && n >= 30_000 ? Math.min(n, 600_000) : 180_000
}

function shouldDisableReasoning(): boolean {
  const v = process.env.BACKPACK_LLM_DISABLE_REASONING?.toLowerCase().trim()
  return v !== 'false' && v !== '0' && v !== 'no' && v !== 'off'
}

export async function backpackLlmChat(params: {
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number | null
}): Promise<string> {
  const base = getLlmBaseUrl()
  const model = getLlmModel()
  const apiKey = process.env.LM_STUDIO_API_KEY || process.env.BACKPACK_LLM_API_KEY

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.6,
    stream: false
  }

  if (params.maxTokens === null) {
    body.max_tokens = -1
  } else if (params.maxTokens === undefined) {
    body.max_tokens = getLlmMaxResponseTokens()
  } else {
    body.max_tokens = params.maxTokens
  }

  if (shouldDisableReasoning()) {
    body.reasoning_effort = 'none'
    body.reasoning = { effort: 'none' }
    body.include_reasoning = false
    body.return_reasoning = false
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const url = `${base}/chat/completions`
  const timeoutMs = getLlmRequestTimeoutMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'AbortError') {
      throw new Error(
        `Timeout (${timeoutMs / 1000}s) llamando a LM Studio. Prueba menos imágenes o BACKPACK_LLM_REQUEST_TIMEOUT_MS.`
      )
    }
    throw e
  } finally {
    clearTimeout(timer)
  }

  let rawText = ''
  if (typeof res.text === 'function') {
    rawText = await res.text()
  } else if (typeof res.json === 'function') {
    try {
      rawText = JSON.stringify(await res.json())
    } catch {
      rawText = ''
    }
  }
  let data: {
    error?: { message?: string }
    choices?: { message?: { content?: string } }[]
  } = {}
  try {
    data = JSON.parse(rawText) as typeof data
  } catch {
    /* vacío */
  }

  if (!res.ok) {
    const apiMsg = data.error?.message
    const snippet = rawText.slice(0, 400).replace(/\s+/g, ' ')
    console.error(
      `[BackpackLLM] ${res.status} ${url}\n`,
      apiMsg || snippet || res.statusText
    )
    const msg =
      apiMsg ||
      (snippet ? `${res.status}: ${snippet}` : res.statusText) ||
      'LLM request failed'
    throw new Error(msg)
  }

  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    console.error('[BackpackLLM] Respuesta sin content:', rawText.slice(0, 500))
    throw new Error('El modelo devolvió una respuesta vacía')
  }
  return text.trim()
}
