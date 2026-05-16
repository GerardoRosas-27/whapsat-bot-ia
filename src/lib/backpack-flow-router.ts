import type { BackpackProduct } from '@prisma/client'
import { backpackLlmChat, type LlmMessage } from './backpack-lm-studio'
import {
  findSimilarBackpackProducts,
  getBackpackProductMatchLimit,
  getBackpackTextSimilarityThreshold,
  genderLabel,
  productUseTypeLabel
} from './backpack-product-similarity'

export const BACKPACK_FLOW_NAMES = [
  'consulta_ubicacion',
  'consulta_horarios',
  'consulta_politicas',
  'consulta_productos',
  'fuera_de_alcance'
] as const

export type BackpackFlowName = (typeof BACKPACK_FLOW_NAMES)[number]

export type BackpackFlowRouterHistoryTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type BackpackFlowClassifierConfig = {
  systemPrompt?: string | null
  inputFormat?: string | null
  outputFormat?: string | null
}

export type BackpackFlowAnalysis = {
  flujo: BackpackFlowName
  descripcion: string
  filtros?: Record<string, unknown>
  razon?: string
  source: 'llm' | 'heuristic'
}

export type BackpackFlowGroundingContext = {
  flow: BackpackFlowName
  userText: string
  analyzedRequest: string
  products: BackpackProduct[]
  businessFacts: string
  fallbackReply?: string
  searchSummary: string
}

const DEFAULT_FLOW_INPUT_FORMAT = `{
  "historial_ultimos_5_mensajes": [
    { "role": "user", "content": "mensaje previo" },
    { "role": "assistant", "content": "respuesta previa" }
  ],
  "mensaje_actual": "texto actual del cliente",
  "flujos_disponibles": [
    "consulta_ubicacion",
    "consulta_horarios",
    "consulta_politicas",
    "consulta_productos",
    "fuera_de_alcance"
  ]
}`

const DEFAULT_FLOW_OUTPUT_FORMAT = `{
  "flujo": "consulta_productos",
  "descripcion": {
    "intencion": "buscar mochila de personaje",
    "consulta_catalogo": "mochila naruto personaje escuela",
    "palabras_clave_actuales": ["naruto", "personaje"],
    "palabras_clave_historial": ["mochilas", "personajes"],
    "atributos": {
      "personaje": "naruto",
      "uso": "escuela",
      "color": "",
      "material": "",
      "tamano": ""
    },
    "detalle_para_busqueda": "Descripcion detallada para que otro LLM busque en catálogo. No resumir ni borrar palabras clave."
  },
  "respuesta_directa": "solo para datos de empresa o fuera_de_alcance; vacío si es consulta_productos"
}`

const DEFAULT_FLOW_SYSTEM_PROMPT = `Eres un clasificador interno y vendedor experto de mochilas escolares, de preescolar y para trabajo.
Conoces mochilas reforzadas de diferentes materiales y telas: mezclilla, lona, poliéster, impermeables, con candado, para laptop y de uso diario.
También conoces mochilas de personajes populares y actuales para escuela y preescolar: Stitch, Sonic, Mario, Kuromi, Dragon Ball, Goku, Naruto, caricaturas, dibujos y anime.
También conoces mochilas de marcas deportivas o estilo deportivo como Nike, Adidas y Puma.
Tu respuesta NO se enviará al cliente. Solo decide qué flujo debe activarse.
Trabaja siempre en español de México.

Flujos permitidos:
- consulta_ubicacion: dirección, Google Maps, croquis, cómo llegar.
- consulta_horarios: apertura, cierre, días u horario.
- consulta_politicas: envíos, entregas, mayoreo, menudeo, pagos, políticas.
- consulta_productos: catálogo, modelos, precios, stock, fotos o características de mochilas.
- fuera_de_alcance: cualquier tema que no sea tienda, mochilas, ubicación, horarios o políticas.

Reglas:
1. Usa los últimos 5 mensajes para entender referencias como "ese", "la negra", "lo de ayer" o respuestas cortas del usuario. Da más peso al último mensaje; si el último mensaje especifica personaje, color, material, tamaño o uso, ese detalle manda.
2. Si el cliente menciona personajes, caricaturas, dibujos, anime, preescolar, kinder, niñas/niños, marcas deportivas o materiales de mochila, clasifica como consulta_productos.
3. En "descripcion" NO hagas resumen corto cuando sea consulta_productos. Entrega JSON detallado para otro LLM con consulta_catalogo, palabras_clave_actuales, palabras_clave_historial, atributos y detalle_para_busqueda.
4. Conserva palabras clave de búsqueda: personaje, personajes, Stitch, Sonic, Mario, Kuromi, Dragon Ball, Goku, Naruto, anime, caricatura, dibujo, preescolar, kinder, Nike, Adidas, Puma, reforzada, reforzado, mezclilla, lona, poliéster, impermeable, candado, laptop, escolar, trabajo, colores, tamaño, uso y género.
5. Si el mensaje actual es un detalle de una pregunta anterior, combina historial + mensaje actual. Ejemplo: historial "Tienes de personajes" y mensaje actual "De personaje de Naruto" => consulta_catalogo debe incluir "naruto" y "personaje".
6. Si el cliente pregunta algo ambiguo pero parece relacionado con mochilas, usa consulta_productos y pide que la descripcion conserve la duda principal para que el siguiente LLM pueda pedir detalles.
7. Si no puedes determinar que el cliente pide ubicación, horarios, políticas o productos de mochilas, usa fuera_de_alcance.
8. No inventes marcas, modelos, precios ni datos que el usuario no haya pedido.`

const OUT_OF_SCOPE_FALLBACK =
  'Vendemos mochilas y puedo ayudarte con catálogo, modelos, precios, existencia, ubicación, horarios y políticas de compra o entrega. Dame más detalles de lo que buscas para poder ayudarte.'

const UNKNOWN_PRODUCT_FALLBACK =
  'No encontré ese modelo en nuestro catálogo. Puedo buscar otro modelo o característica disponible.'

const UNKNOWN_BUSINESS_FACT_FALLBACK =
  'No tengo ese dato confirmado. Puedes preguntar por ubicación, horarios, políticas de compra o mochilas disponibles.'

const PRODUCT_TERMS = [
  'mochila',
  'mochilas',
  'morral',
  'bolsa',
  'bolsas',
  'preescolar',
  'kinder',
  'niño',
  'niña',
  'nino',
  'nina',
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
  'modelo',
  'foto',
  'imagen',
  'personaje',
  'personajes',
  'caricatura',
  'caricaturas',
  'dibujo',
  'dibujos',
  'anime',
  'stitch',
  'sitichet',
  'sonic',
  'mario',
  'kuromi',
  'dragonball',
  'dragon',
  'goku',
  'naruto',
  'nike',
  'nik',
  'adidas',
  'puma',
  'reforzada',
  'reforzado',
  'impermeable',
  'lona',
  'mezclilla',
  'poliester',
  'poliéster',
  'tela',
  'telas',
  'candado'
]

const LOCATION_TERMS = ['ubicacion', 'direccion', 'maps', 'google', 'croquis', 'llegar', 'donde', 'local', 'plaza', 'sucursal']
const SCHEDULE_TERMS = ['horario', 'hora', 'abren', 'abres', 'abrir', 'apertura', 'cierran', 'cierras', 'cerrar', 'cierre', 'abierto', 'abierta', 'cerrado', 'cerrada']
const POLICY_TERMS = ['envio', 'envios', 'entrega', 'entregas', 'domicilio', 'mayoreo', 'menudeo', 'unidad', 'pago', 'pagos', 'politica', 'politicas', 'cambio', 'garantia']
const OUT_OF_SCOPE_TERMS = ['clima', 'receta', 'programacion', 'codigo', 'javascript', 'python', 'futbol', 'tarea', 'medico', 'legal', 'chiste', 'noticias']
const PRODUCT_QUERY_NOISE_TERMS = new Set([
  'hola',
  'buenos',
  'buenas',
  'dias',
  'tardes',
  'noches',
  'y',
  'o',
  'me',
  'puedes',
  'puede',
  'dar',
  'decir',
  'mostrar',
  'ver',
  'quiero',
  'quisiera',
  'busco',
  'busca',
  'buscar',
  'buscan',
  'buscando',
  'tienes',
  'tiene',
  'tienen',
  'hay',
  'manejas',
  'manejan',
  'manejamos',
  'que',
  'qué',
  'cual',
  'cuales',
  'cuáles',
  'catalogo',
  'catálogo',
  'producto',
  'productos',
  'modelo',
  'modelos',
  'mochila',
  'mochilas',
  'escolar',
  'escolares',
  'escuela',
  'bolsa',
  'bolsas',
  'disponible',
  'disponibles'
])

const FLOW_FACT_TERMS: Record<BackpackFlowName, string[]> = {
  consulta_ubicacion: LOCATION_TERMS,
  consulta_horarios: SCHEDULE_TERMS,
  consulta_politicas: POLICY_TERMS,
  consulta_productos: PRODUCT_TERMS,
  fuera_de_alcance: []
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

function hasAnyTerm(normalizedText: string, terms: string[]): boolean {
  return terms.some((term) => normalizedText.includes(term))
}

function normalizeFlowName(value: unknown): BackpackFlowName | null {
  if (typeof value !== 'string') return null
  const normalized = normalizeText(value).replace(/\s+/g, '_')
  return BACKPACK_FLOW_NAMES.find((flow) => flow === normalized) ?? null
}

function inferFlowHeuristically(userText: string): BackpackFlowName {
  const normalized = normalizeText(userText)
  const hasProduct = hasAnyTerm(normalized, PRODUCT_TERMS)
  const hasLocation = hasAnyTerm(normalized, LOCATION_TERMS)
  const hasSchedule = hasAnyTerm(normalized, SCHEDULE_TERMS)
  const hasPolicy = hasAnyTerm(normalized, POLICY_TERMS)
  const hasOutOfScope = hasAnyTerm(normalized, OUT_OF_SCOPE_TERMS)

  if (hasLocation) return 'consulta_ubicacion'
  if (hasSchedule) return 'consulta_horarios'
  if (hasPolicy) return 'consulta_politicas'
  if (hasProduct) return 'consulta_productos'
  if (hasOutOfScope) return 'fuera_de_alcance'
  return 'fuera_de_alcance'
}

function hasSpecificProductSearchTerms(text: string): boolean {
  return normalizeText(text)
    .split(' ')
    .some((term) => term.length >= 3 && !PRODUCT_QUERY_NOISE_TERMS.has(term))
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function parseFlowAnalysisReply(text: string): Omit<BackpackFlowAnalysis, 'source'> | null {
  try {
    const parsed = JSON.parse(stripJsonFence(text)) as {
      flujo?: unknown
      descripcion?: unknown
      solicitud?: unknown
      filtros?: unknown
      razon?: unknown
    }
    const flow = normalizeFlowName(parsed.flujo)
    if (!flow) return null
    const descripcion =
      typeof parsed.descripcion === 'string'
        ? parsed.descripcion.trim()
        : typeof parsed.solicitud === 'string'
          ? parsed.solicitud.trim()
          : ''
    return {
      flujo: flow,
      descripcion,
      filtros:
        parsed.filtros && typeof parsed.filtros === 'object' && !Array.isArray(parsed.filtros)
          ? (parsed.filtros as Record<string, unknown>)
          : undefined,
      razon: typeof parsed.razon === 'string' ? parsed.razon.trim() : undefined
    }
  } catch {
    return null
  }
}

function buildFlowClassifierSystemPrompt(config: BackpackFlowClassifierConfig): string {
  return `${config.systemPrompt?.trim() || DEFAULT_FLOW_SYSTEM_PROMPT}

Formato de entrada esperado:
${config.inputFormat?.trim() || DEFAULT_FLOW_INPUT_FORMAT}

Formato obligatorio de salida:
${config.outputFormat?.trim() || DEFAULT_FLOW_OUTPUT_FORMAT}

Devuelve únicamente JSON válido. No uses markdown, explicaciones ni texto fuera del JSON.`
}

export function buildFlowClassifierPayload(input: {
  userText: string
  history: BackpackFlowRouterHistoryTurn[]
}): string {
  return JSON.stringify(
    {
      historial_ultimos_5_mensajes: input.history.slice(-5),
      mensaje_actual: input.userText,
      flujos_disponibles: BACKPACK_FLOW_NAMES
    },
    null,
    2
  )
}

export async function analyzeBackpackFlow(input: {
  userText: string
  history: BackpackFlowRouterHistoryTurn[]
  config?: BackpackFlowClassifierConfig
}): Promise<BackpackFlowAnalysis> {
  const userText = input.userText.trim()
  const hasClassifierConfig = Boolean(
    input.config?.systemPrompt?.trim() ||
      input.config?.inputFormat?.trim() ||
      input.config?.outputFormat?.trim()
  )
  if (!hasClassifierConfig) {
    return {
      flujo: inferFlowHeuristically(userText),
      descripcion: userText,
      source: 'heuristic'
    }
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: buildFlowClassifierSystemPrompt(input.config ?? {}) },
    { role: 'user', content: buildFlowClassifierPayload({ userText, history: input.history }) }
  ]

  try {
    const reply = await backpackLlmChat({
      messages,
      temperature: 0,
      maxTokens: 220
    })
    const parsed = parseFlowAnalysisReply(reply)
    if (parsed) {
      return {
        ...parsed,
        descripcion: parsed.descripcion || userText,
        source: 'llm'
      }
    }
  } catch (error) {
    console.warn(
      '[BackpackFlowRouter] No se pudo clasificar con LLM; usando heurística:',
      error instanceof Error ? error.message : error
    )
  }

  return {
    flujo: inferFlowHeuristically(userText),
    descripcion: userText,
    source: 'heuristic'
  }
}

function selectRelevantBusinessFacts(flow: BackpackFlowName, customerFacts: string): string {
  const facts = customerFacts.trim()
  if (!facts || flow === 'consulta_productos' || flow === 'fuera_de_alcance') return ''

  const terms = FLOW_FACT_TERMS[flow]
  const lines = facts
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const selectedIndexes = new Set<number>()
  lines.forEach((line, index) => {
    if (!hasAnyTerm(normalizeText(line), terms)) return
    const isBullet = (value: string) => /^\s*(?:[•*-]|\d+[.)])\s+/.test(value)
    selectedIndexes.add(index)
    if (isBullet(line) && index > 0) {
      selectedIndexes.add(index - 1)
    }
    for (let next = index + 1; next < lines.length && isBullet(lines[next]); next += 1) {
      selectedIndexes.add(next)
    }
  })
  const selected = [...selectedIndexes]
    .filter((index) => index >= 0 && index < lines.length)
    .sort((a, b) => a - b)
    .map((index) => lines[index])
  if (selected.length > 0) return selected.join('\n')
  return lines.length <= 12 ? facts : ''
}

function formatProductLine(product: BackpackProduct, index: number): string {
  return `${index + 1}. *${product.name}* | precio:$${Number(product.price).toFixed(2)} | stock:${product.stock} | género:${genderLabel(product.gender) || product.gender} | uso:${productUseTypeLabel(product.useType) || product.useType}
   ${product.description}`
}

export function formatProductsForFlowContext(products: BackpackProduct[]): string {
  if (products.length === 0) return '(No se recuperaron productos relevantes.)'
  return products.map(formatProductLine).join('\n')
}

export function buildBackpackFlowGroundingContext(input: {
  analysis: BackpackFlowAnalysis
  userText: string
  customerFacts: string
  products: BackpackProduct[]
}): BackpackFlowGroundingContext {
  const flow = input.analysis.flujo
  const analyzedRequest = input.analysis.descripcion.trim() || input.userText

  if (flow === 'fuera_de_alcance') {
    return {
      flow,
      userText: input.userText,
      analyzedRequest,
      products: [],
      businessFacts: '',
      fallbackReply: OUT_OF_SCOPE_FALLBACK,
      searchSummary: 'El clasificador determinó que la pregunta está fuera de los flujos soportados.'
    }
  }

  const products =
    flow === 'consulta_productos'
      ? findSimilarBackpackProducts(analyzedRequest, input.products, {
          threshold: getBackpackTextSimilarityThreshold(),
          limit: Math.max(getBackpackProductMatchLimit(), 6)
        }).map((match) => match.product)
      : []

  const productContext =
    flow === 'consulta_productos' &&
    products.length === 0 &&
    !hasSpecificProductSearchTerms(`${analyzedRequest} ${input.userText}`)
      ? input.products
      : products
  const businessFacts = selectRelevantBusinessFacts(flow, input.customerFacts)

  if (flow === 'consulta_productos' && productContext.length === 0) {
    return {
      flow,
      userText: input.userText,
      analyzedRequest,
      products: [],
      businessFacts: '',
      fallbackReply: UNKNOWN_PRODUCT_FALLBACK,
      searchSummary: 'No hay productos activos para responder la consulta de catálogo.'
    }
  }

  if (flow !== 'consulta_productos' && !businessFacts.trim()) {
    return {
      flow,
      userText: input.userText,
      analyzedRequest,
      products: [],
      businessFacts: '',
      fallbackReply: UNKNOWN_BUSINESS_FACT_FALLBACK,
      searchSummary: 'No hay datos oficiales suficientes para el flujo seleccionado.'
    }
  }

  return {
    flow,
    userText: input.userText,
    analyzedRequest,
    products: productContext,
    businessFacts,
    searchSummary:
      flow === 'consulta_productos'
        ? `Flujo consulta_productos. Productos enviados al LLM final: ${productContext.length}.`
        : `Flujo ${flow}. Se envían solo datos oficiales filtrados para ese flujo.`
  }
}

export function formatBackpackFlowGroundingContext(ctx: BackpackFlowGroundingContext): string {
  return `Flujo activado: ${ctx.flow}
Descripcion procesada por el analizador: ${ctx.analyzedRequest}
Estado de contexto: ${ctx.searchSummary}

Catálogo disponible para este flujo:
${formatProductsForFlowContext(ctx.products)}

Datos oficiales relevantes para este flujo:
${ctx.businessFacts.trim() || '(No aplica o no hay datos oficiales relevantes para esta pregunta.)'}

Respuesta segura si falta información:
${ctx.fallbackReply || 'Si la respuesta no está respaldada por los bloques anteriores, di que no tienes ese dato confirmado.'}`
}
