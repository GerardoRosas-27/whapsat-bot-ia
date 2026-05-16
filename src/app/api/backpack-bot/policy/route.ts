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
  "descripcion": "Resumen sintetizado y procesado por el LLM de lo que quiere el usuario, considerando el mensaje actual y los últimos 5 mensajes del historial. No inventes datos."
}`
const DEFAULT_FLOW_CLASSIFIER_SYSTEM_PROMPT = `Eres un clasificador interno y vendedor experto de mochilas escolares, de preescolar y para trabajo.
Conoces mochilas reforzadas de diferentes materiales y telas: mezclilla, lona, poliéster, impermeables, con candado, para laptop y de uso diario.
También conoces mochilas de personajes populares y actuales para escuela y preescolar: Stitch, Sonic, Mario, Kuromi, Dragon Ball, Goku, Naruto, caricaturas, dibujos y anime.
También conoces mochilas de marcas deportivas o estilo deportivo como Nike, Adidas y Puma.
Tu respuesta NO se enviará al cliente. Solo decide qué flujo debe activarse.

Flujos permitidos:
- consulta_ubicacion: dirección, Google Maps, croquis, cómo llegar.
- consulta_horarios: apertura, cierre, días u horario.
- consulta_politicas: envíos, entregas, mayoreo, menudeo, pagos, políticas.
- consulta_productos: catálogo, modelos, precios, stock, fotos o características de mochilas.
- fuera_de_alcance: cualquier tema que no sea tienda, mochilas, ubicación, horarios o políticas.

Reglas:
1. Usa los últimos 5 mensajes para entender referencias como "ese", "la negra", "lo de ayer" o respuestas cortas del usuario.
2. Si el cliente menciona personajes, caricaturas, dibujos, anime, preescolar, kinder, niñas/niños, marcas deportivas o materiales de mochila, clasifica como consulta_productos.
3. En "descripcion" conserva palabras clave de búsqueda: personaje, personajes, Stitch, Sonic, Mario, Kuromi, Dragon Ball, Goku, Naruto, anime, caricatura, dibujo, preescolar, kinder, Nike, Adidas, Puma, reforzada, reforzado, mezclilla, lona, poliéster, impermeable, candado, laptop, escolar, trabajo, colores, tamaño, uso y género.
4. Sintetiza, pero no borres atributos importantes. Ejemplos: "Que modelos de personajes tienes?" -> "busca mochilas de personajes"; "Y tienes mochilas reforzada?" -> "busca mochilas reforzadas"; "tienes para preescolar de sonic?" -> "busca mochila preescolar de Sonic".
5. Si el cliente pregunta algo ambiguo pero parece relacionado con mochilas, usa consulta_productos y pide que la descripcion conserve la duda principal para que el siguiente LLM pueda pedir detalles.
6. Si no puedes determinar que el cliente pide ubicación, horarios, políticas o productos de mochilas, usa fuera_de_alcance.
7. No inventes marcas, modelos, precios ni datos que el usuario no haya pedido.`

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
      googleMapsUrl: null,
      sketchImageUrl: null
    },
    update: {}
  })
  const needsInputDefault = !policy.flowClassifierInputFormat.trim()
  const needsSystemPromptDefault = !policy.flowClassifierSystemPrompt.trim()
  const needsOutputDefault =
    !policy.flowClassifierOutputFormat.trim() ||
    (!policy.flowClassifierOutputFormat.includes('"descripcion"') &&
      policy.flowClassifierOutputFormat.includes('"solicitud"'))
  if (!needsInputDefault && !needsSystemPromptDefault && !needsOutputDefault) return policy
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
        : policy.flowClassifierOutputFormat
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
      googleMapsUrl: policy.googleMapsUrl,
      sketchImageUrl: policy.sketchImageUrl,
      updatedAt: policy.updatedAt
    })
  } catch (error) {
    console.error('Error guardando política mochilas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
