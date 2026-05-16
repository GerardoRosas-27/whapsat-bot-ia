import type { BackpackProduct } from '@prisma/client'
import {
  backpackLlmChat,
  getLlmMaxResponseTokens,
  type LlmImagePart,
  type LlmMessage
} from './backpack-lm-studio'
import {
  buildBackpackSystemPrompt,
  formatCatalogForPrompt,
  getCatalogReferenceImages,
  sanitizeLlmReplyForCustomer
} from './backpack-llm-context'
import { shrinkUserImageForLlm } from './backpack-llm-image'

export type BackpackLlmHistoryTurn = { role: 'user' | 'assistant'; content: string }

const DEFAULT_LLM_HISTORY_MESSAGES = 5
const DEFAULT_VISUAL_MATCH_THRESHOLD = 90

export type BackpackLlmPolicySlice = {
  rulesForBot: string
  customerFacts: string
  interactionWorkflow: string
}

/**
 * Un turno completo hacia LM Studio (texto del catálogo + opcional visión).
 * Usado por el bot de WhatsApp y por scripts de depuración.
 */
export async function runBackpackLlmTurn(input: {
  userText: string
  userImageDataUrl: string | null
  policy: BackpackLlmPolicySlice
  products: BackpackProduct[]
  history: BackpackLlmHistoryTurn[]
  temperature?: number
}): Promise<string> {
  const catalogText = formatCatalogForPrompt(input.products)

  let userImg = input.userImageDataUrl
  if (userImg) {
    userImg = await shrinkUserImageForLlm(userImg)
  }

  if (userImg) {
    return runBackpackVisualCatalogSearch({
      userText: input.userText,
      userImageDataUrl: userImg,
      products: input.products
    })
  }

  const historyMessages: LlmMessage[] = input.history.slice(-getBackpackLlmHistoryMessages()).map((t) => ({
    role: t.role,
    content: t.content
  }))

  const systemPrompt = buildBackpackSystemPrompt({
    workflow: input.policy.interactionWorkflow,
    rulesForBot: input.policy.rulesForBot,
    customerFacts: input.policy.customerFacts,
    catalogText
  })

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: `Cliente:\n${input.userText}\n\nResponde solo con el texto para WhatsApp, sin preámbulos ni razonamiento.`
    }
  ]

  const reply = await backpackLlmChat({
    messages,
    temperature: input.temperature ?? 0.45,
    maxTokens: getLlmMaxResponseTokens()
  })
  return sanitizeLlmReplyForCustomer(reply)
}

async function runBackpackVisualCatalogSearch(input: {
  userText: string
  userImageDataUrl: string
  products: BackpackProduct[]
}): Promise<string> {
  const references = getCatalogReferenceImages(input.products)
  const threshold = getVisualMatchThreshold()
  if (references.length === 0) {
    return 'Por ahora no tengo fotos cargadas para comparar ese modelo. Si quieres, descríbeme la mochila y reviso el catálogo.'
  }

  let best: {
    product: BackpackProduct
    similarity: number
  } | null = null

  for (let index = 0; index < references.length; index += 1) {
    const reference = references[index]
    const product = input.products.find((p) => p.id === reference.productId)
    if (!product) continue

    try {
      const result = await compareUserImageWithCatalogImage({
        userText: input.userText,
        userImageDataUrl: input.userImageDataUrl,
        catalogLabel: reference.label,
        catalogImageDataUrl: reference.dataUrl
      })
      console.log(
        `[BackpackLLM] Comparación visual ${index + 1}/${references.length}: ${product.name} => ${result.similarity}%`
      )
      if (!best || result.similarity > best.similarity) {
        best = { product, similarity: result.similarity }
      }
    } catch (error) {
      console.warn(
        `[BackpackLLM] Error comparando imagen con ${product.name}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  if (best && best.similarity >= threshold) {
    const availability = best.product.stock > 0 ? 'en existencia' : 'sin existencia'
    return `Sí, tengo este modelo disponible: *${best.product.name}*.\nPrecio: $${Number(best.product.price).toFixed(2)}\nStock: ${best.product.stock} (${availability}).`
  }

  return 'No encontré una coincidencia suficientemente parecida en el catálogo. Si quieres, mándame otra foto o dime qué características buscas.'
}

async function compareUserImageWithCatalogImage(input: {
  userText: string
  userImageDataUrl: string
  catalogLabel: string
  catalogImageDataUrl: string
}): Promise<{ similarity: number }> {
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content:
        'Eres un comparador visual estricto de mochilas. Recibirás dos imágenes: primero la foto del cliente y después una foto del catálogo. ' +
        'Debes responder SOLO JSON válido con esta forma: {"similarity": number}. ' +
        'similarity es un porcentaje entero de 0 a 100 sobre qué tanto parecen el mismo modelo o un diseño claramente equivalente. ' +
        'Usa 90 o más solo si son el mismo modelo o una coincidencia visual muy fuerte. No agregues texto fuera del JSON.'
    },
    {
      role: 'user',
      content: buildVisualComparisonPayload(input)
    }
  ]

  const raw = await backpackLlmChat({
    messages,
    temperature: 0,
    maxTokens: 80
  })
  return { similarity: parseSimilarityPercent(raw) }
}

function buildVisualComparisonPayload(input: {
  userText: string
  userImageDataUrl: string
  catalogLabel: string
  catalogImageDataUrl: string
}): (LlmImagePart | { type: 'text'; text: string })[] {
  const imgDetail =
    process.env.BACKPACK_LLM_IMAGE_DETAIL === 'low'
      ? ('low' as const)
      : undefined

  return [
    {
      type: 'text',
      text:
        `Texto del cliente: ${input.userText.trim() || '(sin texto)'}\n` +
        'Imagen 1: foto del cliente.\n' +
        `Imagen 2: foto del catálogo: ${input.catalogLabel}.\n` +
        'Compara si son el mismo modelo de mochila o un diseño muy parecido. Responde solo JSON.'
    },
    {
      type: 'image_url',
      image_url: imgDetail
        ? { url: formatImageForLlm(input.userImageDataUrl), detail: imgDetail }
        : { url: formatImageForLlm(input.userImageDataUrl) }
    },
    {
      type: 'image_url',
      image_url: imgDetail
        ? { url: formatImageForLlm(input.catalogImageDataUrl), detail: imgDetail }
        : { url: formatImageForLlm(input.catalogImageDataUrl) }
    }
  ]
}

export function parseSimilarityPercent(raw: string): number {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const candidate = jsonMatch?.[0] ?? raw
  try {
    const parsed = JSON.parse(candidate) as { similarity?: unknown; score?: unknown; percent?: unknown }
    const value = parsed.similarity ?? parsed.score ?? parsed.percent
    const n = typeof value === 'number' ? value : Number(value)
    return clampSimilarity(n)
  } catch {
    const n = Number(raw.match(/\d+(?:\.\d+)?/)?.[0])
    return clampSimilarity(n)
  }
}

function clampSimilarity(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getVisualMatchThreshold(): number {
  const n = Number(process.env.BACKPACK_LLM_VISUAL_MATCH_THRESHOLD || DEFAULT_VISUAL_MATCH_THRESHOLD)
  if (!Number.isFinite(n)) return DEFAULT_VISUAL_MATCH_THRESHOLD
  return Math.max(0, Math.min(100, n))
}

function getBackpackLlmHistoryMessages(): number {
  const raw = process.env.BACKPACK_LLM_HISTORY_MESSAGES
  const n = raw === undefined ? DEFAULT_LLM_HISTORY_MESSAGES : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LLM_HISTORY_MESSAGES
  return Math.max(0, Math.min(20, Math.floor(n)))
}

function formatImageForLlm(dataUrl: string): string {
  const mode = process.env.BACKPACK_LLM_IMAGE_URL_FORMAT?.toLowerCase().trim()
  if (!mode || mode === 'data-url') return dataUrl
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

/** PNG 1×1 para pruebas (no usar en producción). */
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
