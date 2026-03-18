import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/** Mismo patrón que backpack-bot/products/[id]: params + fallback por URL */
async function resolveAppointmentId(
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
  const idx = pathParts.indexOf('appointments')
  if (idx !== -1 && pathParts[idx + 1]) {
    return pathParts[idx + 1].trim()
  }
  return null
}

const VALID_STATUS = ['pending', 'confirmed', 'cancelled', 'completed']

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const appointmentId = await resolveAppointmentId(request, context.params)
    if (!appointmentId) {
      return NextResponse.json({ error: 'ID de cita inválido' }, { status: 400 })
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    return NextResponse.json(appointment)
  } catch (error) {
    console.error('Error obteniendo cita:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const appointmentId = await resolveAppointmentId(request, context.params)
    if (!appointmentId) {
      return NextResponse.json({ error: 'ID de cita inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))

    const existing = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    })
    if (!existing) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const data: {
      patientName?: string
      phoneNumber?: string
      date?: Date
      time?: string
      status?: string
      notes?: string | null
    } = {}

    if (body.patientName !== undefined) data.patientName = String(body.patientName).trim()
    if (body.phoneNumber !== undefined) data.phoneNumber = String(body.phoneNumber).trim()
    if (body.date !== undefined && body.date) data.date = new Date(body.date)
    if (body.time !== undefined) data.time = String(body.time).trim()
    if (body.status !== undefined) {
      if (!VALID_STATUS.includes(body.status)) {
        return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
      }
      data.status = body.status
    }
    if (body.notes !== undefined) {
      data.notes = body.notes === null || body.notes === '' ? null : String(body.notes)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      )
    }

    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data
    })

    return NextResponse.json(appointment)
  } catch (error: unknown) {
    const err = error as { code?: string }
    console.error('Error actualizando cita:', error)
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const appointmentId = await resolveAppointmentId(request, context.params)
    if (!appointmentId) {
      return NextResponse.json({ error: 'ID de cita inválido' }, { status: 400 })
    }

    const existing = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    })
    if (!existing) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    await prisma.appointment.delete({
      where: { id: appointmentId }
    })

    return new NextResponse(null, { status: 204 })
  } catch (error: unknown) {
    const err = error as { code?: string }
    console.error('Error eliminando cita:', error)
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
