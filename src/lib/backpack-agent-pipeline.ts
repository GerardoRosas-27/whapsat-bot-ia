import fs from 'fs'
import path from 'path'
import type { BackpackProduct } from '@prisma/client'
import {
  backpackLlmChat,
  getLlmMaxResponseTokens,
  type LlmMessage
} from './backpack-lm-studio'
import {
  formatCatalogForPrompt,
  sanitizeLlmReplyForCustomer
} from './backpack-llm-context'

export type BackpackAgentHistoryTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type BackpackAgentPolicySlice = {
  customerFacts: string
}

const DEFAULT_AGENT_CONTEXT = `# Rol

Eres el asistente virtual de WhatsApp de Mochilas y Novedades Kira.
Solo puedes hablar del catálogo de mochilas de la tienda y de la información del negocio (horarios, envíos, ubicación, mayoreo). Cualquier otro tema recházalo cortésmente.

# Formato

- Devuelve únicamente el mensaje final para el cliente.
- Prohibido razonamiento interno, <think>, <reasoning> o texto en inglés.
- Máximo 6 líneas, en español de México.
- Usa solo productos que aparezcan literalmente en el catálogo y solo datos que estén en "Información oficial".`

let cachedContextFile: { text: string; mtimeMs: number } | null = null

/**
 * Lee el archivo de contexto del agente desde src/lib/backpack-agent-context.md.
 * Cachea el contenido y lo refresca si el archivo cambia (útil en desarrollo).
 * Si el archivo no existe (p. ej. build con archivos faltantes), usa el contexto por defecto.
 */
export function loadBackpackAgentContext(): string {
  const filePath = path.join(
    process.cwd(),
    'src',
    'lib',
    'backpack-agent-context.md'
  )
  try {
    const stat = fs.statSync(filePath)
    if (cachedContextFile && cachedContextFile.mtimeMs === stat.mtimeMs) {
      return cachedContextFile.text
    }
    const text = fs.readFileSync(filePath, 'utf8').trim()
    cachedContextFile = { text: text || DEFAULT_AGENT_CONTEXT, mtimeMs: stat.mtimeMs }
    return cachedContextFile.text
  } catch {
    return DEFAULT_AGENT_CONTEXT
  }
}

/** Construye el system prompt del agente IA a partir del archivo de contexto + datos de la BD. */
export function buildBackpackAgentSystemPrompt(parts: {
  contextFile: string
  customerFacts: string
  catalogText: string
}): string {
  const facts =
    parts.customerFacts.trim() ||
    '(Sin datos oficiales cargados. Indica que no tienes ese dato y sugiere contactar a la tienda.)'
  return `${parts.contextFile.trim()}

---

## Información oficial del negocio
${facts}

---

## Catálogo (única fuente de productos, precios y existencias)
${parts.catalogText}

---

Recordatorio final: responde SOLO con el mensaje para el cliente. Nada de razonamiento, nada de etiquetas, nada en inglés.`
}

/** Quita cualquier residuo de razonamiento que haya esquivado el sanitizador base. */
function finalCleanup(reply: string): string {
  let t = reply.trim()
  const openThink = /<(think|thinking|reasoning|redacted_thinking)>/i
  const m = openThink.exec(t)
  if (m && m.index === 0) {
    const closing = new RegExp(`</${m[1]}>`, 'i')
    const close = closing.exec(t)
    if (close) {
      t = t.slice(close.index + close[0].length).trim()
    }
  }
  return t
}

/** Un turno del asistente IA (solo texto, sin visión). */
export async function runBackpackAgentTurn(input: {
  userText: string
  policy: BackpackAgentPolicySlice
  products: BackpackProduct[]
  history: BackpackAgentHistoryTurn[]
  temperature?: number
}): Promise<string> {
  const catalogText = formatCatalogForPrompt(input.products)
  const contextFile = loadBackpackAgentContext()

  const systemPrompt = buildBackpackAgentSystemPrompt({
    contextFile,
    customerFacts: input.policy.customerFacts,
    catalogText
  })

  const historyMessages: LlmMessage[] = input.history.map((t) => ({
    role: t.role,
    content: t.content
  }))

  const userText =
    input.userText.trim() ||
    '(El cliente envió un mensaje vacío. Pide amablemente que escriba su pregunta sobre mochilas.)'

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: `Cliente: ${userText}\n\nResponde SOLO con el texto para WhatsApp, sin preámbulos ni razonamiento.`
    }
  ]

  let reply = await backpackLlmChat({
    messages,
    temperature: input.temperature ?? 0.35,
    maxTokens: getLlmMaxResponseTokens()
  })
  reply = sanitizeLlmReplyForCustomer(reply)
  reply = finalCleanup(reply)
  return reply
}
