import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

function normalizePhoneNumber(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede ver números admin' },
        { status: 403 }
      )
    }

    const adminNumbers = await prisma.appointmentAdminNumber.findMany({
      orderBy: [{ isActive: 'desc' }, { phoneNumber: 'asc' }]
    })

    return NextResponse.json({ adminNumbers })
  } catch (error) {
    console.error('Error listando números admin de citas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede crear números admin' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const phoneNumber = normalizePhoneNumber(body.phoneNumber)
    const label = typeof body.label === 'string' ? body.label.trim() : ''

    if (phoneNumber.length < 8) {
      return NextResponse.json(
        { error: 'Ingresa un número válido con lada' },
        { status: 400 }
      )
    }

    const adminNumber = await prisma.appointmentAdminNumber.create({
      data: {
        phoneNumber,
        label: label || null,
        isActive: body.isActive === undefined ? true : Boolean(body.isActive)
      }
    })

    return NextResponse.json(adminNumber, { status: 201 })
  } catch (error) {
    console.error('Error creando número admin de citas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
