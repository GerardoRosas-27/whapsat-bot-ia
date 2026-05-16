import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const POLICY_ID = 'singleton'
const DEFAULT_FLOW_CLASSIFIER_INPUT_FORMAT = `{
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
const DEFAULT_FLOW_CLASSIFIER_OUTPUT_FORMAT = `{
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
const DEFAULT_FLOW_CLASSIFIER_SYSTEM_PROMPT = `Eres un clasificador interno y vendedor experto de mochilas escolares, de preescolar y para trabajo.
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
const DEFAULT_SEARCH_LLM_SYSTEM_PROMPT = `Eres el LLM de búsqueda interno del bot de mochilas. Recibes solo el contexto del flujo elegido. Devuelve únicamente JSON válido usando solo productos o datos oficiales del contexto. Si no encuentras información suficiente, indícalo en el JSON y sugiere qué detalle falta pedir.`
const DEFAULT_SEARCH_LLM_INPUT_FORMAT = `{"mensaje_original":"","flujo":"consulta_productos","descripcion_analisis":"","contexto_recuperado":"","historial_reciente":[]}`
const DEFAULT_SEARCH_LLM_OUTPUT_FORMAT = `{"encontro":false,"respuesta_borrador":"","modelos_encontrados":[],"informacion_encontrada":"","pregunta_sugerida":""}`
const DEFAULT_FILTER_LLM_SYSTEM_PROMPT = `Eres el filtro final del bot de WhatsApp. Recibes solo el JSON de búsqueda, el flujo y la descripcion del análisis; no recibes contexto de la base de datos. Convierte eso en el mensaje final al cliente. No uses tercera persona, razonamiento, análisis ni inventes datos. Si no hay resultados, pide más detalles sobre tipo de mochila: escuela o trabajo, color, personaje, material o tamaño.`
const DEFAULT_FILTER_LLM_INPUT_FORMAT = `{"mensaje_original":"","flujo":"consulta_productos","descripcion_analisis":"","resultado_busqueda_json":{}}`
const DEFAULT_FILTER_LLM_OUTPUT_FORMAT = 'Mensaje final para WhatsApp, sin JSON ni razonamiento.'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

async function getOrCreatePolicy() {
  const policy = await prisma.backpackBotPolicy.upsert({
    where: { id: POLICY_ID },
    create: {
      id: POLICY_ID,
      rulesForBot: '',
      customerFacts: '',
      interactionWorkflow: '',
      flowClassifierSystemPrompt: DEFAULT_FLOW_CLASSIFIER_SYSTEM_PROMPT,
      flowClassifierInputFormat: DEFAULT_FLOW_CLASSIFIER_INPUT_FORMAT,
      flowClassifierOutputFormat: DEFAULT_FLOW_CLASSIFIER_OUTPUT_FORMAT,
      searchLlmSystemPrompt: DEFAULT_SEARCH_LLM_SYSTEM_PROMPT,
      searchLlmInputFormat: DEFAULT_SEARCH_LLM_INPUT_FORMAT,
      searchLlmOutputFormat: DEFAULT_SEARCH_LLM_OUTPUT_FORMAT,
      filterLlmSystemPrompt: DEFAULT_FILTER_LLM_SYSTEM_PROMPT,
      filterLlmInputFormat: DEFAULT_FILTER_LLM_INPUT_FORMAT,
      filterLlmOutputFormat: DEFAULT_FILTER_LLM_OUTPUT_FORMAT,
      googleMapsUrl: null,
      sketchImageUrl: null
    },
    update: {}
  })
  const needsInputDefault = !policy.flowClassifierInputFormat.trim()
  const needsSystemPromptDefault = !policy.flowClassifierSystemPrompt.trim()
  const needsSearchDefaults =
    !policy.searchLlmSystemPrompt.trim() ||
    !policy.searchLlmInputFormat.trim() ||
    !policy.searchLlmOutputFormat.trim()
  const needsFilterDefaults =
    !policy.filterLlmSystemPrompt.trim() ||
    !policy.filterLlmInputFormat.trim() ||
    !policy.filterLlmOutputFormat.trim()
  const needsOutputDefault =
    !policy.flowClassifierOutputFormat.trim() ||
    (!policy.flowClassifierOutputFormat.includes('"descripcion"') &&
      policy.flowClassifierOutputFormat.includes('"solicitud"'))
  if (!needsInputDefault && !needsSystemPromptDefault && !needsOutputDefault && !needsSearchDefaults && !needsFilterDefaults) return policy
  return prisma.backpackBotPolicy.update({
    where: { id: POLICY_ID },
    data: {
      flowClassifierSystemPrompt: needsSystemPromptDefault
        ? DEFAULT_FLOW_CLASSIFIER_SYSTEM_PROMPT
        : policy.flowClassifierSystemPrompt,
      flowClassifierInputFormat: needsInputDefault
        ? DEFAULT_FLOW_CLASSIFIER_INPUT_FORMAT
        : policy.flowClassifierInputFormat,
      flowClassifierOutputFormat: needsOutputDefault
        ? DEFAULT_FLOW_CLASSIFIER_OUTPUT_FORMAT
        : policy.flowClassifierOutputFormat,
      searchLlmSystemPrompt: policy.searchLlmSystemPrompt.trim() || DEFAULT_SEARCH_LLM_SYSTEM_PROMPT,
      searchLlmInputFormat: policy.searchLlmInputFormat.trim() || DEFAULT_SEARCH_LLM_INPUT_FORMAT,
      searchLlmOutputFormat: policy.searchLlmOutputFormat.trim() || DEFAULT_SEARCH_LLM_OUTPUT_FORMAT,
      filterLlmSystemPrompt: policy.filterLlmSystemPrompt.trim() || DEFAULT_FILTER_LLM_SYSTEM_PROMPT,
      filterLlmInputFormat: policy.filterLlmInputFormat.trim() || DEFAULT_FILTER_LLM_INPUT_FORMAT,
      filterLlmOutputFormat: policy.filterLlmOutputFormat.trim() || DEFAULT_FILTER_LLM_OUTPUT_FORMAT
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json({ error: 'Solo el administrador puede ver la política' }, { status: 403 })
    }

    const policy = await getOrCreatePolicy()
    return NextResponse.json({
      rulesForBot: policy.rulesForBot,
      customerFacts: policy.customerFacts,
      interactionWorkflow: policy.interactionWorkflow,
      flowClassifierSystemPrompt: policy.flowClassifierSystemPrompt,
      flowClassifierInputFormat: policy.flowClassifierInputFormat,
      flowClassifierOutputFormat: policy.flowClassifierOutputFormat,
      searchLlmSystemPrompt: policy.searchLlmSystemPrompt,
      searchLlmInputFormat: policy.searchLlmInputFormat,
      searchLlmOutputFormat: policy.searchLlmOutputFormat,
      filterLlmSystemPrompt: policy.filterLlmSystemPrompt,
      filterLlmInputFormat: policy.filterLlmInputFormat,
      filterLlmOutputFormat: policy.filterLlmOutputFormat,
      googleMapsUrl: policy.googleMapsUrl,
      sketchImageUrl: policy.sketchImageUrl,
      updatedAt: policy.updatedAt
    })
  } catch (error) {
    console.error('Error obteniendo política mochilas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json({ error: 'Solo el administrador puede editar la política' }, { status: 403 })
    }

    const body = await request.json()
    const current = await getOrCreatePolicy()
    const rulesForBot =
      typeof body.rulesForBot === 'string' ? body.rulesForBot : current.rulesForBot
    const customerFacts =
      typeof body.customerFacts === 'string' ? body.customerFacts : current.customerFacts
    const interactionWorkflow =
      typeof body.interactionWorkflow === 'string'
        ? body.interactionWorkflow
        : current.interactionWorkflow
    const flowClassifierSystemPrompt =
      typeof body.flowClassifierSystemPrompt === 'string'
        ? body.flowClassifierSystemPrompt
        : current.flowClassifierSystemPrompt
    const flowClassifierInputFormat =
      typeof body.flowClassifierInputFormat === 'string'
        ? body.flowClassifierInputFormat
        : current.flowClassifierInputFormat
    const flowClassifierOutputFormat =
      typeof body.flowClassifierOutputFormat === 'string'
        ? body.flowClassifierOutputFormat
        : current.flowClassifierOutputFormat
    const searchLlmSystemPrompt =
      typeof body.searchLlmSystemPrompt === 'string' ? body.searchLlmSystemPrompt : current.searchLlmSystemPrompt
    const searchLlmInputFormat =
      typeof body.searchLlmInputFormat === 'string' ? body.searchLlmInputFormat : current.searchLlmInputFormat
    const searchLlmOutputFormat =
      typeof body.searchLlmOutputFormat === 'string' ? body.searchLlmOutputFormat : current.searchLlmOutputFormat
    const filterLlmSystemPrompt =
      typeof body.filterLlmSystemPrompt === 'string' ? body.filterLlmSystemPrompt : current.filterLlmSystemPrompt
    const filterLlmInputFormat =
      typeof body.filterLlmInputFormat === 'string' ? body.filterLlmInputFormat : current.filterLlmInputFormat
    const filterLlmOutputFormat =
      typeof body.filterLlmOutputFormat === 'string' ? body.filterLlmOutputFormat : current.filterLlmOutputFormat
    const googleMapsUrl =
      typeof body.googleMapsUrl === 'string' ? body.googleMapsUrl.trim() || null : current.googleMapsUrl
    const sketchImageUrl =
      typeof body.sketchImageUrl === 'string' ? body.sketchImageUrl.trim() || null : current.sketchImageUrl

    const policy = await prisma.backpackBotPolicy.upsert({
      where: { id: POLICY_ID },
      create: {
        id: POLICY_ID,
        rulesForBot,
        customerFacts,
        interactionWorkflow,
        flowClassifierSystemPrompt,
        flowClassifierInputFormat,
        flowClassifierOutputFormat,
        searchLlmSystemPrompt,
        searchLlmInputFormat,
        searchLlmOutputFormat,
        filterLlmSystemPrompt,
        filterLlmInputFormat,
        filterLlmOutputFormat,
        googleMapsUrl,
        sketchImageUrl
      },
      update: {
        rulesForBot,
        customerFacts,
        interactionWorkflow,
        flowClassifierSystemPrompt,
        flowClassifierInputFormat,
        flowClassifierOutputFormat,
        searchLlmSystemPrompt,
        searchLlmInputFormat,
        searchLlmOutputFormat,
        filterLlmSystemPrompt,
        filterLlmInputFormat,
        filterLlmOutputFormat,
        googleMapsUrl,
        sketchImageUrl
      }
    })

    return NextResponse.json({
      rulesForBot: policy.rulesForBot,
      customerFacts: policy.customerFacts,
      interactionWorkflow: policy.interactionWorkflow,
      flowClassifierSystemPrompt: policy.flowClassifierSystemPrompt,
      flowClassifierInputFormat: policy.flowClassifierInputFormat,
      flowClassifierOutputFormat: policy.flowClassifierOutputFormat,
      searchLlmSystemPrompt: policy.searchLlmSystemPrompt,
      searchLlmInputFormat: policy.searchLlmInputFormat,
      searchLlmOutputFormat: policy.searchLlmOutputFormat,
      filterLlmSystemPrompt: policy.filterLlmSystemPrompt,
      filterLlmInputFormat: policy.filterLlmInputFormat,
      filterLlmOutputFormat: policy.filterLlmOutputFormat,
      googleMapsUrl: policy.googleMapsUrl,
      sketchImageUrl: policy.sketchImageUrl,
      updatedAt: policy.updatedAt
    })
  } catch (error) {
    console.error('Error guardando política mochilas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
