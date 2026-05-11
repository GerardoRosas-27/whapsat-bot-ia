import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

async function resolveId(
  request: NextRequest,
  params: Promise<{ id: string }> | { id: string }
): Promise<string | null> {
  try {
    const resolved = params instanceof Promise ? await params : params
    if (resolved?.id?.trim()) return resolved.id.trim()
  } catch {
    // ignore
  }
  const pathParts = new URL(request.url).pathname.split('/')
  const index = pathParts.indexOf('conversations')
  return index !== -1 ? pathParts[index + 1]?.trim() || null : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
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

    const id = await resolveId(request, params)
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    const conversation = await prisma.backpackConversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } }
      }
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error('Error obteniendo conversación mochila:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede borrar conversaciones' },
        { status: 403 }
      )
    }

    const id = await resolveId(request, params)
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    await prisma.backpackConversation.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error borrando conversación mochila:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
