import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getBotInstance } from '@/bot/whatsapp-bot'

export async function POST(request: NextRequest) {
  try {
    const user = verifyToken(request)
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'No autorizado. Solo administradores pueden recargar patrones.' },
        { status: 403 }
      )
    }

    const bot = getBotInstance()
    await bot.reloadPatterns()

    return NextResponse.json({ 
      message: 'Patrones recargados correctamente',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error recargando patrones:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
