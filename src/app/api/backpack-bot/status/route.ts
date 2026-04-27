import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getBackpackBotInstance } from '@/modules/backpack/bot'

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
    const client = bot.getClient()

    let phoneNumber: string | null = null
    let info: string | null = null

    if (isReady && client) {
      try {
        info = await client.getState()
        const numberId = await client.getNumberId()
        phoneNumber = numberId?.user ?? null
      } catch (error) {
        console.error('Error obteniendo información del backpack bot:', error)
      }
    }

    return NextResponse.json({
      isReady,
      state: info ?? 'disconnected',
      phoneNumber
    })
  } catch (error) {
    console.error('Error obteniendo estado del backpack bot:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
