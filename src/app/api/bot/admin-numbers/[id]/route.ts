import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

function normalizePhoneNumber(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

async function resolveId(
  request: NextRequest,
  params: Promise<{ id: string }> | { id: string }
): Promise<string | null> {
  try {
    const resolved = params instanceof Promise ? await params : params
    const fromParams = resolved?.id?.trim()
    if (fromParams) return fromParams
  } catch {
    // ignore
  }
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  const index = pathParts.indexOf('admin-numbers')
  if (index !== -1 && pathParts[index + 1]) {
    return pathParts[index + 1].trim()
  }
  return null
}

export async function PATCH(
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
        { error: 'Solo el administrador puede editar números admin' },
        { status: 403 }
      )
    }

    const id = await resolveId(request, params)
    if (!id) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const data: {
      phoneNumber?: string
      label?: string | null
      isActive?: boolean
    } = {}

    if (body.phoneNumber !== undefined) {
      const phoneNumber = normalizePhoneNumber(body.phoneNumber)
      if (phoneNumber.length < 8) {
        return NextResponse.json(
          { error: 'Ingresa un número válido con lada' },
          { status: 400 }
        )
      }
      data.phoneNumber = phoneNumber
    }
    if (body.label !== undefined) {
      const label = String(body.label ?? '').trim()
      data.label = label || null
    }
    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      )
    }

    const adminNumber = await prisma.appointmentAdminNumber.update({
      where: { id },
      data
    })

    return NextResponse.json(adminNumber)
  } catch (error) {
    console.error('Error actualizando número admin de citas:', error)
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
        { error: 'Solo el administrador puede eliminar números admin' },
        { status: 403 }
      )
    }

    const id = await resolveId(request, params)
    if (!id) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    await prisma.appointmentAdminNumber.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error eliminando número admin de citas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
