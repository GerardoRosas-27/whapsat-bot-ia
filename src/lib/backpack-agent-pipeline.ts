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
  productUseTypeLabel
} from './backpack-product-similarity'
import {
  analyzeBackpackFlow,
  buildBackpackFlowGroundingContext,
  formatBackpackFlowGroundingContext,
  type BackpackFlowGroundingContext,
  type BackpackFlowName
} from './backpack-flow-router'

export type BackpackAgentHistoryTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type BackpackAgentPolicySlice = {
  customerFacts: string
  rulesForBot?: string
  interactionWorkflow?: string
  flowClassifierSystemPrompt?: string | null
  flowClassifierInputFormat?: string | null
  flowClassifierOutputFormat?: string | null
  searchLlmSystemPrompt?: string | null
  searchLlmInputFormat?: string | null
  searchLlmOutputFormat?: string | null
  filterLlmSystemPrompt?: string | null
  filterLlmInputFormat?: string | null
  filterLlmOutputFormat?: string | null
}

export type BackpackAgentTurnInput = {
  userText: string
  policy: BackpackAgentPolicySlice
  products: BackpackProduct[]
  history: BackpackAgentHistoryTurn[]
  temperature?: number
  clarificationAttempts?: number
  clarificationKey?: string | null
}

export type BackpackAgentTurnResult = {
  reply: string
  needsClarification: boolean
  exhaustedClarification: boolean
  clarificationKey?: string
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

function scopeFromFlow(flow: BackpackFlowName): AgentScope {
  if (flow === 'consulta_productos') return 'product'
  if (flow === 'fuera_de_alcance') return 'out_of_scope'
  return 'business'
}

function toGroundedAgentContext(ctx: BackpackFlowGroundingContext): GroundedAgentContext {
  return {
    scope: scopeFromFlow(ctx.flow),
    userText: ctx.analyzedRequest || ctx.userText,
    products: ctx.products,
    businessFacts: ctx.businessFacts,
    fallbackReply: ctx.fallbackReply,
    searchSummary: ctx.searchSummary
  }
}

const DEFAULT_LLM_HISTORY_MESSAGES = 5
const OUT_OF_SCOPE_FALLBACK =
  'Solo te puedo ayudar con información de nuestras mochilas y la tienda. ¿Qué modelo buscas?'
const UNKNOWN_PRODUCT_FALLBACK =
  '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
const UNKNOWN_BUSINESS_FACT_FALLBACK =
  'No tengo ese dato confirmado. Puedes preguntar por otro dato de la tienda o contactar directo al negocio.'
const MALFORMED_REPLY_FALLBACK =
  'Disculpa, no pude preparar bien la respuesta. ¿Me escribes de nuevo qué mochila buscas?'
const FINAL_UNANSWERED_FALLBACK =
  'Por el momento no podemos atenderle.'
const MAX_CLARIFICATION_ATTEMPTS = 3

const DEFAULT_SEARCH_LLM_SYSTEM_PROMPT = `Eres el LLM de búsqueda interno del bot de mochilas.
Recibes solo el contexto del flujo elegido: catálogo filtrado o datos oficiales relevantes.
Tu salida NO se envía al cliente.
Responde únicamente JSON válido.
Usa solo productos, precios, stock e información que aparezcan en el contexto.
Si no encuentras productos o información suficiente, indícalo en el JSON y sugiere qué dato falta pedir.`

const DEFAULT_SEARCH_LLM_INPUT_FORMAT = `{
  "mensaje_original": "texto del cliente",
  "flujo": "consulta_productos",
  "descripcion_analisis": "busca mochilas de personajes",
  "contexto_recuperado": "catálogo o datos oficiales del flujo",
  "historial_reciente": []
}`

const DEFAULT_SEARCH_LLM_OUTPUT_FORMAT = `{
  "encontro": false,
  "respuesta_borrador": "borrador interno con lo encontrado o con la duda que falta resolver",
  "modelos_encontrados": ["nombre exacto del modelo si aplica"],
  "informacion_encontrada": "datos oficiales encontrados si aplica",
  "pregunta_sugerida": "pregunta breve si falta detalle"
}`

const DEFAULT_FILTER_LLM_SYSTEM_PROMPT = `Eres el filtro final del bot de WhatsApp de una tienda de mochilas.
Recibes solo la salida JSON del LLM de búsqueda, el flujo y la descripcion del análisis. No recibes contexto de la base de datos.
Tu salida SÍ se enviará al cliente.
Reglas estrictas:
- Contesta solo el mensaje final para WhatsApp.
- No escribas razonamiento, análisis, tercera persona, "el usuario", "el cliente", "debo", "objetivo", "idioma" ni "límite".
- No inventes modelos, precios, stock, horarios, ubicación ni políticas. Usa únicamente lo que venga en el JSON de búsqueda.
- Si el JSON de búsqueda no encontró productos o faltan datos, pide más detalles con esta idea: "¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño."
- Si hay modelos encontrados, menciona solo esos nombres exactos.
- Máximo 6 líneas, español de México, tono natural.`

const DEFAULT_FILTER_LLM_INPUT_FORMAT = `{
  "mensaje_original": "texto del cliente",
  "flujo": "consulta_productos",
  "descripcion_analisis": "busca mochilas de personajes",
  "resultado_busqueda_json": {}
}`

const DEFAULT_FILTER_LLM_OUTPUT_FORMAT =
  'Mensaje final para WhatsApp, sin JSON, sin razonamiento y sin tercera persona.'

const UNIFIED_REASONING_ENV = 'BACKPACK_LLM_UNIFIED_REASONING'

type FastAnalysisResult = {
  flujo: BackpackFlowName
  descripcion: string
  respuestaDirecta: string
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
  rulesForBot?: string
  interactionWorkflow?: string
  catalogText: string
  retrievedContext: string
}): string {
  const facts =
    parts.customerFacts.trim() ||
    '(Sin datos oficiales cargados. Indica que no tienes ese dato y sugiere contactar a la tienda.)'
  const contextFile =
    parts.contextFile.trim() ||
    '(Sin contexto base cargado; cumple las instrucciones de este prompt.)'
  const rules =
    parts.rulesForBot?.trim() ||
    '(No hay reglas internas adicionales configuradas.)'
  const workflow =
    parts.interactionWorkflow?.trim() ||
    '(No hay flujo de interacción adicional configurado.)'
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
Si preguntan por envíos, entregas, domicilio, mayoreo o venta por unidad, responde con la política completa que aparezca en "Información oficial del negocio"; no la resumas como etiqueta ni omitas restricciones importantes.
Si preguntan por horario, apertura, cierre o si está abierto, responde usando el horario oficial completo que aparezca en "Información oficial del negocio"; no inventes días ni horas.
Si piden fotos o imágenes, decide tú cuáles modelos cumplen mejor con las características pedidas usando el catálogo completo. Responde con máximo 3 modelos y escribe sus nombres exactos como aparecen en "Catálogo disponible"; el sistema enviará fotos solo de esos nombres exactos.
Si preguntan por productos disponibles, responde: "Sí, claro, estos son los modelos que manejamos:" y lista productos por nombre exacto.
No inventes datos. Sé cordial, directo y natural.

Ejemplos de estilo:
Cliente: Hola
Respuesta: Hola, ¿qué modelo o tipo de mochila buscas?
Cliente: ¿Qué mochilas tienen?
Respuesta: Sí, claro, estos son los modelos que manejamos:

Contexto base del agente:
${truncateForPrompt(contextFile, 3000)}

Reglas internas configuradas:
${truncateForPrompt(rules, 2000)}

Flujo de trabajo configurado:
${truncateForPrompt(workflow, 2000)}

Información oficial del negocio (Datos de empresa configurados):
${truncateForPrompt(facts, 4000)}

Contexto recuperado para esta pregunta:
${compactContext}`
}

function buildBackpackSearchSystemPrompt(parts: {
  basePrompt: string
  systemPrompt?: string | null
  inputFormat?: string | null
  outputFormat?: string | null
}): string {
  return `${parts.systemPrompt?.trim() || DEFAULT_SEARCH_LLM_SYSTEM_PROMPT}

Formato de entrada esperado:
${parts.inputFormat?.trim() || DEFAULT_SEARCH_LLM_INPUT_FORMAT}

Formato obligatorio de salida:
${parts.outputFormat?.trim() || DEFAULT_SEARCH_LLM_OUTPUT_FORMAT}

Instrucciones y contexto disponibles para búsqueda:
${parts.basePrompt}

Devuelve únicamente JSON válido.`
}

function buildBackpackFilterSystemPrompt(parts: {
  systemPrompt?: string | null
  inputFormat?: string | null
  outputFormat?: string | null
}): string {
  return `${parts.systemPrompt?.trim() || DEFAULT_FILTER_LLM_SYSTEM_PROMPT}

Formato de entrada esperado:
${parts.inputFormat?.trim() || DEFAULT_FILTER_LLM_INPUT_FORMAT}

Formato obligatorio de salida:
${parts.outputFormat?.trim() || DEFAULT_FILTER_LLM_OUTPUT_FORMAT}`
}

function isUnifiedReasoningModeEnabled(): boolean {
  const v = process.env[UNIFIED_REASONING_ENV]?.toLowerCase().trim()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

function buildUnifiedReasoningSystemPrompt(parts: {
  contextFile: string
  policy: BackpackAgentPolicySlice
  catalogText: string
}): string {
  return `Modo unificado de razonamiento para el bot de mochilas.
En este modo haces en UNA sola llamada el trabajo que normalmente hacen 3 LLMs separados:
1. Analizar la intención y flujo del cliente.
2. Buscar usando catálogo y datos de empresa.
3. Filtrar la respuesta final para WhatsApp.

Puedes razonar internamente, pero tu salida debe ser ÚNICAMENTE el mensaje final para el cliente.
No escribas pensamientos, análisis, pasos, JSON, tercera persona, "el usuario", "el cliente", "debo", "objetivo", "idioma" ni "límite".
Usa solo la base de datos incluida en este prompt. No inventes productos, precios, stock, horarios, ubicación ni políticas.
Si no encuentras suficiente información, pide detalles de forma clara y corta:
"¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño."

Flujo operativo:
- Primero identifica si pregunta por productos, ubicación, horarios, políticas o algo fuera de alcance.
- Para productos, busca coincidencias en el catálogo por nombre, descripción, uso, género, personaje, material o características.
- Para ubicación, horarios y políticas, usa solo Datos de empresa.
- Al final responde como tienda por WhatsApp, máximo 6 líneas, directo y natural.
- Si mencionas modelos, usa nombres exactos del catálogo.

Configuración de LLMs separados (unificada aquí solo como guía):

LLM de análisis - system prompt:
${parts.policy.flowClassifierSystemPrompt?.trim() || '(Usa el análisis interno por defecto.)'}

LLM de análisis - formato salida:
${parts.policy.flowClassifierOutputFormat?.trim() || '(JSON con flujo y descripcion.)'}

LLM de búsqueda - system prompt:
${parts.policy.searchLlmSystemPrompt?.trim() || DEFAULT_SEARCH_LLM_SYSTEM_PROMPT}

LLM de búsqueda - formato salida:
${parts.policy.searchLlmOutputFormat?.trim() || DEFAULT_SEARCH_LLM_OUTPUT_FORMAT}

LLM de filtro final - system prompt:
${parts.policy.filterLlmSystemPrompt?.trim() || DEFAULT_FILTER_LLM_SYSTEM_PROMPT}

Contexto base del agente:
${truncateForPrompt(parts.contextFile, 3000)}

Reglas internas configuradas:
${truncateForPrompt(parts.policy.rulesForBot || '', 2500) || '(Sin reglas adicionales.)'}

Flujo de trabajo configurado:
${truncateForPrompt(parts.policy.interactionWorkflow || '', 2500) || '(Sin flujo adicional.)'}

Datos de empresa:
${truncateForPrompt(parts.policy.customerFacts, 5000) || '(Sin datos oficiales cargados.)'}

Catálogo completo de productos:
${truncateForPrompt(parts.catalogText, 12000)}`
}

function extractSearchResultText(searchRaw: string): string {
  try {
    const parsed = JSON.parse(stripJsonBlock(searchRaw)) as {
      respuesta_borrador?: unknown
      informacion_encontrada?: unknown
      pregunta_sugerida?: unknown
    }
    return [
      parsed.respuesta_borrador,
      parsed.informacion_encontrada,
      parsed.pregunta_sugerida
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      .trim()
  } catch {
    return searchRaw
  }
}

function stripJsonBlock(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function normalizeFastFlow(value: unknown): BackpackFlowName {
  if (typeof value !== 'string') return 'fuera_de_alcance'
  const normalized = normalizeText(value).replace(/\s+/g, '_')
  if (
    normalized === 'consulta_ubicacion' ||
    normalized === 'consulta_horarios' ||
    normalized === 'consulta_politicas' ||
    normalized === 'consulta_productos' ||
    normalized === 'fuera_de_alcance'
  ) {
    return normalized
  }
  return 'fuera_de_alcance'
}

function parseFastAnalysisReply(text: string, userText: string): FastAnalysisResult | null {
  try {
    const parsed = JSON.parse(stripJsonBlock(text)) as {
      flujo?: unknown
      descripcion?: unknown
      respuesta_directa?: unknown
      respuestaDirecta?: unknown
    }
    return {
      flujo: normalizeFastFlow(parsed.flujo),
      descripcion:
        typeof parsed.descripcion === 'string' && parsed.descripcion.trim()
          ? parsed.descripcion.trim()
          : userText,
      respuestaDirecta:
        typeof parsed.respuesta_directa === 'string'
          ? parsed.respuesta_directa.trim()
          : typeof parsed.respuestaDirecta === 'string'
            ? parsed.respuestaDirecta.trim()
            : ''
    }
  } catch {
    return null
  }
}

function buildFastAnalysisSystemPrompt(input: {
  policy: BackpackAgentPolicySlice
}): string {
  return `${input.policy.flowClassifierSystemPrompt?.trim() || 'Analiza el mensaje del cliente para una tienda de mochilas.'}

Esta es la primera llamada rápida SIN pensamiento. Recibes datos de empresa, pero NO recibes catálogo.
También recibes los últimos 5 mensajes del historial para resolver referencias y entender si el cliente está pidiendo productos.
Objetivo:
1. Decide el flujo.
2. Si el flujo es consulta_ubicacion, consulta_horarios o consulta_politicas, responde directo usando SOLO Datos de empresa.
3. Si el flujo es consulta_productos, NO respondas al cliente; solo devuelve flujo y descripcion.
4. Si es fuera_de_alcance o no entiendes, responde con: "${UNKNOWN_PRODUCT_FALLBACK}"
5. Si no hay datos suficientes de empresa para un flujo de negocio, pide el dato faltante de forma breve.

Formato obligatorio de salida JSON:
{
  "flujo": "consulta_productos",
  "descripcion": "descripcion sintetizada conservando palabras clave",
  "respuesta_directa": "solo para ubicación/horarios/políticas/fuera_de_alcance; vacío para consulta_productos"
}

Reglas:
- No escribas pensamiento ni explicación fuera del JSON.
- No inventes datos.
- Corrige typos comunes: "tines" = "tienes".
- Si el cliente menciona mochilas, modelos, personajes, caricaturas, anime, preescolar, escuela, trabajo, marcas deportivas, colores, material o tamaño, el flujo debe ser consulta_productos aunque no tengas catálogo en esta llamada.
- Ejemplos de consulta_productos: "Tienes mochilas de personajes?", "busco una de sonic", "hay reforzadas", "tienes para trabajo", "mochila negra escolar".
- Conserva palabras clave en descripcion para que el segundo LLM busque en catálogo.

Datos de empresa:
${input.policy.customerFacts.trim() || '(Sin datos de empresa configurados.)'}`
}

async function runFastAnalysisTurn(input: {
  userText: string
  history: BackpackAgentHistoryTurn[]
  policy: BackpackAgentPolicySlice
}): Promise<FastAnalysisResult> {
  const hasAnalysisConfig = Boolean(
    input.policy.flowClassifierSystemPrompt?.trim() ||
      input.policy.flowClassifierInputFormat?.trim() ||
      input.policy.flowClassifierOutputFormat?.trim()
  )
  if (!hasAnalysisConfig) {
    const scope = inferScope(input.userText)
    if (scope === 'business' || scope === 'mixed') {
      const facts = selectRelevantBusinessFacts(input.userText, input.policy.customerFacts)
      return {
        flujo: isScheduleQuestion(normalizeText(input.userText))
          ? 'consulta_horarios'
          : isDeliveryQuestion(normalizeText(input.userText))
            ? 'consulta_politicas'
            : 'consulta_ubicacion',
        descripcion: input.userText,
        respuestaDirecta: facts ? limitReplyLines(facts) : UNKNOWN_BUSINESS_FACT_FALLBACK
      }
    }
    if (scope === 'product' || scope === 'unknown') {
      return {
        flujo: 'consulta_productos',
        descripcion: input.userText,
        respuestaDirecta: ''
      }
    }
    return {
      flujo: 'fuera_de_alcance',
      descripcion: input.userText,
      respuestaDirecta: UNKNOWN_PRODUCT_FALLBACK
    }
  }
  const historyMessages: LlmMessage[] = input.history.slice(-5).map((turn) => ({
    role: turn.role,
    content: turn.content
  }))
  const messages: LlmMessage[] = [
    { role: 'system', content: buildFastAnalysisSystemPrompt({ policy: input.policy }) },
    ...historyMessages,
    {
      role: 'user',
      content: JSON.stringify(
        {
          mensaje_actual: input.userText,
          historial_ultimos_5_mensajes: historyMessages
        },
        null,
        2
      )
    }
  ]

  try {
    const raw = await backpackLlmChat({
      messages,
      temperature: 0,
      maxTokens: 320,
      enableReasoning: false
    })
    const parsed = parseFastAnalysisReply(raw, input.userText)
    if (parsed) return parsed
  } catch (error) {
    console.warn(
      '[BackpackAgent] Análisis rápido no disponible:',
      error instanceof Error ? error.message : error
    )
  }

  return {
    flujo: 'fuera_de_alcance',
    descripcion: input.userText,
    respuestaDirecta: UNKNOWN_PRODUCT_FALLBACK
  }
}

function buildProductReasoningSystemPrompt(input: {
  contextFile: string
  policy: BackpackAgentPolicySlice
  flowContext: BackpackFlowGroundingContext
  catalogText: string
}): string {
  return `Eres el LLM de productos del bot de WhatsApp de una tienda de mochilas.
Esta llamada SÍ puede usar modo pensamiento, pero tu salida debe ser SOLO el mensaje final para el cliente.
Recibes únicamente contexto de catálogo recuperado para consulta_productos.

Trabajo interno:
1. Busca productos usando la descripcion del análisis y el catálogo.
2. Aplica las reglas del filtro final: respuesta clara, corta, directa, sin tercera persona ni razonamientos.
3. Si encuentras modelos, menciona solo nombres exactos del catálogo y datos respaldados.
4. Si no encuentras coincidencias reales o falta detalle, pregunta:
"${UNKNOWN_PRODUCT_FALLBACK}"

Prohibido escribir: "el usuario", "el cliente", "debo", "objetivo", "idioma", "límite", JSON, análisis o pensamiento.

System prompt de búsqueda configurado:
${input.policy.searchLlmSystemPrompt?.trim() || DEFAULT_SEARCH_LLM_SYSTEM_PROMPT}

System prompt de filtro final configurado:
${input.policy.filterLlmSystemPrompt?.trim() || DEFAULT_FILTER_LLM_SYSTEM_PROMPT}

Contexto base:
${truncateForPrompt(input.contextFile, 2500)}

Catálogo recuperado:
${input.catalogText}

Contexto del flujo:
${formatBackpackFlowGroundingContext(input.flowContext)}`
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

function buildClarificationKey(ctx: BackpackFlowGroundingContext): string {
  const analyzed = normalizeText(ctx.analyzedRequest || ctx.userText).slice(0, 140)
  const original = normalizeText(ctx.userText).slice(0, 140)
  return `${ctx.flow}:${analyzed}:${original}`
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
  'entrega',
  'entregas',
  'domicilio',
  'mayoreo',
  'menudeo',
  'unidad',
  'pago',
  'pagos',
  'contacto',
  'telefono',
  'tienda'
]

const DELIVERY_QUESTION_TERMS = [
  'envio',
  'envios',
  'entrega',
  'entregas',
  'domicilio',
  'reparto',
  'mandan',
  'mandas',
  'enviar',
  'envian',
  'envias'
]

const DELIVERY_FACT_TERMS = [
  'envio',
  'envios',
  'entrega',
  'entregas',
  'domicilio',
  'reparto',
  'mayoreo',
  'menudeo',
  'unidad',
  'local'
]

const SCHEDULE_QUESTION_TERMS = [
  'horario',
  'hora',
  'abren',
  'abres',
  'abrir',
  'apertura',
  'cierran',
  'cierras',
  'cerrar',
  'cierre',
  'abierto',
  'abierta',
  'cerrado',
  'cerrada'
]

const SCHEDULE_FACT_TERMS = [
  'horario',
  'hora',
  'horas',
  'atencion',
  'abren',
  'apertura',
  'cierran',
  'cierre',
  'abierto',
  'cerrado',
  'todos los dias',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo'
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

function isDeliveryQuestion(normalizedText: string): boolean {
  return hasAnyTerm(normalizedText, DELIVERY_QUESTION_TERMS)
}

function isScheduleQuestion(normalizedText: string): boolean {
  return hasAnyTerm(normalizedText, SCHEDULE_QUESTION_TERMS)
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

  if (isDeliveryQuestion(normalizedUser)) {
    const deliveryLines = lines.filter((line) => {
      const normalizedLine = normalizeText(line)
      return hasAnyTerm(normalizedLine, DELIVERY_FACT_TERMS)
    })
    if (deliveryLines.length > 0) return deliveryLines.join('\n')
  }

  if (isScheduleQuestion(normalizedUser)) {
    const scheduleLines = lines.filter((line) => {
      const normalizedLine = normalizeText(line)
      return hasAnyTerm(normalizedLine, SCHEDULE_FACT_TERMS)
    })
    if (scheduleLines.length > 0) return scheduleLines.join('\n')
  }

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
        `${index + 1}. *${p.name}* | precio:$${Number(p.price).toFixed(2)} | stock:${p.stock} | género:${genderLabel(p.gender) || p.gender} | uso:${productUseTypeLabel(p.useType) || p.useType}\n   ${p.description}`
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
    /\b(el usuario|la usuaria|el cliente|la clienta)\s+(quiere|pregunta|pregunt[oó]|solicita|solicit[oó]|pide|pidi[oó]|busca|busc[oó]|est[aá] pidiendo|desea saber|necesita saber|inicia|env[ií]o|se quej[oó])/i.test(
      reply
    ) ||
    /\b(el usuario|la usuaria|el cliente|la clienta)\s+est[aá]\s+(preguntando|solicitando|buscando|pidiendo)/i.test(
      reply
    ) ||
    /\b(como vendedor|como asistente|debo responder|debo ser|debo pedir|objetivo:|idioma:|l[ií]mite:|mi objetivo|plan:|razonamiento|información disponible:|la base de datos|cordial,\s*direct[ao]|siguiendo la regla|revisando el cat[aá]logo|respuesta a generar|cat[aá]logo disponible|confirmar disponibilidad|ofrecer informaci[oó]n|informar sobre|informar al cliente|informar que)/i.test(
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

function looksLikeUnansweredReply(reply: string): boolean {
  const t = normalizeText(reply)
  if (!t) return true
  const normalizedUnknownProduct = normalizeText(UNKNOWN_PRODUCT_FALLBACK)
  const normalizedUnknownBusiness = normalizeText(UNKNOWN_BUSINESS_FACT_FALLBACK)
  if (t === normalizedUnknownProduct || t === normalizedUnknownBusiness) return true
  return (
    /\b(no encontre|no encontramos|no tengo confirmado|no tenemos confirmado|no hay informacion|no tengo ese dato|no aparece|no consta|no esta en (?:el )?catalogo|no tenemos ese modelo|no tenemos esa mochila)\b/i.test(
      t
    ) ||
    /\b(no puedo (?:confirmar|responder)|falta informacion|necesito mas informacion)\b/i.test(t)
  )
}

async function buildClarifyingQuestion(input: {
  userText: string
  ctx: GroundedAgentContext
  history: BackpackAgentHistoryTurn[]
  attemptsUsed: number
  clarificationKey: string
}): Promise<BackpackAgentTurnResult> {
  if (input.attemptsUsed >= MAX_CLARIFICATION_ATTEMPTS) {
    return {
      reply: FINAL_UNANSWERED_FALLBACK,
      needsClarification: false,
      exhaustedClarification: true,
      clarificationKey: input.clarificationKey
    }
  }

  const recentHistory = input.history.slice(-5)
  const promptContext = formatGroundedContext(input.ctx)
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: `Generas UNA pregunta breve para WhatsApp cuando no hay información suficiente en la base de datos.
Usa el contexto de conversación y los datos recuperados para pedir el detalle más útil sobre mochilas.
Habla directo al cliente, nunca en tercera persona. No escribas "el usuario", "el cliente", "debo", "objetivo", "idioma", "límite", análisis ni explicación.
No repitas errores de escritura del cliente; interpreta "tines" como "tienes".
Si falta detalle de producto, pregunta de forma clara qué tipo de mochila busca: escuela o trabajo, color, personaje, material o tamaño.
No inventes productos, precios, horarios ni políticas.
No listes modelos por default.
No expliques que falta información en la base.
Devuelve únicamente la pregunta final para el cliente, en español de México, máximo 2 líneas.`
    },
    ...recentHistory,
    {
      role: 'user',
      content: `Mensaje actual del cliente: ${input.userText}

Contexto disponible desde la BD y Datos de empresa:
${promptContext}

Formula una pregunta para obtener el detalle faltante y poder buscar mejor.`
    }
  ]

  let lastError: unknown
  for (let attempt = input.attemptsUsed; attempt < MAX_CLARIFICATION_ATTEMPTS; attempt += 1) {
    try {
      let question = await backpackLlmChat({
        messages,
        temperature: 0.25,
        maxTokens: 140
      })
      question = finalCleanup(sanitizeLlmReplyForCustomer(question))
      if (
        question.trim() &&
        !looksLikeUnansweredReply(question) &&
        !looksLikeCodeOrInternalOutput(question) &&
        !looksLikeMetaNarration(question) &&
        !/\btines\b/i.test(question)
      ) {
        return {
          reply: question,
          needsClarification: true,
          exhaustedClarification: false,
          clarificationKey: input.clarificationKey
        }
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    console.warn(
      '[BackpackAgent] No se pudo generar pregunta de aclaración:',
      lastError instanceof Error ? lastError.message : lastError
    )
  }
  const deterministicQuestion = buildDeterministicClarifyingQuestion(input.ctx)
  if (deterministicQuestion) {
    return {
      reply: deterministicQuestion,
      needsClarification: true,
      exhaustedClarification: false,
      clarificationKey: input.clarificationKey
    }
  }
  return {
    reply: FINAL_UNANSWERED_FALLBACK,
    needsClarification: false,
    exhaustedClarification: true,
    clarificationKey: input.clarificationKey
  }
}

function buildDeterministicClarifyingQuestion(ctx: GroundedAgentContext): string {
  const t = normalizeText(ctx.userText)
  if (ctx.scope === 'product') {
    if (/\b(preescolar|kinder|nino|nina|niño|niña)\b/.test(t)) {
      return '¿La buscas para niño o niña, y de qué personaje o color?'
    }
    return '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
  }
  if (ctx.scope === 'business') {
    return '¿Qué dato de la tienda necesitas: ubicación, horario, envíos o forma de compra?'
  }
  return '¿Me das más detalles de la mochila o información de la tienda que buscas?'
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
    if (matches.length === 0) return UNKNOWN_PRODUCT_FALLBACK
    const products = matches
    return `Sí, claro, estos son los modelos que manejamos:\n${products
      .map(formatFallbackProductLine)
      .join('\n')}`
  }
  if (ctx.businessFacts.trim()) {
    return limitReplyLines(ctx.businessFacts).replace(/^informaci[oó]n\s+del\s+(local|negocio)\s*[-—:]?\s*/i, '')
  }
  return '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
}

async function runUnifiedReasoningAgentTurn(
  input: BackpackAgentTurnInput,
  contextFile: string,
  userText: string
): Promise<BackpackAgentTurnResult> {
  const catalogText = formatCatalogForPrompt(input.products)
  const historyMessages: LlmMessage[] = input.history.slice(-getBackpackLlmHistoryMessages()).map((t) => ({
    role: t.role,
    content: t.content
  }))
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: buildUnifiedReasoningSystemPrompt({
        contextFile,
        policy: input.policy,
        catalogText
      })
    },
    ...historyMessages,
    {
      role: 'user',
      content: `Cliente: ${userText}\nResponde solo con el mensaje final para WhatsApp.`
    }
  ]

  let reply: string
  try {
    reply = await backpackLlmChat({
      messages,
      temperature: input.temperature ?? 0.25,
      maxTokens: getLlmMaxResponseTokens(),
      enableReasoning: true
    })
  } catch (error) {
    console.warn(
      '[BackpackAgent] Modo unificado no devolvió respuesta útil:',
      error instanceof Error ? error.message : error
    )
    return {
      reply: '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.',
      needsClarification: true,
      exhaustedClarification: false,
      clarificationKey: `unified:${normalizeText(userText).slice(0, 140)}`
    }
  }

  reply = sanitizeLlmReplyForCustomer(reply)
  reply = finalCleanup(reply)
  if (
    looksLikeMetaNarration(reply) ||
    looksLikeCodeOrInternalOutput(reply) ||
    looksLikeUnansweredReply(reply)
  ) {
    reply = '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
    return {
      reply,
      needsClarification: true,
      exhaustedClarification: false,
      clarificationKey: `unified:${normalizeText(userText).slice(0, 140)}`
    }
  }

  return {
    reply,
    needsClarification: false,
    exhaustedClarification: false,
    clarificationKey: `unified:${normalizeText(userText).slice(0, 140)}`
  }
}

/** Un turno del asistente IA (solo texto, sin visión). */
export async function runBackpackAgentTurn(input: BackpackAgentTurnInput): Promise<string> {
  const result = await runBackpackAgentTurnWithMeta(input)
  return result.reply
}

export async function runBackpackAgentTurnWithMeta(
  input: BackpackAgentTurnInput
): Promise<BackpackAgentTurnResult> {
  const contextFile = loadBackpackAgentContext()
  const userText =
    input.userText.trim() ||
    '(El cliente envió un mensaje vacío. Pide amablemente que escriba su pregunta sobre mochilas.)'
  const fastAnalysis = await runFastAnalysisTurn({
    userText,
    history: input.history,
    policy: input.policy
  })
  if (fastAnalysis.flujo !== 'consulta_productos') {
    const clarificationKey = `${fastAnalysis.flujo}:${normalizeText(fastAnalysis.descripcion).slice(0, 140)}:${normalizeText(userText).slice(0, 140)}`
    const attempts =
      input.clarificationKey === clarificationKey
        ? Math.max(0, Math.floor(input.clarificationAttempts ?? 0))
        : 0
    if (attempts >= MAX_CLARIFICATION_ATTEMPTS) {
      return {
        reply: FINAL_UNANSWERED_FALLBACK,
        needsClarification: false,
        exhaustedClarification: true,
        clarificationKey
      }
    }
    let reply = fastAnalysis.respuestaDirecta || UNKNOWN_PRODUCT_FALLBACK
    reply = finalCleanup(sanitizeLlmReplyForCustomer(reply))
    if (!reply || looksLikeMetaNarration(reply) || looksLikeCodeOrInternalOutput(reply)) {
      reply = UNKNOWN_PRODUCT_FALLBACK
    }
    return {
      reply,
      needsClarification: fastAnalysis.flujo === 'fuera_de_alcance' || reply === UNKNOWN_PRODUCT_FALLBACK,
      exhaustedClarification: false,
      clarificationKey
    }
  }
  const flowAnalysis = {
    flujo: fastAnalysis.flujo,
    descripcion: fastAnalysis.descripcion,
    source: 'llm' as const
  }
  const flowContext = buildBackpackFlowGroundingContext({
    analysis: flowAnalysis,
    userText,
    customerFacts: input.policy.customerFacts,
    products: input.products
  })
  const groundedContext = toGroundedAgentContext(flowContext)
  const catalogText = formatCatalogForPrompt(flowContext.products)
  const clarificationKey = buildClarificationKey(flowContext)
  const clarificationAttempts =
    input.clarificationKey === clarificationKey
      ? Math.max(0, Math.floor(input.clarificationAttempts ?? 0))
      : 0

  if (groundedContext.fallbackReply) {
    if (groundedContext.scope === 'out_of_scope') {
      if (clarificationAttempts >= MAX_CLARIFICATION_ATTEMPTS) {
        return {
          reply: FINAL_UNANSWERED_FALLBACK,
          needsClarification: false,
          exhaustedClarification: true,
          clarificationKey
        }
      }
      return {
        reply: groundedContext.fallbackReply,
        needsClarification: true,
        exhaustedClarification: false,
        clarificationKey
      }
    }
    return buildClarifyingQuestion({
      userText,
      ctx: groundedContext,
      history: input.history,
      attemptsUsed: clarificationAttempts,
      clarificationKey
    })
  }

  const systemPrompt = buildProductReasoningSystemPrompt({
    contextFile,
    policy: input.policy,
    flowContext,
    catalogText
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
      content: JSON.stringify(
        {
          mensaje_original: userText,
          flujo: flowContext.flow,
          descripcion_analisis: flowContext.analyzedRequest,
          contexto_catalogo: formatBackpackFlowGroundingContext(flowContext),
          historial_reciente: historyMessages
        },
        null,
        2
      )
    }
  ]

  let reply: string
  try {
    reply = await backpackLlmChat({
      messages,
      temperature: input.temperature ?? 0.2,
      maxTokens: getLlmMaxResponseTokens(),
      enableReasoning: true
    })
  } catch (error) {
    console.warn(
      '[BackpackAgent] LLM no devolvió respuesta útil; pidiendo más detalles:',
      error instanceof Error ? error.message : error
    )
    return buildClarifyingQuestion({
      userText,
      ctx: groundedContext,
      history: input.history,
      attemptsUsed: clarificationAttempts,
      clarificationKey
    })
  }
  reply = sanitizeLlmReplyForCustomer(reply)
  reply = finalCleanup(reply)
  reply = validateGroundedReply(reply, groundedContext)
  if (looksLikeUnansweredReply(reply)) {
    return buildClarifyingQuestion({
      userText,
      ctx: groundedContext,
      history: input.history,
      attemptsUsed: clarificationAttempts,
      clarificationKey
    })
  }
  return {
    reply,
    needsClarification: false,
    exhaustedClarification: false,
    clarificationKey
  }
}

function getBackpackLlmHistoryMessages(): number {
  const raw = process.env.BACKPACK_LLM_HISTORY_MESSAGES
  const n = raw === undefined ? DEFAULT_LLM_HISTORY_MESSAGES : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LLM_HISTORY_MESSAGES
  return Math.max(0, Math.min(20, Math.floor(n)))
}
