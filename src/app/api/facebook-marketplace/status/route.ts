import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getFacebookMarketplaceStatus } from '@/modules/marketplace-bot/domain'

export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    return NextResponse.json(getFacebookMarketplaceStatus())
  } catch (error) {
    console.error('Error obteniendo estado Facebook Marketplace:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
