import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede ver conversaciones' },
        { status: 403 }
      )
    }

    const conversations = await prisma.backpackConversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } }
      }
    })

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Error listando conversaciones mochilas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
