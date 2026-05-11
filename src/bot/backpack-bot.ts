import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Client, Message, MessageMedia } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { prisma } from '../lib/prisma'
import { createWhatsAppClient } from '../shared/whatsapp'
import {
  backpackLlmChat,
  getLlmBaseUrl,
  getLlmModel
} from '../lib/backpack-lm-studio'
import {
  fetchBackpackCatalogForLlm,
  pickCatalogReferenceImages
} from '../lib/backpack-llm-context'
import { runBackpackLlmTurn, type BackpackLlmHistoryTurn } from '../lib/backpack-llm-pipeline'
import {
  runBackpackAgentTurn,
  type BackpackAgentHistoryTurn
} from '../lib/backpack-agent-pipeline'

/** URL pública de la app (para que WhatsApp pueda cargar imágenes). En producción define APP_PUBLIC_URL o NEXT_PUBLIC_APP_URL. */
const APP_BASE_URL = process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

type BackpackBotState = 'idle' | 'agent' | 'soldProducts'

type LlmTurn = BackpackLlmHistoryTurn

interface BackpackUserSession {
  phoneNumber: string
  state: BackpackBotState
  context?: {
    llmHistory?: BackpackLlmHistoryTurn[]
    agentHistory?: BackpackAgentHistoryTurn[]
  } & Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/** Palabras que cierran el modo administrativo de captura de ventas. */
const AGENT_EXIT_COMMANDS = new Set([
  'menu',
  'menú',
  'salir',
  'volver',
  'inicio',
  'hola',
  'hi',
  'regresar',
  'cancelar'
])

const BACKPACK_POLICY_CACHE_MS = 45_000
const BACKPACK_AUTH_PATH = '.wwebjs_auth_backpack'

class BackpackWhatsAppBot {
  private client: Client
  private isReady = false
  private isStarting = false
  private hasStarted = false
  private lastQr: string | null = null
  private userSessions: Map<string, BackpackUserSession> = new Map()
  private recentBotSelfMessages: Map<string, number> = new Map()
  private policyCache: {
    rulesForBot: string
    customerFacts: string
    interactionWorkflow: string
    fetchedAt: number
  } | null = null

  constructor() {
    this.client = createWhatsAppClient(BACKPACK_AUTH_PATH)
    this.setupEventHandlers()
  }

  private resetClient() {
    this.client = createWhatsAppClient(BACKPACK_AUTH_PATH)
    this.setupEventHandlers()
  }

  private cleanupStaleBrowserLock() {
    const devToolsFile = path.join(
      process.cwd(),
      BACKPACK_AUTH_PATH,
      'session',
      'DevToolsActivePort'
    )
    try {
      if (fs.existsSync(devToolsFile)) {
        fs.unlinkSync(devToolsFile)
      }
    } catch (error) {
      console.warn('[BackpackBot] No pude limpiar DevToolsActivePort:', error)
    }
  }

  private async getSession(phoneNumber: string): Promise<BackpackUserSession> {
    if (this.userSessions.has(phoneNumber)) {
      return this.userSessions.get(phoneNumber)!
    }
    const newSession: BackpackUserSession = {
      phoneNumber,
      state: 'idle',
      context: {},
      createdAt: new Date(),
      updatedAt: new Date()
    }
    this.userSessions.set(phoneNumber, newSession)
    await this.saveSession(newSession)
    return newSession
  }

  private async saveSession(session: BackpackUserSession) {
    try {
      session.updatedAt = new Date()
      await prisma.backpackBotSession.upsert({
        where: { phoneNumber: session.phoneNumber },
        update: { isActive: true, updatedAt: session.updatedAt },
        create: { phoneNumber: session.phoneNumber, isActive: true }
      })
    } catch (error) {
      console.error('[BackpackBot] Error guardando sesión:', error)
    }
  }

  private async clearSession(phoneNumber: string) {
    this.userSessions.delete(phoneNumber)
    try {
      await prisma.backpackBotSession.updateMany({
        where: { phoneNumber },
        data: { isActive: false }
      })
    } catch (error) {
      console.error('[BackpackBot] Error limpiando sesión:', error)
    }
  }

  private async saveConversationMessage(input: {
    phoneNumber: string
    role: 'user' | 'assistant' | 'system'
    body: string
    messageType?: string
  }) {
    const body = input.body.trim()
    if (!body) return
    try {
      const conversation = await prisma.backpackConversation.upsert({
        where: { phoneNumber: input.phoneNumber },
        update: {
          lastMessage: body.slice(0, 500)
        },
        create: {
          phoneNumber: input.phoneNumber,
          lastMessage: body.slice(0, 500)
        }
      })
      await prisma.backpackConversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: input.role,
          body: body.slice(0, 4000),
          messageType: input.messageType ?? 'text'
        }
      })
    } catch (error) {
      console.error('[BackpackBot] Error guardando historial:', error)
    }
  }

  private async updateSessionState(
    phoneNumber: string,
    state: BackpackBotState,
    context?: Partial<BackpackUserSession['context']>
  ) {
    const session = await this.getSession(phoneNumber)
    session.state = state
    if (context) {
      session.context = { ...session.context, ...context }
    }
    session.updatedAt = new Date()
    this.userSessions.set(phoneNumber, session)
    await this.saveSession(session)
  }

  private setupEventHandlers() {
    this.client.on('qr', (qr) => {
      this.lastQr = qr
      this.isReady = false
      this.hasStarted = true
      console.log('[BackpackBot] Escanea este código QR con WhatsApp (cuenta secundaria):')
      qrcode.generate(qr, { small: true })
    })

    this.client.on('ready', () => {
      this.lastQr = null
      this.hasStarted = true
      console.log('[BackpackBot] Bot de Mochilas listo!')
      console.log(
        `[BackpackBot] LLM local activo por defecto → ${getLlmBaseUrl()} | modelo: ${getLlmModel()}`
      )
      this.isReady = true
    })

    this.client.on('authenticated', () => {
      console.log('[BackpackBot] Autenticado correctamente')
    })

    this.client.on('auth_failure', (msg) => {
      this.isReady = false
      this.hasStarted = false
      console.error('[BackpackBot] Error de autenticación:', msg)
    })

    this.client.on('disconnected', (reason) => {
      this.isReady = false
      this.hasStarted = false
      this.lastQr = null
      console.log('[BackpackBot] Desconectado:', reason)
    })

    this.client.on('message', async (message: Message) => {
      await this.handleMessage(message)
    })

    this.client.on('message_create', async (message: Message) => {
      await this.handleSelfTestMessage(message)
    })
  }

  private formatPrice(price: number | null | undefined): string {
    const n = price ?? 0
    return `$${Number(n).toFixed(2)}`
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '')
  }

  private async isAdminPhoneNumber(phoneNumber: string): Promise<boolean> {
    const normalized = this.normalizePhoneNumber(phoneNumber)
    if (!normalized) return false
    const adminNumber = await prisma.backpackAdminNumber.findUnique({
      where: { phoneNumber: normalized }
    })
    return Boolean(adminNumber?.isActive && !adminNumber.treatAsCustomer)
  }

  private async isSelfTestCustomerPhoneNumber(phoneNumber: string): Promise<boolean> {
    const normalized = this.normalizePhoneNumber(phoneNumber)
    if (!normalized) return false
    const adminNumber = await prisma.backpackAdminNumber.findUnique({
      where: { phoneNumber: normalized }
    })
    return Boolean(adminNumber?.isActive && adminNumber.treatAsCustomer)
  }

  private rememberBotSelfMessage(text: string | null | undefined): void {
    const normalized = this.normalizeSelfMessageText(text)
    if (!normalized) return
    const now = Date.now()
    this.recentBotSelfMessages.set(normalized, now)
    for (const [key, createdAt] of this.recentBotSelfMessages) {
      if (now - createdAt > 120_000) {
        this.recentBotSelfMessages.delete(key)
      }
    }
  }

  private wasRecentlySentByBot(text: string | null | undefined): boolean {
    const normalized = this.normalizeSelfMessageText(text)
    if (!normalized) return false
    const createdAt = this.recentBotSelfMessages.get(normalized)
    if (!createdAt) return false
    if (Date.now() - createdAt > 120_000) {
      this.recentBotSelfMessages.delete(normalized)
      return false
    }
    return true
  }

  private normalizeSelfMessageText(text: string | null | undefined): string {
    return String(text ?? '').trim().replace(/\s+/g, ' ').slice(0, 500)
  }

  private async replyToCustomer(
    message: Message,
    text: string,
    phoneNumber?: string
  ): Promise<void> {
    this.rememberBotSelfMessage(text)
    await message.reply(text)
    if (phoneNumber) {
      await this.saveConversationMessage({
        phoneNumber,
        role: 'assistant',
        body: text
      })
    }
    console.log(
      `[BackpackBot] Respuesta enviada a ${message.from}: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`
    )
  }

  /** Política del negocio (reglas + datos al cliente), con caché breve para no saturar SQLite */
  private async getBackpackPolicy(): Promise<{
    rulesForBot: string
    customerFacts: string
    interactionWorkflow: string
  }> {
    const now = Date.now()
    if (
      this.policyCache &&
      now - this.policyCache.fetchedAt < BACKPACK_POLICY_CACHE_MS
    ) {
      return {
        rulesForBot: this.policyCache.rulesForBot,
        customerFacts: this.policyCache.customerFacts,
        interactionWorkflow: this.policyCache.interactionWorkflow
      }
    }
    const row = await prisma.backpackBotPolicy.findUnique({
      where: { id: 'singleton' }
    })
    const rulesForBot = row?.rulesForBot?.trim() ?? ''
    const customerFacts = row?.customerFacts?.trim() ?? ''
    const interactionWorkflow = row?.interactionWorkflow?.trim() ?? ''
    this.policyCache = {
      rulesForBot,
      customerFacts,
      interactionWorkflow,
      fetchedAt: now
    }
    return { rulesForBot, customerFacts, interactionWorkflow }
  }

  private static readonly WHATSAPP_REPLY_MAX = 3900

  /** Descarga imagen del mensaje de WhatsApp (si aplica). */
  private async extractUserImageDataUrl(message: Message): Promise<string | null> {
    const t = message.type
    if (!message.hasMedia) {
      if (t === 'image' || t === 'sticker') {
        console.warn(
          `[BackpackBot] Mensaje type=${t} pero hasMedia=false (sin directPath). No se puede descargar aún.`
        )
      }
      return null
    }
    try {
      const media = await message.downloadMedia()
      if (!media) {
        console.warn(
          '[BackpackBot] downloadMedia() devolvió vacío (media no lista o expirada). Reintenta enviar la foto.'
        )
        return null
      }
      if (!media.mimetype?.startsWith('image/')) {
        console.warn(`[BackpackBot] Media no es imagen: ${media.mimetype}`)
        return null
      }
      const dataUrl = `data:${media.mimetype};base64,${media.data}`
      console.log(
        `[BackpackBot] Imagen lista para LLM (${media.mimetype}, ${media.data?.length ?? 0} chars base64)`
      )
      return dataUrl
    } catch (e) {
      console.error('[BackpackBot] Error descargando imagen:', e)
      return null
    }
  }

  private async handleSelfTestMessage(message: Message): Promise<void> {
    if (!message.fromMe) return

    const body =
      typeof message.body === 'string'
        ? message.body.trim()
        : String(message.body ?? '').trim()
    if (this.wasRecentlySentByBot(body)) {
      return
    }

    try {
      const contact = await message.getContact()
      const phoneNumber = contact.number
      if (!(await this.isSelfTestCustomerPhoneNumber(phoneNumber))) {
        return
      }
      console.log(
        `[BackpackBot] Modo prueba: procesando mensaje propio de ${phoneNumber}: "${body.slice(0, 80)}"`
      )
      await this.handleMessage(message, { allowFromMe: true })
    } catch (error) {
      console.error('[BackpackBot] Error procesando mensaje propio de prueba:', error)
    }
  }

  private parseMenuNumber(text: string): number | null {
    const match = text.match(/^(\d+)/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= 10) return num
    }
    return null
  }

  /** URL absoluta para imágenes del servidor (el bot necesita una URL pública para WhatsApp) */
  private getImageUrl(imageUrl: string | null): string | null {
    if (!imageUrl || !imageUrl.trim()) return null
    const u = imageUrl.trim()
    return u.startsWith('http') ? u : `${APP_BASE_URL.replace(/\/$/, '')}${u.startsWith('/') ? u : `/${u}`}`
  }

  private async enterSoldProductsMode(
    message: Message,
    phoneNumber: string
  ): Promise<void> {
    await this.updateSessionState(phoneNumber, 'soldProducts')
    await this.replyToCustomer(
      message,
      '🧾 *Productos vendidos*\n\n' +
        'Manda cada venta en un mensaje y la guardaré para el corte de caja.\n\n' +
        'Ejemplos:\n' +
        '- 1 set de pinzas de 20\n' +
        '- mochila sapo de poliester de 180\n\n' +
        '_Escribe *salir* para cerrar captura o *corte* para hacer corte de caja._',
      phoneNumber
    )
  }

  private async withCustomerTyping<T>(
    message: Message,
    work: () => Promise<T>
  ): Promise<T> {
    const chat = await message.getChat().catch(() => null)
    try {
      await chat?.sendStateTyping()
    } catch {
      /* ignore typing state */
    }
    try {
      return await work()
    } finally {
      try {
        await chat?.clearState()
      } catch {
        /* ignore typing state */
      }
    }
  }

  private async saveSoldProductEntry(
    message: Message,
    phoneNumber: string,
    body: string
  ): Promise<void> {
    const saved = await prisma.backpackSoldProductEntry.create({
      data: {
        adminPhoneNumber: this.normalizePhoneNumber(phoneNumber),
        message: body
      }
    })
    await this.replyToCustomer(
      message,
      `✅ Venta guardada (#${saved.id.slice(-6)}).\n\n` +
        'Manda otra venta o escribe *corte* para generar el corte de caja.',
      phoneNumber
    )
  }

  private formatPendingSoldEntries(
    entries: Awaited<ReturnType<typeof prisma.backpackSoldProductEntry.findMany>>
  ): string {
    return entries
      .map((entry, index) => {
        const date = entry.createdAt.toLocaleString('es-MX', {
          dateStyle: 'short',
          timeStyle: 'short'
        })
        return `${index + 1}. [${date}] ${entry.message}`
      })
      .join('\n')
  }

  private async createCashCut(message: Message, phoneNumber: string): Promise<void> {
    const entries = await prisma.backpackSoldProductEntry.findMany({
      where: { cashCutId: null },
      orderBy: { createdAt: 'asc' }
    })

    if (entries.length === 0) {
      await this.replyToCustomer(
        message,
        'No hay productos vendidos pendientes de corte.\n\n' +
          '_Escribe *9* o *productos vendidos* para capturar ventas._',
        phoneNumber
      )
      return
    }

    const list = this.formatPendingSoldEntries(entries)
    let result: string
    try {
      result = await backpackLlmChat({
        temperature: 0.15,
        maxTokens: 1400,
        messages: [
          {
            role: 'system',
            content:
              'Eres un asistente de caja. Recibirás una lista de ventas escrita de forma libre. ' +
              'Calcula el corte de caja usando solo los importes presentes en cada línea. ' +
              'Si una línea incluye cantidad y precio unitario, multiplica. Si solo incluye un importe, úsalo como total de esa línea. ' +
              'Responde en español, breve, con: desglose por línea, subtotal/total y observaciones de líneas ambiguas.'
          },
          {
            role: 'user',
            content:
              `Genera el corte de caja de estas ${entries.length} ventas pendientes:\n\n${list}`
          }
        ]
      })
    } catch (err) {
      console.error('[BackpackBot] Error generando corte de caja con LLM:', err)
      await this.replyToCustomer(
        message,
        '⚠️ No pude conectar con LM Studio para calcular el corte. Las ventas siguen pendientes.',
        phoneNumber
      )
      return
    }

    if (result.length > BackpackWhatsAppBot.WHATSAPP_REPLY_MAX - 120) {
      result = result.slice(0, BackpackWhatsAppBot.WHATSAPP_REPLY_MAX - 140) + '\n…'
    }

    const cashCut = await prisma.$transaction(async (tx) => {
      const created = await tx.backpackCashCut.create({
        data: {
          adminPhoneNumber: this.normalizePhoneNumber(phoneNumber),
          entryCount: entries.length,
          result
        }
      })
      await tx.backpackSoldProductEntry.updateMany({
        where: { id: { in: entries.map(entry => entry.id) } },
        data: { cashCutId: created.id }
      })
      return created
    })

    await this.replyToCustomer(
      message,
      `💵 *Corte de caja*\n\n${result}\n\n` +
        `Ventas incluidas: ${entries.length}\nFolio: ${cashCut.id.slice(-8)}`,
      phoneNumber
    )
    await this.updateSessionState(phoneNumber, 'idle')
  }

  private async handleSoldProductsTurn(
    message: Message,
    phoneNumber: string,
    body: string,
    lowerBody: string
  ): Promise<void> {
    const trimmed = lowerBody.trim()
    if (trimmed && AGENT_EXIT_COMMANDS.has(trimmed)) {
      await this.updateSessionState(phoneNumber, 'agent')
      await this.replyToCustomer(
        message,
        'Captura de ventas cerrada. Ya puedes preguntar por mochilas o datos de la tienda.',
        phoneNumber
      )
      return
    }
    if (trimmed === 'corte' || trimmed === 'corte de caja' || trimmed === '10') {
      await this.createCashCut(message, phoneNumber)
      return
    }
    if (!body.trim()) {
      await this.replyToCustomer(
        message,
        'Manda el producto vendido o escribe *salir* para cerrar captura.',
        phoneNumber
      )
      return
    }
    await this.saveSoldProductEntry(message, phoneNumber, body)
  }

  /** Detecta si el mensaje trae imagen o sticker (aunque hasMedia aún no esté listo). */
  private messageHasImage(message: Message): boolean {
    return (
      message.hasMedia ||
      message.type === 'image' ||
      message.type === 'sticker'
    )
  }

  /**
   * Turno del agente con imagen: usa el pipeline con visión (runBackpackLlmTurn) para
   * comparar la foto del cliente contra el catálogo de la BD y responder con coincidencias.
   */
  private async handleAgentVisionTurn(
    message: Message,
    phoneNumber: string,
    body: string
  ): Promise<void> {
    const userImageDataUrl = await this.extractUserImageDataUrl(message)
    if (!userImageDataUrl) {
      await this.replyToCustomer(
        message,
        'No pude descargar tu imagen (WhatsApp aún no la entrega o expiró). Por favor reenvíala.',
        phoneNumber
      )
      return
    }

    const policy = await this.getBackpackPolicy()
    const products = await fetchBackpackCatalogForLlm()
    const session = await this.getSession(phoneNumber)
    const prevVisionHistory = session.context?.llmHistory ?? []

    const catalogRefCount = pickCatalogReferenceImages(products).length
    console.log(
      `[BackpackBot] LLM visión para ${phoneNumber} | modelo=${getLlmModel()} | base=${getLlmBaseUrl()} | texto="${body.slice(0, 80)}${body.length > 80 ? '…' : ''}" | imgsCatálogo=${catalogRefCount}`
    )

    let reply: string
    try {
      reply = await this.withCustomerTyping(message, () =>
        runBackpackLlmTurn({
          userText:
            body.trim() ||
            'Busca esta mochila imagen por imagen en tu catálogo. Si identificas el modelo, responde nombre exacto, precio, stock y si está en existencia. Si ninguna se parece, dilo en una línea sin inventar.',
          userImageDataUrl,
          policy: {
            rulesForBot: policy.rulesForBot,
            customerFacts: policy.customerFacts,
            interactionWorkflow: policy.interactionWorkflow
          },
          products,
          history: prevVisionHistory,
          temperature: 0.35
        })
      )
    } catch (err) {
      console.error('[BackpackBot] Agente IA (visión) no disponible:', err)
      await this.replyToCustomer(
        message,
        '⚠️ No pude analizar tu imagen en este momento. Por favor intenta de nuevo o descríbeme el modelo que buscas.',
        phoneNumber
      )
      return
    }

    if (!reply || reply.trim().length === 0) {
      await this.replyToCustomer(
        message,
        '⚠️ No pude preparar una respuesta. Por favor intenta de nuevo o descríbeme el modelo que buscas.',
        phoneNumber
      )
      return
    }

    if (reply.length > BackpackWhatsAppBot.WHATSAPP_REPLY_MAX) {
      reply = reply.slice(0, BackpackWhatsAppBot.WHATSAPP_REPLY_MAX - 20) + '\n…'
    }

    await this.replyToCustomer(message, reply, phoneNumber)

    // También enviamos las imágenes de los productos del catálogo que el LLM mencionó
    // por nombre, para que el cliente las vea en WhatsApp.
    await this.sendMatchedCatalogImages(message, reply, products)

    const nextVisionHistory: LlmTurn[] = [
      ...prevVisionHistory,
      { role: 'user', content: `[imagen] ${body.trim() || '(sin texto)'}`.slice(0, 2000) },
      { role: 'assistant', content: reply.slice(0, 2000) }
    ]
    while (nextVisionHistory.length > 8) {
      nextVisionHistory.shift()
    }
    const existingAgentHistory =
      session.context?.agentHistory ?? []
    await this.updateSessionState(phoneNumber, 'agent', {
      llmHistory: nextVisionHistory,
      agentHistory: existingAgentHistory
    })
  }

  /** Envía las imágenes de catálogo de los productos que el LLM mencionó por nombre. */
  private async sendMatchedCatalogImages(
    message: Message,
    reply: string,
    products: Awaited<ReturnType<typeof prisma.backpackProduct.findMany>>
  ): Promise<void> {
    const lower = reply.toLowerCase()
    const matched = products.filter((p) => {
      const name = p.name?.trim()
      if (!name || name.length < 3) return false
      return lower.includes(name.toLowerCase())
    })
    if (matched.length === 0) return

    // Envía una foto por cada modelo mencionado, con un límite amplio para evitar spam accidental.
    const toSend = matched.slice(0, 10)
    for (const p of toSend) {
      const fullUrl = this.getImageUrl(p.imageUrl)
      if (!fullUrl) continue
      try {
        const media = await MessageMedia.fromUrl(fullUrl, { unsafeMime: true })
        const availability =
          typeof p.stock === 'number' && p.stock > 0
            ? 'En existencia'
            : 'Sin existencia'
        const caption = `*${p.name}*\nPrecio: ${this.formatPrice(p.price)}${typeof p.stock === 'number' ? ` • Stock: ${p.stock}` : ''}\nDisponibilidad: ${availability}`
        this.rememberBotSelfMessage(caption)
        await this.client.sendMessage(message.from, media, { caption })
        await this.saveConversationMessage({
          phoneNumber: this.normalizePhoneNumber(message.from),
          role: 'assistant',
          body: `[foto] ${caption}`,
          messageType: 'image'
        })
      } catch (err) {
        console.error(
          '[BackpackBot] No se pudo enviar imagen de coincidencia:',
          fullUrl,
          err
        )
      }
    }
  }

  /** Maneja un mensaje estando en estado 'agent' (texto o imagen). */
  private async handleAgentTurn(
    message: Message,
    phoneNumber: string,
    body: string,
    _lowerBody: string
  ): Promise<void> {
    // Turno con imagen → usa visión contra el catálogo de la BD.
    if (this.messageHasImage(message)) {
      await this.handleAgentVisionTurn(message, phoneNumber, body)
      return
    }

    const policy = await this.getBackpackPolicy()
    const products = await fetchBackpackCatalogForLlm()
    const session = await this.getSession(phoneNumber)
    const prevHistory = session.context?.agentHistory ?? []
    console.log(
      `[BackpackBot] LLM texto para ${phoneNumber} | productos=${products.length} | modelo=${getLlmModel()} | base=${getLlmBaseUrl()}`
    )

    let reply: string
    try {
      reply = await this.withCustomerTyping(message, () =>
        runBackpackAgentTurn({
          userText: body,
          policy: {
            customerFacts: policy.customerFacts,
            rulesForBot: policy.rulesForBot,
            interactionWorkflow: policy.interactionWorkflow
          },
          products,
          history: prevHistory,
          temperature: 0.2
        })
      )
    } catch (err) {
      console.error('[BackpackBot] Agente IA no disponible:', err)
      await this.replyToCustomer(
        message,
        '⚠️ No pude preparar la respuesta automática en este momento. Por favor intenta de nuevo.',
        phoneNumber
      )
      return
    }

    if (!reply || reply.trim().length === 0) {
      await this.replyToCustomer(
        message,
        '⚠️ No pude preparar una respuesta. Por favor intenta de nuevo.',
        phoneNumber
      )
      return
    }

    if (reply.length > BackpackWhatsAppBot.WHATSAPP_REPLY_MAX) {
      reply = reply.slice(0, BackpackWhatsAppBot.WHATSAPP_REPLY_MAX - 20) + '\n…'
    }

    await this.replyToCustomer(message, reply, phoneNumber)
    await this.sendMatchedCatalogImages(message, reply, products)

    const nextHistory: BackpackAgentHistoryTurn[] = [
      ...prevHistory,
      { role: 'user', content: body.slice(0, 2000) },
      { role: 'assistant', content: reply.slice(0, 2000) }
    ]
    while (nextHistory.length > 8) {
      nextHistory.shift()
    }
    await this.updateSessionState(phoneNumber, 'agent', {
      agentHistory: nextHistory
    })
  }

  private async handleMessage(
    message: Message,
    options: { allowFromMe?: boolean } = {}
  ) {
    if (message.fromMe && !options.allowFromMe) return
    const contact = await message.getContact()
    const phoneNumber = contact.number
    const body =
      typeof message.body === 'string'
        ? message.body.trim()
        : String(message.body ?? '').trim()
    const lowerBody = body.toLowerCase()

    if (message.from === 'status@broadcast' || message.from.endsWith('@g.us')) return

    try {
      const session = await this.getSession(phoneNumber)
      const isAdmin = await this.isAdminPhoneNumber(phoneNumber)
      await this.saveConversationMessage({
        phoneNumber,
        role: 'user',
        body: this.messageHasImage(message)
          ? `[imagen] ${body || '(sin texto)'}`
          : body || '(mensaje vacío)',
        messageType: this.messageHasImage(message) ? 'image' : 'text'
      })
      console.log(
        `[BackpackBot] Mensaje recibido de ${phoneNumber} | fromMe=${message.fromMe} | admin=${isAdmin} | estado=${session.state} | texto="${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"`
      )

      if (session.state === 'soldProducts') {
        if (isAdmin) {
          await this.handleSoldProductsTurn(message, phoneNumber, body, lowerBody)
          return
        }
        await this.updateSessionState(phoneNumber, 'agent')
      }

      if (isAdmin && (lowerBody === 'productos vendidos' || lowerBody === 'ventas')) {
        await this.enterSoldProductsMode(message, phoneNumber)
        return
      }

      if (isAdmin && (lowerBody === 'corte' || lowerBody === 'corte de caja')) {
        await this.createCashCut(message, phoneNumber)
        return
      }

      // Comandos admin por número. El menú público 1-8 queda desactivado:
      // las preguntas de clientes se contestan siempre con el LLM local.
      const menuNum = this.parseMenuNumber(body)
      if (isAdmin && menuNum === 9) {
        await this.enterSoldProductsMode(message, phoneNumber)
        return
      }
      if (isAdmin && menuNum === 10) {
        await this.createCashCut(message, phoneNumber)
        return
      }

      if (session.state !== 'agent') {
        await this.updateSessionState(phoneNumber, 'agent')
      }

      if (this.messageHasImage(message)) {
        await this.handleAgentVisionTurn(message, phoneNumber, body)
        return
      }

      await this.handleAgentTurn(message, phoneNumber, body, lowerBody)
    } catch (error) {
      console.error('[BackpackBot] Error:', error)
      await this.replyToCustomer(
        message,
        'Ocurrió un error. Por favor intenta más tarde.',
        phoneNumber
      )
      this.clearSession(phoneNumber)
    }
  }

  public async start() {
    if (this.isReady || this.isStarting || this.hasStarted) {
      return
    }
    this.isStarting = true
    this.hasStarted = true
    try {
      this.cleanupStaleBrowserLock()
      await this.client.initialize()
    } catch (error) {
      this.hasStarted = false
      console.error('[BackpackBot] Error iniciando:', error)
      try {
        await this.client.destroy()
      } catch {
        /* ignore cleanup */
      }
      this.resetClient()
      throw error
    } finally {
      this.isStarting = false
    }
  }

  public async stop() {
    try {
      await this.client.destroy()
      this.isReady = false
      this.isStarting = false
      this.hasStarted = false
      this.lastQr = null
    } catch (error) {
      console.error('[BackpackBot] Error deteniendo:', error)
    }
  }

  public async logoutSession() {
    try {
      if (this.isReady) {
        await this.client.logout()
      }
    } catch (error) {
      console.error('[BackpackBot] Error cerrando sesión:', error)
    } finally {
      await this.stop()
      this.resetClient()
    }
  }

  public getClient() {
    return this.client
  }

  public isBotReady() {
    return this.isReady
  }

  public isBotStarting() {
    return this.isStarting || (this.hasStarted && !this.isReady)
  }

  public getLastQr() {
    return this.lastQr
  }
}

const globalForBackpackBot = globalThis as typeof globalThis & {
  __backpackBotInstance?: BackpackWhatsAppBot | null
}

export function getBackpackBotInstance(): BackpackWhatsAppBot {
  if (!globalForBackpackBot.__backpackBotInstance) {
    globalForBackpackBot.__backpackBotInstance = new BackpackWhatsAppBot()
  }
  return globalForBackpackBot.__backpackBotInstance
}

if (require.main === module) {
  const bot = getBackpackBotInstance()
  bot.start().catch(console.error)
}

export default BackpackWhatsAppBot
