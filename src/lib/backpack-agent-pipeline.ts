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
import {
  findSimilarBackpackProducts,
  getBackpackProductMatchLimit,
  getBackpackTextSimilarityThreshold,
  genderLabel,
  useTypeLabel
} from './backpack-product-similarity'

export type BackpackAgentHistoryTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type BackpackAgentPolicySlice = {
  customerFacts: string
  rulesForBot?: string
  interactionWorkflow?: string
}

type AgentScope = 'product' | 'business' | 'mixed' | 'out_of_scope' | 'unknown'

type GroundedAgentContext = {
  scope: AgentScope
  userText: string
  products: BackpackProduct[]
  businessFacts: string
  fallbackReply?: string
  searchSummary: string
}

const DEFAULT_LLM_HISTORY_MESSAGES = 5
const OUT_OF_SCOPE_FALLBACK =
  'Solo te puedo ayudar con información de nuestras mochilas y la tienda. ¿Qué modelo buscas?'
const UNKNOWN_PRODUCT_FALLBACK =
  'No encontré ese modelo en nuestro catálogo. Puedo buscar otro modelo o característica disponible.'
const UNKNOWN_BUSINESS_FACT_FALLBACK =
  'No tengo ese dato confirmado. Puedes preguntar por otro dato de la tienda o contactar directo al negocio.'
const MALFORMED_REPLY_FALLBACK =
  'Disculpa, no pude preparar bien la respuesta. ¿Me escribes de nuevo qué mochila buscas?'

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
  rulesForBot?: string
  interactionWorkflow?: string
  catalogText: string
  retrievedContext: string
}): string {
  const facts =
    parts.customerFacts.trim() ||
    '(Sin datos oficiales cargados. Indica que no tienes ese dato y sugiere contactar a la tienda.)'
  const compactContext = truncateForPrompt(parts.retrievedContext, 6000)
  return `Respondes WhatsApp de una tienda de mochilas escolares como una persona de mostrador.
Tu salida debe ser ÚNICAMENTE el mensaje final que se enviará al cliente.
No escribas análisis, planes, instrucciones, intención del cliente ni razonamiento.
No digas que eres bot, IA, vendedor, asistente ni "soy de la tienda".
No uses frases como: "el usuario quiere", "el cliente pregunta", "cliente solicita", "revisando el catálogo", "catálogo disponible", "debo responder", "mi objetivo", "respuesta a generar", "confirmar disponibilidad", "ofrecer información".
Nunca escribas bloques de análisis antes de responder. Prohibido este formato:
Cliente pregunta por ...
Revisando el catálogo disponible:
1. ...
Respuesta a generar ...
Confirmar disponibilidad y ofrecer información si es necesario.
Si piensas eso internamente, NO lo incluyas. Escribe solo la respuesta final, por ejemplo: "Sí, tenemos la mochila de batman grande para escuela."
Usa solo productos de la base de datos e información del negocio configurada en la base de datos.
Si preguntan ubicación, dirección o cómo llegar, incluye el enlace de Google Maps si aparece en la información oficial y menciona que enviarás el croquis si está disponible.
Si piden fotos o imágenes, decide tú cuáles modelos cumplen mejor con las características pedidas usando el catálogo completo. Responde con máximo 3 modelos y escribe sus nombres exactos como aparecen en "Catálogo disponible"; el sistema enviará fotos solo de esos nombres exactos.
Si preguntan por productos disponibles, responde: "Sí, claro, estos son los modelos que manejamos:" y lista productos por nombre exacto.
No inventes datos. Sé cordial, directo y natural.

Ejemplos de estilo:
Cliente: Hola
Respuesta: Hola, ¿qué modelo o tipo de mochila buscas?
Cliente: ¿Qué mochilas tienen?
Respuesta: Sí, claro, estos son los modelos que manejamos:

Info negocio: ${truncateForPrompt(facts, 260)}

Catálogo disponible:
${compactContext}`
}

/** Quita cualquier residuo de razonamiento que haya esquivado el sanitizador base. */
function finalCleanup(reply: string): string {
  let t = reply.trim()
  t = t
    .replace(/^```[a-z0-9_-]*\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^\s*(respuesta|mensaje final|assistant|asistente)\s*:\s*/i, '')
    .trim()
  t = stripReasoningBeforeFinalAnswer(t)
  const openThink = /<(think|thinking|reasoning|redacted_thinking)>/i
  const m = openThink.exec(t)
  if (m && m.index === 0) {
    const closing = new RegExp(`</${m[1]}>`, 'i')
    const close = closing.exec(t)
    if (close) {
      t = t.slice(close.index + close[0].length).trim()
    }
  }
  t = collapseDuplicatedReply(t)
  return limitReplyLines(t)
}

function collapseDuplicatedReply(text: string): string {
  const t = text.trim()
  if (!t) return t

  const compact = t.replace(/\s+/g, ' ')
  if (compact.length % 2 === 0) {
    const half = compact.length / 2
    const left = compact.slice(0, half).trim()
    const right = compact.slice(half).trim()
    if (left && left === right) return left
  }

  const sentenceMatch = /^(.+?[.!?])\s*\1$/s.exec(compact)
  if (sentenceMatch?.[1]) return sentenceMatch[1].trim()

  return t
}

function stripReasoningBeforeFinalAnswer(text: string): string {
  const actionPreamble = text.match(
    /^(?:confirmar\s+disponibilidad|ofrecer\s+informaci[oó]n|confirmar\s+[^.!?]*|ofrecer\s+[^.!?]*)(?:\s+y\s+(?:confirmar|ofrecer)\s+[^.!?]*)*[.!?]\s*/i
  )
  if (actionPreamble?.[0]) {
    const cut = text.slice(actionPreamble[0].length).trim()
    if (cut.length >= 3) return cut
  }

  const gluedFinal = text.match(
    /(?:respuesta\s+a\s+generar\b[^.!?\n]*(?:[.!?]\s*)?)(?=(¡?hola\b|s[ií],?\s|claro\b|tenemos\b|manejamos\b|te\s|la\s|el\s|hay\s))/i
  )
  if (gluedFinal?.index != null) {
    const start = gluedFinal.index + gluedFinal[0].length
    const cut = text.slice(start).trim()
    if (cut.length >= 3) return cut
  }

  const markers = [
    /(?:^|\n)\s*(?:respuesta|respuesta final|mensaje final)\s*:\s*/i,
    /(?:^|\n)\s*(?:respuesta a generar)(?:\s+debe\s+ser[^:\n.]*)?\s*[:.]?\s*/i,
    /(?:^|\n)\s*(?:contestar|responder)\s*:\s*/i
  ]
  for (const marker of markers) {
    const matches = [...text.matchAll(new RegExp(marker.source, `${marker.flags}g`))]
    const last = matches[matches.length - 1]
    if (last?.index != null) {
      const cut = text.slice(last.index + last[0].length).trim()
      if (cut.length >= 3) return cut
    }
  }

  const directStart = text.search(
    /(?:^|\n|\.)(¡?Hola\b|S[ií],?\s*claro\b|Claro\b|Tenemos\b|Manejamos\b|Estamos\b|Nuestro horario\b|La dirección\b|Hay\b|Te\s+(?:env[ií]o|mando|paso)\b)/i
  )
  if (directStart > 0) {
    const preamble = text.slice(0, directStart)
    if (
      looksLikeMetaNarration(preamble) ||
      /\b(cordial|direct[ao]|natural|regla|instrucci[oó]n|usando la informaci[oó]n|siguiendo)\b/i.test(
        preamble
      )
    ) {
      return text.slice(directStart).replace(/^[.\s]+/, '').trim()
    }
  }
  return text
}

function limitReplyLines(reply: string): string {
  const lines = reply
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length <= 6) return lines.join('\n').trim()
  return lines.slice(0, 6).join('\n').trim()
}

function truncateForPrompt(text: string, maxChars: number): string {
  const normalized = text.trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars).trim()}\n...(recortado)`
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOP_WORDS = new Set([
  'hola',
  'buenos',
  'buenas',
  'tardes',
  'dias',
  'noches',
  'quiero',
  'quisiera',
  'busco',
  'buscando',
  'tienen',
  'tiene',
  'hay',
  'me',
  'puedes',
  'puede',
  'dar',
  'decir',
  'mostrar',
  'muestras',
  'ver',
  'para',
  'con',
  'sin',
  'que',
  'cual',
  'cuanto',
  'cuesta',
  'precio',
  'stock',
  'disponible',
  'disponibles',
  'mochila',
  'mochilas',
  'bolsa',
  'bolsas',
  'modelo',
  'modelos',
  'color',
  'colores',
  'foto',
  'fotos',
  'imagen',
  'imagenes',
  'muestra',
  'muestras',
  'mandame',
  'mandar',
  'pasame',
  'pasar',
  'solo',
  'manejan',
  'manejas'
])

const PRODUCT_TERMS = [
  'mochila',
  'mochilas',
  'morral',
  'bolsa',
  'bolsas',
  'escolar',
  'escuela',
  'clases',
  'trabajo',
  'oficina',
  'laptop',
  'hombre',
  'mujer',
  'dama',
  'caballero',
  'unisex',
  'precio',
  'stock',
  'existencia',
  'disponible',
  'catalogo',
  'modelo'
]

const BUSINESS_TERMS = [
  'ubicacion',
  'direccion',
  'maps',
  'google',
  'croquis',
  'llegar',
  'donde',
  'local',
  'plaza',
  'horario',
  'hora',
  'abren',
  'cierran',
  'cerrado',
  'abierto',
  'envio',
  'envios',
  'mayoreo',
  'pago',
  'pagos',
  'contacto',
  'telefono',
  'tienda'
]

const OUT_OF_SCOPE_TERMS = [
  'clima',
  'receta',
  'programacion',
  'codigo',
  'javascript',
  'python',
  'politica',
  'futbol',
  'tarea',
  'medico',
  'legal',
  'chiste',
  'noticias'
]

function extractSearchTerms(text: string): string[] {
  const normalized = normalizeText(text)
  const terms = normalized
    .split(' ')
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    .flatMap((term) => {
      const variants = [term]
      if (term.endsWith('es') && term.length > 5) variants.push(term.slice(0, -2))
      if (term.endsWith('s') && term.length > 4) variants.push(term.slice(0, -1))
      return variants
    })
  return [...new Set(terms)]
}

function hasAnyTerm(normalizedText: string, terms: string[]): boolean {
  return terms.some((term) => normalizedText.includes(term))
}

function inferScope(userText: string): AgentScope {
  const normalized = normalizeText(userText)
  const productIntent = hasAnyTerm(normalized, PRODUCT_TERMS)
  const businessIntent = hasAnyTerm(normalized, BUSINESS_TERMS)
  const outOfScopeIntent = hasAnyTerm(normalized, OUT_OF_SCOPE_TERMS)

  if (!productIntent && !businessIntent && outOfScopeIntent) return 'out_of_scope'
  if (productIntent && businessIntent) return 'mixed'
  if (productIntent) return 'product'
  if (businessIntent) return 'business'
  return 'unknown'
}

function isSpecificProductSearch(userText: string): boolean {
  const terms = extractSearchTerms(userText)
  if (terms.length > 0) return true
  return /\b(roja|rojo|azul|negra|negro|rosa|verde|morada|morado|grande|chica|chico|laptop)\b/i.test(
    normalizeText(userText)
  )
}

function selectRelevantBusinessFacts(userText: string, customerFacts: string): string {
  const facts = customerFacts.trim()
  if (!facts) return ''

  const normalizedUser = normalizeText(userText)
  const lines = facts
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 12) return facts

  const relevant = lines.filter((line) => {
    const normalizedLine = normalizeText(line)
    return BUSINESS_TERMS.some(
      (term) => normalizedUser.includes(term) && normalizedLine.includes(term)
    )
  })

  return relevant.length > 0 ? relevant.join('\n') : facts
}

function formatProductsForGrounding(products: BackpackProduct[]): string {
  if (products.length === 0) return '(No se recuperaron productos relevantes.)'
  return products
    .map(
      (p, index) =>
        `${index + 1}. *${p.name}* | precio:$${Number(p.price).toFixed(2)} | stock:${p.stock} | género:${genderLabel(p.gender) || p.gender} | uso:${useTypeLabel(p.useType) || p.useType}\n   ${p.description}`
    )
    .join('\n')
}

function buildGroundingContext(input: {
  userText: string
  customerFacts: string
  products: BackpackProduct[]
}): GroundedAgentContext {
  const scope = inferScope(input.userText)
  if (scope === 'out_of_scope') {
    return {
      scope,
      userText: input.userText,
      products: [],
      businessFacts: '',
      fallbackReply: OUT_OF_SCOPE_FALLBACK,
      searchSummary: 'La pregunta está fuera del alcance de venta de mochilas/tienda.'
    }
  }

  const needsProducts = scope === 'product' || scope === 'mixed' || scope === 'unknown'
  const needsBusinessFacts = scope === 'business' || scope === 'mixed'
  const products = needsProducts ? input.products : []
  const businessFacts = needsBusinessFacts
    ? selectRelevantBusinessFacts(input.userText, input.customerFacts)
    : ''

  if ((scope === 'product' || scope === 'mixed') && products.length === 0 && isSpecificProductSearch(input.userText)) {
    return {
      scope,
      userText: input.userText,
      products,
      businessFacts,
      fallbackReply: UNKNOWN_PRODUCT_FALLBACK,
      searchSummary: 'No hubo coincidencias de producto en el catálogo activo.'
    }
  }

  if ((scope === 'business' || scope === 'mixed') && !businessFacts.trim()) {
    return {
      scope,
      userText: input.userText,
      products,
      businessFacts,
      fallbackReply: UNKNOWN_BUSINESS_FACT_FALLBACK,
      searchSummary: 'No hay información oficial del negocio para responder ese dato.'
    }
  }

  return {
    scope,
    userText: input.userText,
    products,
    businessFacts,
    searchSummary:
      products.length > 0
        ? `Catálogo completo disponible para que el LLM elija hasta 3 producto(s). Total: ${products.length}.`
        : 'No se recuperaron productos; responder solo con datos oficiales si aplica.'
  }
}

function formatGroundedContext(ctx: GroundedAgentContext): string {
  return `Estado de búsqueda: ${ctx.searchSummary}
Alcance detectado: ${ctx.scope}

Catálogo disponible:
${formatProductsForGrounding(ctx.products)}

Datos oficiales relevantes:
${ctx.businessFacts.trim() || '(No aplica o no hay datos oficiales relevantes para esta pregunta.)'}

Respuesta segura si falta información:
${ctx.fallbackReply || 'Si la respuesta no está respaldada por los bloques anteriores, di que no tienes ese dato confirmado.'}`
}

function looksLikeCodeOrInternalOutput(reply: string): boolean {
  const t = reply.trim()
  if (!t) return true
  return (
    /```/.test(t) ||
    /^\s*[{[]/.test(t) ||
    /\b(role|system|assistant|user)\s*:/i.test(t) ||
    /\b(const|let|function|return|console\.log|import|export|class)\b/.test(t) ||
    /<\/?(think|thinking|reasoning|redacted_thinking|json|code)>/i.test(t) ||
    /\b(response|message|answer)\s*:/i.test(t)
  )
}

function looksLikeMetaNarration(reply: string): boolean {
  return (
    /\b(el usuario|la usuaria|el cliente|la clienta)\s+(quiere|pregunta|solicita|busca|est[aá] pidiendo|desea saber|necesita saber|inicia|env[ií]o|se quej[oó])/i.test(
      reply
    ) ||
    /\b(el usuario|la usuaria|el cliente|la clienta)\s+est[aá]\s+(preguntando|solicitando|buscando|pidiendo)/i.test(
      reply
    ) ||
    /\b(como vendedor|como asistente|debo responder|debo ser|mi objetivo|plan:|razonamiento|información disponible:|cordial,\s*direct[ao]|siguiendo la regla|revisando el cat[aá]logo|respuesta a generar|cat[aá]logo disponible|confirmar disponibilidad|ofrecer informaci[oó]n)/i.test(
      reply
    )
  )
}

function extractPrices(reply: string): string[] {
  return (reply.match(/\$\s*\d+(?:[.,]\d{1,2})?/g) ?? []).map((price) =>
    price.replace(/\s+/g, '').replace(',', '.')
  )
}

function validateGroundedReply(reply: string, ctx: GroundedAgentContext): string {
  if (/^\s*(hola,\s*)?soy\s+(de|el|la)\b/i.test(reply)) {
    return buildDeterministicGroundedReply(ctx)
  }

  if (looksLikeMetaNarration(reply)) {
    return buildDeterministicGroundedReply(ctx)
  }

  if (looksLikeCodeOrInternalOutput(reply)) {
    return MALFORMED_REPLY_FALLBACK
  }

  if (ctx.fallbackReply) {
    return ctx.fallbackReply
  }

  const prices = extractPrices(reply)
  if (prices.length > 0 && ctx.products.length > 0) {
    const allowedPrices = new Set(
      ctx.products.flatMap((p) => {
        const amount = Number(p.price)
        return [`$${amount.toFixed(2)}`, `$${amount.toFixed(0)}`]
      })
    )
    const hasUnsupportedPrice = prices.some((price) => !allowedPrices.has(price))
    if (hasUnsupportedPrice) {
      return UNKNOWN_PRODUCT_FALLBACK
    }
  }

  return reply
}

function formatFallbackProductLine(product: BackpackProduct): string {
  const availability = product.stock > 0 ? 'en existencia' : 'sin existencia'
  return `*${product.name}*: $${Number(product.price).toFixed(2)} — stock:${product.stock} (${availability})`
}

function buildDeterministicGroundedReply(ctx: GroundedAgentContext): string {
  if (ctx.fallbackReply) return ctx.fallbackReply
  if (ctx.products.length > 0) {
    const productLimit = getBackpackProductMatchLimit()
    const matches = findSimilarBackpackProducts(ctx.userText, ctx.products, {
      threshold: getBackpackTextSimilarityThreshold(),
      limit: productLimit
    }).map((match) => match.product)
    const products = matches.length > 0 ? matches : ctx.products.slice(0, productLimit)
    return `Sí, claro, estos son los modelos que manejamos:\n${products
      .map(formatFallbackProductLine)
      .join('\n')}`
  }
  if (ctx.businessFacts.trim()) {
    return limitReplyLines(ctx.businessFacts).replace(/^informaci[oó]n\s+del\s+(local|negocio)\s*[-—:]?\s*/i, '')
  }
  return 'Te puedo ayudar con información de mochilas disponibles. ¿Qué modelo o característica buscas?'
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
  const userText =
    input.userText.trim() ||
    '(El cliente envió un mensaje vacío. Pide amablemente que escriba su pregunta sobre mochilas.)'
  const groundedContext = buildGroundingContext({
    userText,
    customerFacts: input.policy.customerFacts,
    products: input.products
  })

  if (groundedContext.fallbackReply) {
    return groundedContext.fallbackReply
  }

  const systemPrompt = buildBackpackAgentSystemPrompt({
    contextFile,
    customerFacts: input.policy.customerFacts,
    rulesForBot: input.policy.rulesForBot,
    interactionWorkflow: input.policy.interactionWorkflow,
    catalogText,
    retrievedContext: formatGroundedContext(groundedContext)
  })

  const historyMessages: LlmMessage[] = input.history.slice(-getBackpackLlmHistoryMessages()).map((t) => ({
    role: t.role,
    content: t.content
  }))

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: `Cliente: ${userText}\nEscribe únicamente la respuesta final para el cliente. No expliques qué entendiste ni cómo vas a responder.`
    }
  ]

  let reply: string
  try {
    reply = await backpackLlmChat({
      messages,
      temperature: input.temperature ?? 0.2,
      maxTokens: getLlmMaxResponseTokens()
    })
  } catch (error) {
    console.warn(
      '[BackpackAgent] LLM no devolvió respuesta útil; usando respuesta basada en BD:',
      error instanceof Error ? error.message : error
    )
    return buildDeterministicGroundedReply(groundedContext)
  }
  reply = sanitizeLlmReplyForCustomer(reply)
  reply = finalCleanup(reply)
  reply = validateGroundedReply(reply, groundedContext)
  return reply
}

function getBackpackLlmHistoryMessages(): number {
  const raw = process.env.BACKPACK_LLM_HISTORY_MESSAGES
  const n = raw === undefined ? DEFAULT_LLM_HISTORY_MESSAGES : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LLM_HISTORY_MESSAGES
  return Math.max(0, Math.min(20, Math.floor(n)))
}
