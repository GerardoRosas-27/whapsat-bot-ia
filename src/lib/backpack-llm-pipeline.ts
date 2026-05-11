import type { BackpackProduct } from '@prisma/client'
import {
  backpackLlmChat,
  getLlmMaxResponseTokens,
  type LlmMessage
} from './backpack-lm-studio'
import {
  buildBackpackSystemPrompt,
  buildBackpackUserPayload,
  formatCatalogForPrompt,
  formatProductsWithPhotosForVision,
  getCatalogReferenceImages,
  looksLikeDeniedCatalogVisualMatch,
  MAX_CATALOG_IMAGES_FOR_VISION,
  replyMentionsAnyProductName,
  sanitizeLlmReplyForCustomer
} from './backpack-llm-context'
import { shrinkUserImageForLlm } from './backpack-llm-image'

export type BackpackLlmHistoryTurn = { role: 'user' | 'assistant'; content: string }

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

  const historyMessages: LlmMessage[] = input.history.map((t) => ({
    role: t.role,
    content: t.content
  }))

  const catalogImageBatches = userImg
    ? chunkCatalogImages(getCatalogReferenceImages(input.products))
    : [[]]

  let lastReply = ''
  let lastErr: unknown
  for (let batchIndex = 0; batchIndex < catalogImageBatches.length; batchIndex += 1) {
    const catalogReferenceImages = catalogImageBatches[batchIndex]

    const systemPrompt = buildBackpackSystemPrompt({
      workflow: input.policy.interactionWorkflow,
      rulesForBot: input.policy.rulesForBot,
      customerFacts: input.policy.customerFacts,
      catalogText,
      visionComparison: userImg
        ? {
            attachedReferenceLabels: catalogReferenceImages.map((r) => r.label),
            allWithPhotoSummary: formatProductsWithPhotosForVision(input.products)
          }
        : undefined
    })

    const userPayload = buildBackpackUserPayload({
      userText: input.userText,
      userImageDataUrl: userImg,
      catalogReferenceImages
    })

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: userPayload }
    ]

    try {
      let reply = await backpackLlmChat({
        messages,
        temperature: input.temperature ?? 0.45,
        maxTokens: getLlmMaxResponseTokens()
      })
      reply = sanitizeLlmReplyForCustomer(reply)

      const anyCatalogPhotos = input.products.some(
        (p) => p.isActive && p.imageUrl?.trim()
      )
      const secondLook =
        userImg &&
        anyCatalogPhotos &&
        looksLikeDeniedCatalogVisualMatch(reply) &&
        !replyMentionsAnyProductName(reply, input.products)

      if (secondLook) {
        const followUp: LlmMessage[] = [
          ...messages,
          { role: 'assistant', content: reply },
          {
            role: 'user',
            content:
              'Segunda revisión: compara de nuevo la foto del cliente con cada imagen etiquetada "Catálogo:". Si es la misma mochila o el mismo diseño que algún producto del listado en el system prompt, responde con el *nombre exacto*, precio y stock. Solo si ninguna se parece razonablemente, mantén que no la tenemos.'
          }
        ]
        try {
          let reply2 = await backpackLlmChat({
            messages: followUp,
            temperature: 0.32,
            maxTokens: getLlmMaxResponseTokens()
          })
          reply2 = sanitizeLlmReplyForCustomer(reply2)
          if (reply2.length >= 12) {
            reply = reply2
            console.log('[BackpackLLM] Segunda pasada visual aplicada')
          }
        } catch {
          /* primera respuesta */
        }
      }

      if (userImg) {
        console.log(
          `[BackpackLLM] Revisión visual ${batchIndex + 1}/${catalogImageBatches.length} con ${catalogReferenceImages.length} imagen(es) de catálogo`
        )
      }
      lastReply = reply
      if (
        !userImg ||
        replyMentionsAnyProductName(reply, input.products) ||
        catalogImageBatches.length === 1
      ) {
        return reply
      }
    } catch (e) {
      lastErr = e
      console.warn(
        `[BackpackLLM] Error en revisión visual ${batchIndex + 1}/${catalogImageBatches.length} con ${catalogReferenceImages.length} foto(s) de catálogo. Probando la siguiente tanda…`,
        e instanceof Error ? e.message : e
      )
    }
  }

  if (lastReply) {
    return lastReply
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr))
}

function chunkCatalogImages<T>(items: T[]): T[][] {
  const size = Math.max(1, MAX_CATALOG_IMAGES_FOR_VISION)
  if (items.length === 0) return [[]]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** PNG 1×1 para pruebas (no usar en producción). */
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
