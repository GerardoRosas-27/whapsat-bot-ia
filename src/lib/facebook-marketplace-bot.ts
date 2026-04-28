import crypto from 'crypto'
import type { BackpackProduct } from '@prisma/client'
import type {
  LlmImagePart,
  LlmMessage,
  LlmTextPart,
  LlmUserContent
} from './backpack-lm-studio'
import {
  fetchBackpackCatalogForLlm,
  formatCatalogForPrompt,
  formatProductsWithPhotosForVision,
  pickCatalogReferenceImages,
  sanitizeLlmReplyForCustomer
} from './backpack-llm-context'
import { prisma } from './prisma'
import {
  getMarketplaceLlmBaseUrl,
  getMarketplaceLlmMaxResponseTokens,
  getMarketplaceLlmModel,
  marketplaceLlmChat
} from './marketplace-lm-studio'

const POLICY_ID = 'singleton'
const MAX_HISTORY_TURNS = 8
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

type MarketplaceHistoryTurn = { role: 'user' | 'assistant'; content: string }

type FacebookAttachment = {
  type?: string
  payload?: {
    url?: string
  }
}

type FacebookMessagingEvent = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: FacebookAttachment[]
  }
  postback?: {
    title?: string
    payload?: string
  }
}

export type FacebookMarketplaceWebhookPayload = {
  object?: string
  entry?: {
    id?: string
    time?: number
    messaging?: FacebookMessagingEvent[]
  }[]
}

export type FacebookMarketplaceWebhookResult = {
  processed: number
  repliesSent: number
  errors: string[]
}

const conversationHistory = new Map<string, MarketplaceHistoryTurn[]>()

export function getFacebookMarketplaceStatus() {
  return {
    channel: 'facebook-marketplace',
    configured: Boolean(getPageAccessToken()),
    pageAccessTokenConfigured: Boolean(getPageAccessToken()),
    verifyTokenConfigured: Boolean(getVerifyToken()),
    appSecretConfigured: Boolean(getAppSecret()),
    graphApiVersion: getGraphApiVersion(),
    llmBaseUrl: getMarketplaceLlmBaseUrl(),
    llmModel: getMarketplaceLlmModel(),
    webhookPath: '/api/facebook-marketplace/webhook',
    catalogSource: 'BackpackProduct'
  }
}

export function verifyFacebookMarketplaceChallenge(searchParams: URLSearchParams): {
  ok: boolean
  challenge?: string
} {
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge') || ''

  return {
    ok: mode === 'subscribe' && Boolean(token) && token === getVerifyToken(),
    challenge
  }
}

export function validateMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const appSecret = getAppSecret()
  if (!appSecret) return true
  if (!signatureHeader?.startsWith('sha256=')) return false

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')
  const provided = signatureHeader.slice('sha256='.length)

  const expectedBuffer = Buffer.from(expected, 'hex')
  const providedBuffer = Buffer.from(provided, 'hex')
  if (expectedBuffer.length !== providedBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}

export async function handleFacebookMarketplaceWebhook(
  payload: FacebookMarketplaceWebhookPayload
): Promise<FacebookMarketplaceWebhookResult> {
  const result: FacebookMarketplaceWebhookResult = {
    processed: 0,
    repliesSent: 0,
    errors: []
  }

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!isInboundCustomerMessage(event)) continue

      result.processed += 1
      try {
        const reply = await buildFacebookMarketplaceReply(event)
        if (!reply) continue
        await sendFacebookTextMessage(event.sender!.id!, reply)
        result.repliesSent += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[FacebookMarketplaceBot] Error procesando evento:', message)
        result.errors.push(message)
      }
    }
  }

  return result
}

async function buildFacebookMarketplaceReply(
  event: FacebookMessagingEvent
): Promise<string> {
  const senderId = event.sender?.id
  if (!senderId) return ''

  const userText = getEventText(event)
  const userImageDataUrl = await getFirstImageAttachmentDataUrl(event)
  const policy = await getBackpackPolicy()
  const products = await fetchBackpackCatalogForLlm()
  const history = conversationHistory.get(senderId) ?? []

  const messages = buildMarketplaceLlmMessages({
    userText,
    userImageDataUrl,
    products,
    policy,
    history
  })

  let reply = await marketplaceLlmChat({
    messages,
    temperature: userImageDataUrl ? 0.35 : 0.45,
    maxTokens: getMarketplaceLlmMaxResponseTokens()
  })
  reply = sanitizeLlmReplyForCustomer(reply)

  rememberConversationTurn(senderId, userText || '(imagen enviada)', reply)
  return reply
}

function buildMarketplaceLlmMessages(input: {
  userText: string
  userImageDataUrl: string | null
  products: BackpackProduct[]
  policy: {
    rulesForBot: string
    customerFacts: string
    interactionWorkflow: string
  }
  history: MarketplaceHistoryTurn[]
}): LlmMessage[] {
  const catalogText = formatCatalogForPrompt(input.products)
  const withPhotos = formatProductsWithPhotosForVision(input.products)
  const catalogReferenceImages = input.userImageDataUrl
    ? pickCatalogReferenceImages(input.products, 4)
    : []

  const systemPrompt = buildMarketplaceSystemPrompt({
    rulesForBot: input.policy.rulesForBot,
    customerFacts: input.policy.customerFacts,
    interactionWorkflow: input.policy.interactionWorkflow,
    catalogText,
    productsWithPhotos: withPhotos,
    attachedReferenceLabels: catalogReferenceImages.map((r) => r.label)
  })

  const historyMessages: LlmMessage[] = input.history.map((turn) => ({
    role: turn.role,
    content: turn.content
  }))

  return [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: buildMarketplaceUserPayload({
        userText: input.userText,
        userImageDataUrl: input.userImageDataUrl,
        catalogReferenceImages
      })
    }
  ]
}

function buildMarketplaceSystemPrompt(parts: {
  rulesForBot: string
  customerFacts: string
  interactionWorkflow: string
  catalogText: string
  productsWithPhotos: string
  attachedReferenceLabels: string[]
}): string {
  const workflow =
    parts.interactionWorkflow.trim() ||
    'Responde dudas de producto, precio, disponibilidad, ubicacion y horarios. Si el cliente quiere comprar, pide el dato minimo para continuar la venta.'

  return `Eres quien atiende los mensajes de Facebook Marketplace/Messenger de una tienda de mochilas.

## Formato de salida
- Devuelve solo el mensaje que vera el cliente.
- Escribe en espanol de Mexico, natural y breve.
- No menciones que eres IA, modelo, prompt, sistema ni asistente.
- No incluyas razonamiento interno ni texto en ingles.

## Reglas de venta
- Usa el catalogo como unica fuente para productos, precios y existencias.
- Si preguntan precio o disponibilidad, responde con nombre exacto, precio y stock.
- Si preguntan ubicacion, horarios, entregas o politicas, usa solo la informacion oficial del negocio.
- Si algo no esta en catalogo, dilo con claridad y ofrece alternativas reales.
- Si la persona quiere comprar, continua como vendedor y pide el siguiente dato necesario.

## Flujo configurado por el negocio
${workflow}

## Reglas internas configuradas
${parts.rulesForBot.trim() || '(No hay reglas adicionales configuradas.)'}

## Informacion oficial del negocio
${parts.customerFacts.trim() || '(No hay informacion oficial cargada; no inventes ubicacion ni horarios.)'}

## Catalogo activo
${parts.catalogText}

## Productos con foto en el sistema
${parts.productsWithPhotos}

## Imagenes de referencia adjuntas en este turno
${parts.attachedReferenceLabels.length > 0 ? parts.attachedReferenceLabels.join(' | ') : '(ninguna)'}`
}

function buildMarketplaceUserPayload(params: {
  userText: string
  userImageDataUrl: string | null
  catalogReferenceImages: { label: string; dataUrl: string }[]
}): LlmUserContent {
  const blocks: (LlmTextPart | LlmImagePart)[] = [
    {
      type: 'text',
      text:
        `Cliente en Facebook Marketplace:\n${params.userText || '(El cliente envio imagen sin texto.)'}\n\n` +
        (params.userImageDataUrl
          ? 'La siguiente imagen es del cliente. Comparala con las referencias del catalogo si existen.\n'
          : '') +
        'Responde solo con el texto para el cliente.'
    }
  ]

  if (params.userImageDataUrl) {
    blocks.push({
      type: 'image_url',
      image_url: { url: params.userImageDataUrl }
    })
  }

  for (const ref of params.catalogReferenceImages) {
    blocks.push({ type: 'text', text: `--- Catalogo: ${ref.label} ---` })
    blocks.push({ type: 'image_url', image_url: { url: ref.dataUrl } })
  }

  return blocks
}

async function getBackpackPolicy() {
  return prisma.backpackBotPolicy.upsert({
    where: { id: POLICY_ID },
    create: {
      id: POLICY_ID,
      rulesForBot: '',
      customerFacts: '',
      interactionWorkflow: ''
    },
    update: {}
  })
}

function isInboundCustomerMessage(event: FacebookMessagingEvent): boolean {
  if (!event.sender?.id) return false
  if (event.message?.is_echo) return false
  return Boolean(event.message?.text || event.message?.attachments?.length || event.postback)
}

function getEventText(event: FacebookMessagingEvent): string {
  const text = event.message?.text?.trim()
  if (text) return text
  const postbackTitle = event.postback?.title?.trim()
  if (postbackTitle) return postbackTitle
  const postbackPayload = event.postback?.payload?.trim()
  if (postbackPayload) return postbackPayload
  return ''
}

async function getFirstImageAttachmentDataUrl(
  event: FacebookMessagingEvent
): Promise<string | null> {
  const image = event.message?.attachments?.find(
    (attachment) => attachment.type === 'image' && attachment.payload?.url
  )
  const url = image?.payload?.url
  if (!url) return null
  return fetchAttachmentAsDataUrl(url)
}

async function fetchAttachmentAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.toLowerCase().startsWith('image/')) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_ATTACHMENT_BYTES) return null
    return `data:${contentType};base64,${bytes.toString('base64')}`
  } catch (error) {
    console.warn(
      '[FacebookMarketplaceBot] No se pudo descargar adjunto:',
      error instanceof Error ? error.message : error
    )
    return null
  }
}

function rememberConversationTurn(
  senderId: string,
  userText: string,
  assistantText: string
) {
  const next = [
    ...(conversationHistory.get(senderId) ?? []),
    { role: 'user' as const, content: userText },
    { role: 'assistant' as const, content: assistantText }
  ].slice(-MAX_HISTORY_TURNS)
  conversationHistory.set(senderId, next)
}

async function sendFacebookTextMessage(
  recipientId: string,
  text: string
): Promise<void> {
  const token = getPageAccessToken()
  if (!token) {
    throw new Error('Falta META_PAGE_ACCESS_TOKEN o FACEBOOK_PAGE_ACCESS_TOKEN')
  }

  const url = `https://graph.facebook.com/${getGraphApiVersion()}/me/messages?access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: text.slice(0, 1900) }
    })
  })

  if (!res.ok) {
    const raw = await res.text()
    throw new Error(`Graph API ${res.status}: ${raw.slice(0, 400)}`)
  }
}

function getVerifyToken(): string {
  return (
    process.env.META_VERIFY_TOKEN ||
    process.env.FACEBOOK_MARKETPLACE_VERIFY_TOKEN ||
    process.env.FACEBOOK_VERIFY_TOKEN ||
    ''
  ).trim()
}

function getPageAccessToken(): string {
  return (
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
    ''
  ).trim()
}

function getAppSecret(): string {
  return (process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '').trim()
}

function getGraphApiVersion(): string {
  return (
    process.env.META_GRAPH_API_VERSION ||
    process.env.FACEBOOK_GRAPH_API_VERSION ||
    'v19.0'
  ).trim()
}
