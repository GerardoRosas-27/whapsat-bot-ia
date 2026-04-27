import 'dotenv/config'
import { Client, Message, MessageMedia } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { prisma } from '../lib/prisma'
import { createWhatsAppClient } from '../shared/whatsapp'
import {
  backpackLlmChat,
  getLlmBaseUrl,
  getLlmModel,
  isBackpackLlmEnabled
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

/** Palabras que sacan al usuario del modo "Agente IA" y lo regresan al menú clásico. */
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

/** Mensaje de bienvenida con menú de filtros (género 1-2, uso 3-4, precio 5-6-7) y búsqueda por descripción */
const WELCOME_MENU = `👜 *Bienvenido a Mochilas y Novedades Kira*
Busquemos juntos la mochila que más se acople a tu estilo:

*Directamente por descripción:*
Escribe cómo es la mochila que buscas (ej: con espacio para laptop, color negro)

*o elige un filtro por número:*

*Menú por género:*
1️⃣ Mujer
2️⃣ Hombre

*Menú por uso:*
3️⃣ Escolar
4️⃣ Trabajo

*Menú por precio:*
5️⃣ Menor a $160
6️⃣ Entre $160 y $260
7️⃣ Mayor a $260

*Asistente con IA:*
8️⃣ Hablar con el *Agente IA* (resuelve dudas con lenguaje natural)

📷 *Buscar por foto:* envía una imagen de la mochila que buscas y el Agente IA la compara con nuestro catálogo.

*Información del negocio:*
Escribe *info* o *horarios* (envíos, mayoreo, modelos, etc.)

*Novedades:*
Escribe *catálogo* o *novedades* para ver los 5 modelos más recientes.

Responde con el número *(1 al 8)* o escribe tu descripción.`

const ADMIN_MENU = `

*Opciones admin:*
9️⃣ Productos vendidos
🔟 Corte de caja`

const BACKPACK_POLICY_CACHE_MS = 45_000

/** Frases que disparan la respuesta de información del negocio (además de *info*, *horarios*, etc.) */
const BUSINESS_INFO_PHRASES = [
  'horario',
  'horarios',
  'a qué hora',
  'a que hora',
  'qué hora abren',
  'que hora abren',
  'abren',
  'cierran',
  'cerrado',
  'abierto',
  'envío',
  'envio',
  'envían',
  'envian',
  'mayoreo',
  'minorista',
  'menudeo',
  'por mayor',
  'por menor',
  'mayorista',
  'dirección',
  'direccion',
  'ubicación',
  'ubicacion',
  'donde están',
  'donde estan',
  'dónde están',
  'teléfono',
  'telefono',
  'contacto',
  'información',
  'informacion',
  'política',
  'politica'
]

class BackpackWhatsAppBot {
  private client: Client
  private isReady = false
  private userSessions: Map<string, BackpackUserSession> = new Map()
  private policyCache: {
    rulesForBot: string
    customerFacts: string
    interactionWorkflow: string
    fetchedAt: number
  } | null = null

  constructor() {
    this.client = createWhatsAppClient('.wwebjs_auth_backpack')
    this.setupEventHandlers()
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
      console.log('[BackpackBot] Escanea este código QR con WhatsApp (cuenta secundaria):')
      qrcode.generate(qr, { small: true })
    })

    this.client.on('ready', () => {
      console.log('[BackpackBot] Bot de Mochilas listo!')
      console.log(
        `[BackpackBot] Agente IA disponible bajo demanda (opción 8) → ${getLlmBaseUrl()} | modelo: ${getLlmModel()}`
      )
      if (isBackpackLlmEnabled()) {
        console.log(
          '[BackpackBot] Nota: BACKPACK_LLM_ENABLED=true queda como informativo. ' +
            'El LLM solo se usa cuando el cliente elige la opción 8 (Agente IA).'
        )
      }
      this.isReady = true
    })

    this.client.on('authenticated', () => {
      console.log('[BackpackBot] Autenticado correctamente')
    })

    this.client.on('auth_failure', (msg) => {
      console.error('[BackpackBot] Error de autenticación:', msg)
    })

    this.client.on('message', async (message: Message) => {
      await this.handleMessage(message)
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
    return Boolean(adminNumber?.isActive)
  }

  private buildWelcomeMenu(isAdmin: boolean): string {
    return isAdmin ? `${WELCOME_MENU}${ADMIN_MENU}` : WELCOME_MENU
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

  /** Respuesta vía LM Studio (OpenAI-compatible) con catálogo y opcional visión. */
  private async replyWithLlm(
    message: Message,
    phoneNumber: string,
    body: string
  ): Promise<void> {
    const policy = await this.getBackpackPolicy()
    const products = await fetchBackpackCatalogForLlm()
    const userImageDataUrl = await this.extractUserImageDataUrl(message)
    const catalogRefCount = userImageDataUrl
      ? pickCatalogReferenceImages(products).length
      : 0

    console.log(
      `[BackpackBot] LLM turn: texto="${body.slice(0, 80)}${body.length > 80 ? '…' : ''}" | imagenUsuario=${Boolean(userImageDataUrl)} | imgsCatálogo=${catalogRefCount}`
    )

    const session = await this.getSession(phoneNumber)
    const prevHistory = session.context?.llmHistory ?? []

    let reply = await runBackpackLlmTurn({
      userText: body,
      userImageDataUrl,
      policy: {
        rulesForBot: policy.rulesForBot,
        customerFacts: policy.customerFacts,
        interactionWorkflow: policy.interactionWorkflow
      },
      products,
      history: prevHistory,
      temperature: 0.45
    })

    if (reply.length > BackpackWhatsAppBot.WHATSAPP_REPLY_MAX) {
      reply =
        reply.slice(0, BackpackWhatsAppBot.WHATSAPP_REPLY_MAX - 20) + '\n…'
    }

    await message.reply(reply)

    const userLog =
      (userImageDataUrl ? '[imagen] ' : '') +
      (body.trim() || '(sin texto)')
    const nextHistory: LlmTurn[] = [
      ...prevHistory,
      { role: 'user', content: userLog.slice(0, 2000) },
      { role: 'assistant', content: reply.slice(0, 2000) }
    ]
    while (nextHistory.length > 8) {
      nextHistory.shift()
    }
    await this.updateSessionState(phoneNumber, 'idle', {
      llmHistory: nextHistory
    })
  }

  /** Cantidad de productos recientes a mostrar cuando el usuario pide el catálogo */
  private static readonly CATALOG_LATEST_LIMIT = 5

  /** Frases que indican que el usuario quiere ver el catálogo / productos más recientes */
  private static readonly CATALOG_REQUEST_PHRASES = [
    'catálogo',
    'catalogo',
    'catálogos',
    'catalogos',
    'novedades',
    'nuevos productos',
    'productos nuevos',
    'nuevos modelos',
    'modelos nuevos',
    'últimos modelos',
    'ultimos modelos',
    'últimas mochilas',
    'ultimas mochilas',
    'mochilas nuevas',
    'lo más nuevo',
    'lo mas nuevo',
    'lo nuevo',
    'qué hay nuevo',
    'que hay nuevo',
    'qué tienes nuevo',
    'que tienes nuevo',
    'qué tienen nuevo',
    'que tienen nuevo',
    'otros modelos',
    'otro modelo',
    'tienen otros',
    'hay otros',
    'más modelos',
    'mas modelos'
  ]

  /** Detecta si el usuario está pidiendo ver el catálogo / productos más recientes */
  private isCatalogRequest(lowerBody: string): boolean {
    const t = lowerBody.trim()
    if (!t || t.length > 140) return false
    if (/^\d+$/.test(t)) return false
    return BackpackWhatsAppBot.CATALOG_REQUEST_PHRASES.some((p) => t.includes(p))
  }

  /** Obtiene los N productos más recientes (por createdAt desc) activos */
  private async getLatestProducts(limit: number) {
    return prisma.backpackProduct.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }

  private isExplicitInfoCommand(lowerBody: string): boolean {
    const t = lowerBody.trim()
    if (t === 'info' || t === 'datos') return true
    if (t === 'horarios' || t === 'horario') return true
    if (t === 'información' || t === 'informacion') return true
    if (t.startsWith('info ') || t.startsWith('datos ')) return true
    return false
  }

  /** Evita confundir descripciones largas de producto con preguntas de tienda */
  private messageLooksLikeBusinessInfo(lowerBody: string): boolean {
    const t = lowerBody.trim()
    if (t.length > 140) return false
    if (/^\d+$/.test(t)) return false
    return BUSINESS_INFO_PHRASES.some((p) => t.includes(p))
  }

  private formatCustomerFactsReply(facts: string): string {
    if (!facts) {
      return (
        '📋 Aún no hay información de tienda configurada.\n\n' +
        'Escribe *hola* para ver el menú de productos.'
      )
    }
    return `📋 *Información*\n\n${facts}\n\n_Escribe *hola* para el menú de mochilas._`
  }

  /** Buscar productos por nombre o descripción (en existencia), insensible a mayúsculas */
  private async searchProducts(query: string): Promise<Awaited<ReturnType<typeof prisma.backpackProduct.findMany>>> {
    const term = query.trim()
    if (!term) return []
    const products = await prisma.backpackProduct.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 }
      },
      orderBy: { name: 'asc' }
    })
    const lowerTerm = term.toLowerCase()
    return products.filter(
      p =>
        p.name.toLowerCase().includes(lowerTerm) ||
        p.description.toLowerCase().includes(lowerTerm)
    )
  }

  /** Detectar si el mensaje es una pregunta por precio */
  private isPriceQuestion(text: string): boolean {
    const t = text.trim().toLowerCase()
    const keywords = ['cuanto cuesta', 'cuánto cuesta', 'cuanto vale', 'cuánto vale', 'precio de', 'precio del', 'precio la', 'cual es el precio', 'qué precio', 'que precio', 'a cómo', 'a cuanto', 'cuesta la', 'cuesta el']
    return keywords.some(k => t.includes(k))
  }

  /** Para pregunta de precio: extraer término de búsqueda (quitar frases de precio) */
  private getSearchTermFromPriceQuestion(text: string): string {
    let t = text.trim().toLowerCase()
    const remove = ['cuanto cuesta', 'cuánto cuesta', 'cuanto vale', 'cuánto vale', 'precio de', 'precio del', 'precio la', 'cual es el precio', 'qué precio tiene', 'que precio tiene', 'a cómo', 'a cuanto', 'cuesta la', 'cuesta el', 'el', 'la', 'las', 'los']
    for (const r of remove) {
      t = t.replace(new RegExp(r, 'gi'), ' ')
    }
    return t.replace(/\s+/g, ' ').trim()
  }

  /** Productos por género (mujer = woman o unisex, hombre = man o unisex) */
  private async getProductsByGender(gender: 'woman' | 'man') {
    return prisma.backpackProduct.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        OR: [{ gender }, { gender: 'unisex' }]
      },
      orderBy: { name: 'asc' }
    })
  }

  /** Productos por uso (escolar / trabajo) */
  private async getProductsByUse(useType: 'school' | 'work') {
    return prisma.backpackProduct.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        useType
      },
      orderBy: { name: 'asc' }
    })
  }

  /** Productos por rango de precio */
  private async getProductsByPriceRange(min: number, max: number | null) {
    const where: { isActive: boolean; stock: { gt: number }; price?: { gte?: number; lte?: number; gt?: number } } = {
      isActive: true,
      stock: { gt: 0 }
    }
    if (max !== null) {
      where.price = { gte: min, lte: max }
    } else {
      where.price = { gt: min }
    }
    return prisma.backpackProduct.findMany({
      where,
      orderBy: { name: 'asc' }
    })
  }

  private parseMenuNumber(text: string): number | null {
    const match = text.match(/^(\d+)/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= 10) return num
    }
    return null
  }

  /** Formatear lista de productos y pie con menú */
  private formatProductList(
    products: Awaited<ReturnType<typeof prisma.backpackProduct.findMany>>,
    title: string
  ): string {
    if (products.length === 0) return `${title}\n\nNo hay productos en existencia con ese filtro.`
    let reply = `${title}\n\n`
    products.forEach((p, i) => {
      reply += `*${i + 1}. ${p.name}*\n`
      reply += `${p.description}\n`
      reply += `Precio: ${this.formatPrice(p.price)}\n`
      reply += `Stock: ${p.stock}\n\n`
    })
    reply += `_Escribe *hola* para ver el menú de nuevo._`
    return reply.trim()
  }

  /** URL absoluta para imágenes del servidor (el bot necesita una URL pública para WhatsApp) */
  private getImageUrl(imageUrl: string | null): string | null {
    if (!imageUrl || !imageUrl.trim()) return null
    const u = imageUrl.trim()
    return u.startsWith('http') ? u : `${APP_BASE_URL.replace(/\/$/, '')}${u.startsWith('/') ? u : `/${u}`}`
  }

  /** Envía lista de productos y, si tienen imagen, envía cada imagen con caption */
  private async sendProductListWithImages(
    message: Message,
    products: Awaited<ReturnType<typeof prisma.backpackProduct.findMany>>,
    title: string
  ): Promise<void> {
    const textReply = this.formatProductList(products, title)
    await message.reply(textReply)
    for (const p of products) {
      const fullUrl = this.getImageUrl(p.imageUrl)
      if (!fullUrl) continue
      try {
        const media = await MessageMedia.fromUrl(fullUrl, { unsafeMime: true })
        const caption = `*${p.name}*\n${p.description}\nPrecio: ${this.formatPrice(p.price)}\nStock: ${p.stock}`
        await this.client.sendMessage(message.from, media, { caption })
      } catch (err) {
        console.error('[BackpackBot] No se pudo enviar imagen:', fullUrl, err)
      }
    }
  }

  /** Envía los últimos N productos con un formato breve (nombre + precio + imagen) */
  private async sendLatestCatalog(message: Message): Promise<void> {
    const products = await this.getLatestProducts(
      BackpackWhatsAppBot.CATALOG_LATEST_LIMIT
    )

    if (products.length === 0) {
      await message.reply(
        '🆕 Aún no hay productos registrados en el catálogo.\n\n' +
        '_Escribe *hola* para ver el menú principal._'
      )
      return
    }

    const title = `🆕 *Nuevos modelos* (los ${products.length} más recientes):`
    let textReply = `${title}\n\n`
    products.forEach((p, i) => {
      textReply += `*${i + 1}. ${p.name}*\n`
      textReply += `Precio: ${this.formatPrice(p.price)}\n\n`
    })
    textReply += '_Escribe *hola* para ver el menú completo._'
    await message.reply(textReply.trim())

    for (const p of products) {
      const fullUrl = this.getImageUrl(p.imageUrl)
      if (!fullUrl) continue
      try {
        const media = await MessageMedia.fromUrl(fullUrl, { unsafeMime: true })
        const caption = `*${p.name}*\nPrecio: ${this.formatPrice(p.price)}`
        await this.client.sendMessage(message.from, media, { caption })
      } catch (err) {
        console.error(
          '[BackpackBot] No se pudo enviar imagen del catálogo:',
          fullUrl,
          err
        )
      }
    }
  }

  private async sendWelcomeMenu(message: Message, phoneNumber: string) {
    const isAdmin = await this.isAdminPhoneNumber(phoneNumber)
    await this.updateSessionState(phoneNumber, 'idle', {
      agentHistory: []
    })
    await message.reply(this.buildWelcomeMenu(isAdmin))
  }

  /** Activa el modo "Agente IA" para este usuario (independiente de BACKPACK_LLM_ENABLED). */
  private async enterAgentMode(
    message: Message,
    phoneNumber: string
  ): Promise<void> {
    await this.updateSessionState(phoneNumber, 'agent', {
      agentHistory: []
    })
    await message.reply(
      '🤖 *Agente IA activado*\n\n' +
        'Puedes preguntarme en lenguaje natural sobre nuestras mochilas, precios, existencias, horarios, envíos, etc.\n\n' +
        '_Para regresar al menú principal escribe *menu* o *salir*._'
    )
  }

  private async enterSoldProductsMode(
    message: Message,
    phoneNumber: string
  ): Promise<void> {
    await this.updateSessionState(phoneNumber, 'soldProducts')
    await message.reply(
      '🧾 *Productos vendidos*\n\n' +
        'Manda cada venta en un mensaje y la guardaré para el corte de caja.\n\n' +
        'Ejemplos:\n' +
        '- 1 set de pinzas de 20\n' +
        '- mochila sapo de poliester de 180\n\n' +
        '_Escribe *menu* para regresar o *corte* para hacer corte de caja._'
    )
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
    await message.reply(
      `✅ Venta guardada (#${saved.id.slice(-6)}).\n\n` +
        'Manda otra venta o escribe *corte* para generar el corte de caja.'
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
      await message.reply(
        'No hay productos vendidos pendientes de corte.\n\n' +
          '_Escribe *9* para capturar ventas o *hola* para ver el menú._'
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
      await message.reply(
        '⚠️ No pude conectar con LM Studio para calcular el corte. Las ventas siguen pendientes.'
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

    await message.reply(
      `💵 *Corte de caja*\n\n${result}\n\n` +
        `Ventas incluidas: ${entries.length}\nFolio: ${cashCut.id.slice(-8)}`
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
      await this.sendWelcomeMenu(message, phoneNumber)
      return
    }
    if (trimmed === 'corte' || trimmed === 'corte de caja' || trimmed === '10') {
      await this.createCashCut(message, phoneNumber)
      return
    }
    if (!body.trim()) {
      await message.reply('Manda el producto vendido o escribe *menu* para regresar.')
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
      await message.reply(
        'No pude descargar tu imagen (WhatsApp aún no la entrega o expiró). Por favor reenvíala.'
      )
      return
    }

    const policy = await this.getBackpackPolicy()
    const products = await fetchBackpackCatalogForLlm()
    const session = await this.getSession(phoneNumber)
    const prevVisionHistory = session.context?.llmHistory ?? []

    const catalogRefCount = pickCatalogReferenceImages(products).length
    console.log(
      `[BackpackBot] Agente IA (visión): texto="${body.slice(0, 80)}${body.length > 80 ? '…' : ''}" | imgsCatálogo=${catalogRefCount}`
    )

    let reply: string
    try {
      reply = await runBackpackLlmTurn({
        userText:
          body.trim() ||
          'Busca esta mochila en tu catálogo y dime qué coincidencias hay (nombre exacto, precio y stock). Si ninguna se parece, dilo en una línea.',
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
    } catch (err) {
      console.error('[BackpackBot] Agente IA (visión) no disponible:', err)
      await message.reply(
        '⚠️ El *Agente IA* no pudo analizar tu imagen en este momento. Te regreso al menú principal.'
      )
      await this.sendWelcomeMenu(message, phoneNumber)
      return
    }

    if (!reply || reply.trim().length === 0) {
      await message.reply(
        '⚠️ El *Agente IA* no devolvió una respuesta. Te regreso al menú principal.'
      )
      await this.sendWelcomeMenu(message, phoneNumber)
      return
    }

    if (reply.length > BackpackWhatsAppBot.WHATSAPP_REPLY_MAX) {
      reply = reply.slice(0, BackpackWhatsAppBot.WHATSAPP_REPLY_MAX - 20) + '\n…'
    }

    await message.reply(reply)

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

    // Evita spam: máximo 3 imágenes.
    const toSend = matched.slice(0, 3)
    for (const p of toSend) {
      const fullUrl = this.getImageUrl(p.imageUrl)
      if (!fullUrl) continue
      try {
        const media = await MessageMedia.fromUrl(fullUrl, { unsafeMime: true })
        const caption = `*${p.name}*\nPrecio: ${this.formatPrice(p.price)}${typeof p.stock === 'number' ? ` • Stock: ${p.stock}` : ''}`
        await this.client.sendMessage(message.from, media, { caption })
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
    lowerBody: string
  ): Promise<void> {
    // Salir del agente: regresar al menú clásico sin pasar por el LLM.
    const trimmed = lowerBody.trim()
    if (trimmed && AGENT_EXIT_COMMANDS.has(trimmed)) {
      await this.sendWelcomeMenu(message, phoneNumber)
      return
    }

    // Turno con imagen → usa visión contra el catálogo de la BD.
    if (this.messageHasImage(message)) {
      await this.handleAgentVisionTurn(message, phoneNumber, body)
      return
    }

    const policy = await this.getBackpackPolicy()
    const products = await fetchBackpackCatalogForLlm()
    const session = await this.getSession(phoneNumber)
    const prevHistory = session.context?.agentHistory ?? []

    let reply: string
    try {
      reply = await runBackpackAgentTurn({
        userText: body,
        policy: { customerFacts: policy.customerFacts },
        products,
        history: prevHistory,
        temperature: 0.35
      })
    } catch (err) {
      console.error('[BackpackBot] Agente IA no disponible:', err)
      await message.reply(
        '⚠️ El *Agente IA* no está disponible en este momento. Te regreso al menú principal.'
      )
      await this.sendWelcomeMenu(message, phoneNumber)
      return
    }

    if (!reply || reply.trim().length === 0) {
      await message.reply(
        '⚠️ El *Agente IA* no devolvió una respuesta. Te regreso al menú principal.'
      )
      await this.sendWelcomeMenu(message, phoneNumber)
      return
    }

    if (reply.length > BackpackWhatsAppBot.WHATSAPP_REPLY_MAX) {
      reply = reply.slice(0, BackpackWhatsAppBot.WHATSAPP_REPLY_MAX - 20) + '\n…'
    }

    await message.reply(reply)

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

  private async handleMessage(message: Message) {
    if (message.fromMe) return
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

      if (session.state === 'soldProducts') {
        if (!isAdmin) {
          await this.updateSessionState(phoneNumber, 'idle')
          await message.reply('Tu número ya no tiene permisos admin. Te regreso al menú principal.')
          return
        }
        await this.handleSoldProductsTurn(message, phoneNumber, body, lowerBody)
        return
      }

      // Si el usuario eligió previamente "Agente IA", cada mensaje va al LLM
      // (independiente de BACKPACK_LLM_ENABLED). El resto del flujo clásico queda intacto.
      if (session.state === 'agent') {
        await this.handleAgentTurn(message, phoneNumber, body, lowerBody)
        return
      }

      // Imagen recibida en modo clásico → activa automáticamente el Agente IA
      // y compara la foto contra el catálogo de la base de datos.
      if (this.messageHasImage(message)) {
        await this.updateSessionState(phoneNumber, 'agent', {
          agentHistory: [],
          llmHistory: []
        })
        await this.handleAgentVisionTurn(message, phoneNumber, body)
        return
      }

      // Menú de bienvenida con "hola" o "inicio"
      if (lowerBody === 'hola' || lowerBody === 'hi' || lowerBody === 'inicio') {
        await this.sendWelcomeMenu(message, phoneNumber)
        return
      }

      // Catálogo / novedades: 5 modelos más recientes (se evalúa antes de "info" para
      // que "catálogo" no caiga en el texto genérico del negocio)
      if (this.isCatalogRequest(lowerBody)) {
        await this.sendLatestCatalog(message)
        return
      }

      // Información del negocio (texto configurado en admin: horarios, mayoreo, modelos, etc.)
      if (
        this.isExplicitInfoCommand(lowerBody) ||
        this.messageLooksLikeBusinessInfo(lowerBody)
      ) {
        const { customerFacts } = await this.getBackpackPolicy()
        await message.reply(this.formatCustomerFactsReply(customerFacts))
        return
      }

      if (isAdmin && (lowerBody === 'productos vendidos' || lowerBody === 'ventas')) {
        await this.enterSoldProductsMode(message, phoneNumber)
        return
      }

      if (isAdmin && (lowerBody === 'corte' || lowerBody === 'corte de caja')) {
        await this.createCashCut(message, phoneNumber)
        return
      }

      // Opción de menú por número (1-10; 9 y 10 solo para admins)
      const menuNum = this.parseMenuNumber(body)
      if (menuNum !== null) {
        // Opción 8: entrar al Agente IA (no depende de BACKPACK_LLM_ENABLED)
        if (menuNum === 8) {
          await this.enterAgentMode(message, phoneNumber)
          return
        }
        if (menuNum === 9 || menuNum === 10) {
          if (!isAdmin) {
            await message.reply('Esa opción solo está disponible para números admin.')
            return
          }
          if (menuNum === 9) {
            await this.enterSoldProductsMode(message, phoneNumber)
            return
          }
          await this.createCashCut(message, phoneNumber)
          return
        }
        let products: Awaited<ReturnType<typeof prisma.backpackProduct.findMany>>
        let title: string
        switch (menuNum) {
          case 1:
            products = await this.getProductsByGender('woman')
            title = '👜 *Mochilas - Mujer*'
            break
          case 2:
            products = await this.getProductsByGender('man')
            title = '👜 *Mochilas - Hombre*'
            break
          case 3:
            products = await this.getProductsByUse('school')
            title = '👜 *Mochilas - Uso Escolar*'
            break
          case 4:
            products = await this.getProductsByUse('work')
            title = '👜 *Mochilas - Uso Trabajo*'
            break
          case 5:
            products = await this.getProductsByPriceRange(0, 159.99)
            title = '👜 *Mochilas - Menor a $160*'
            break
          case 6:
            products = await this.getProductsByPriceRange(160, 260)
            title = '👜 *Mochilas - Entre $160 y $260*'
            break
          case 7:
            products = await this.getProductsByPriceRange(260.01, null)
            title = '👜 *Mochilas - Mayor a $260*'
            break
          default:
            products = []
            title = ''
        }
        await this.sendProductListWithImages(message, products, title)
        return
      }

      // Pregunta por precio (ej: "cuánto cuesta")
      if (this.isPriceQuestion(body)) {
        const searchTerm = this.getSearchTermFromPriceQuestion(body)
        const productsByPrice = searchTerm
          ? await this.searchProducts(searchTerm)
          : await prisma.backpackProduct.findMany({
              where: { isActive: true, stock: { gt: 0 } },
              orderBy: { name: 'asc' }
            })
        if (productsByPrice.length > 0) {
          let reply = '💰 *Precios:*\n\n'
          productsByPrice.forEach(p => {
            reply += `*${p.name}*: ${this.formatPrice(p.price)}\n`
          })
          reply += `\n_Escribe *hola* para ver el menú de nuevo._`
          await message.reply(reply.trim())
          return
        }
        await message.reply('No encontré ese producto en existencia. Escribe *hola* para ver el menú.')
        return
      }

      // Búsqueda por descripción (cualquier otro texto)
      const products = await this.searchProducts(body)
      if (products.length > 0) {
        const title = `✅ Encontré ${products.length} producto(s) en existencia:`
        await this.sendProductListWithImages(message, products, title)
        return
      }

      await message.reply(
        'No encontré productos con esa descripción.\n\n' +
        'Escribe *hola* para ver el menú de filtros (género, uso, precio) o prueba con otras palabras.'
      )
    } catch (error) {
      console.error('[BackpackBot] Error:', error)
      await message.reply('Ocurrió un error. Por favor intenta más tarde o escribe *hola*.')
      this.clearSession(phoneNumber)
    }
  }

  public async start() {
    try {
      await this.client.initialize()
    } catch (error) {
      console.error('[BackpackBot] Error iniciando:', error)
      throw error
    }
  }

  public async stop() {
    try {
      await this.client.destroy()
      this.isReady = false
    } catch (error) {
      console.error('[BackpackBot] Error deteniendo:', error)
    }
  }

  public getClient() {
    return this.client
  }

  public isBotReady() {
    return this.isReady
  }
}

let backpackBotInstance: BackpackWhatsAppBot | null = null

export function getBackpackBotInstance(): BackpackWhatsAppBot {
  if (!backpackBotInstance) {
    backpackBotInstance = new BackpackWhatsAppBot()
  }
  return backpackBotInstance
}

if (require.main === module) {
  const bot = getBackpackBotInstance()
  bot.start().catch(console.error)
}

export default BackpackWhatsAppBot
