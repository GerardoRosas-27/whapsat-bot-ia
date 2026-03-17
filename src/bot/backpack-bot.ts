import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { prisma } from '../lib/prisma'

/** URL pública de la app (para que WhatsApp pueda cargar imágenes). En producción define APP_PUBLIC_URL o NEXT_PUBLIC_APP_URL. */
const APP_BASE_URL = process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

type BackpackBotState = 'idle'

interface BackpackUserSession {
  phoneNumber: string
  state: BackpackBotState
  context?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

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

Responde con el número *(1 al 7)* o escribe tu descripción.`

class BackpackWhatsAppBot {
  private client: Client
  private isReady = false
  private userSessions: Map<string, BackpackUserSession> = new Map()

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: '.wwebjs_auth_backpack'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    })
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
      if (num >= 1 && num <= 7) return num
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

  private async sendWelcomeMenu(message: Message, phoneNumber: string) {
    await this.updateSessionState(phoneNumber, 'idle', {})
    await message.reply(WELCOME_MENU)
  }

  private async handleMessage(message: Message) {
    if (message.fromMe) return
    const contact = await message.getContact()
    const phoneNumber = contact.number
    const body = message.body.trim()
    const lowerBody = body.toLowerCase()

    if (message.from === 'status@broadcast' || message.from.endsWith('@g.us')) return

    try {
      await this.getSession(phoneNumber)

      // Menú de bienvenida con "hola" o "inicio"
      if (lowerBody === 'hola' || lowerBody === 'hi' || lowerBody === 'inicio') {
        await this.sendWelcomeMenu(message, phoneNumber)
        return
      }

      // Opción de menú por número (1-7)
      const menuNum = this.parseMenuNumber(body)
      if (menuNum !== null) {
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
