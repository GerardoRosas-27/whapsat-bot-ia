import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBackpackBotInstance } from '@/modules/backpack/bot'
import { fetchBackpackCatalogForLlm } from '@/lib/backpack-llm-context'
import { runBackpackAgentTurn } from '@/lib/backpack-agent-pipeline'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

function getSelfChatId(bot: ReturnType<typeof getBackpackBotInstance>): string | null {
  const wid = bot.getClient().info?.wid
  if (typeof wid?._serialized === 'string') return wid._serialized
  if (typeof wid?.user === 'string') return `${wid.user}@c.us`
  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede enviar pruebas del bot' },
        { status: 403 }
      )
    }

    const bot = getBackpackBotInstance()
    if (!bot.isBotReady()) {
      return NextResponse.json(
        { error: 'El bot de mochilas no está conectado a WhatsApp' },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const userText =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : 'Hola, ¿qué mochilas tienen disponibles? Responde breve con datos reales del catálogo.'

    const policy = await prisma.backpackBotPolicy.findUnique({
      where: { id: 'singleton' }
    })
    const products = await fetchBackpackCatalogForLlm()
    const reply = await runBackpackAgentTurn({
      userText,
      policy: {
        customerFacts: policy?.customerFacts ?? '',
        rulesForBot: policy?.rulesForBot ?? '',
        interactionWorkflow: policy?.interactionWorkflow ?? ''
      },
      products,
      history: [],
      temperature: 0.2
    })

    const selfChatId = getSelfChatId(bot)
    if (!selfChatId) {
      return NextResponse.json(
        { error: 'No pude identificar el número de la sesión activa' },
        { status: 409 }
      )
    }

    await bot.getClient().sendMessage(
      selfChatId,
      `*Prueba LLM bot mochilas*\n\nCliente: ${userText}\n\nRespuesta:\n${reply}`
    )

    return NextResponse.json({
      ok: true,
      sentTo: selfChatId,
      userText,
      reply
    })
  } catch (error) {
    console.error('Error enviando prueba del bot de mochilas:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
