import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { verifyToken } from '@/lib/auth'
import { getBackpackBotInstance } from '@/modules/backpack/bot'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const bot = getBackpackBotInstance()
    const isReady = bot.isBotReady()
    const isStarting = bot.isBotStarting()
    const client = bot.getClient()
    const qr = bot.getLastQr()

    let phoneNumber: string | null = null
    let info: string | null = null
    let qrDataUrl: string | null = null

    if (isReady && client) {
      info = 'CONNECTED'
      const wid = client.info?.wid
      phoneNumber =
        typeof wid?.user === 'string'
          ? wid.user
          : typeof wid?._serialized === 'string'
            ? wid._serialized.split('@')[0] || null
            : null
    }

    if (qr) {
      try {
        qrDataUrl = await QRCode.toDataURL(qr, {
          margin: 1,
          width: 280
        })
      } catch (error) {
        console.error('Error generando QR del backpack bot:', error)
      }
    }

    return NextResponse.json({
      isReady,
      isStarting,
      state: info ?? 'disconnected',
      phoneNumber,
      qrDataUrl
    })
  } catch (error) {
    console.error('Error obteniendo estado del backpack bot:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = verifyToken(request)

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede controlar el bot de mochilas' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : ''
    const bot = getBackpackBotInstance()

    if (action === 'start') {
      await bot.start()
      return NextResponse.json({ ok: true })
    }

    if (action === 'logout') {
      await bot.logoutSession()
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json(
      { error: 'Acción inválida' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error controlando bot de mochilas:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
