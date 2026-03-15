import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// GET - Obtener horarios de atención
export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const hours = await prisma.businessHours.findFirst({
      where: { isActive: true },
      include: {
        restPeriods: {
          where: { isActive: true },
          orderBy: { startTime: 'asc' }
        },
        nonWorkingDays: {
          where: { isActive: true },
          orderBy: { date: 'asc' }
        }
      }
    })

    if (!hours) {
      // Retornar valores por defecto si no hay configuración
      return NextResponse.json({
        id: null,
        startTime: '08:00',
        endTime: '18:00',
        appointmentDuration: 60,
        isActive: true,
        restPeriods: [],
        nonWorkingDays: []
      })
    }

    return NextResponse.json(hours)
  } catch (error) {
    console.error('Error obteniendo horarios:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST/PUT - Actualizar horarios de atención
export async function POST(request: NextRequest) {
  try {
    const user = verifyToken(request)

    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      startTime,
      endTime,
      appointmentDuration,
      restPeriods,
      nonWorkingDays
    } = body

    // Validaciones
    if (!startTime || !endTime || !appointmentDuration) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      )
    }

    // Desactivar todas las configuraciones existentes
    await prisma.businessHours.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    })

    // Crear nueva configuración
    const hours = await prisma.businessHours.create({
      data: {
        startTime,
        endTime,
        appointmentDuration: parseInt(appointmentDuration),
        isActive: true,
        restPeriods: {
          create: (restPeriods || []).map((rp: any) => ({
            startTime: rp.startTime,
            endTime: rp.endTime,
            description: rp.description || null,
            isActive: true
          }))
        },
        nonWorkingDays: {
          create: (nonWorkingDays || []).map((nwd: any) => ({
            date: new Date(nwd.date),
            description: nwd.description || null,
            isActive: true
          }))
        }
      },
      include: {
        restPeriods: true,
        nonWorkingDays: true
      }
    })

    return NextResponse.json(hours)
  } catch (error) {
    console.error('Error actualizando horarios:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
