import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = verifyToken(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Extraer ID de params o URL
    let appointmentId: string | null = null
    try {
      const resolvedParams = params instanceof Promise ? await params : params
      appointmentId = resolvedParams?.id?.trim() || null
    } catch (error) {
      // Fallback: extraer de URL
      const url = new URL(request.url)
      const pathParts = url.pathname.split('/')
      const appointmentsIndex = pathParts.indexOf('appointments')
      if (appointmentsIndex !== -1 && pathParts[appointmentsIndex + 1]) {
        appointmentId = pathParts[appointmentsIndex + 1].trim()
      }
    }

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'ID de cita inválido' },
        { status: 400 }
      )
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    })

    if (!appointment) {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      )
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
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = verifyToken(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Extraer ID de params o URL
    let appointmentId: string | null = null
    try {
      const resolvedParams = params instanceof Promise ? await params : params
      appointmentId = resolvedParams?.id?.trim() || null
    } catch (error) {
      // Fallback: extraer de URL
      const url = new URL(request.url)
      const pathParts = url.pathname.split('/')
      const appointmentsIndex = pathParts.indexOf('appointments')
      if (appointmentsIndex !== -1 && pathParts[appointmentsIndex + 1]) {
        appointmentId = pathParts[appointmentsIndex + 1].trim()
      }
    }

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'ID de cita inválido' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { patientName, phoneNumber, date, time, status, notes } = body

    // Verificar que la cita existe
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    })

    if (!existingAppointment) {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      )
    }

    const updateData: any = {}
    if (patientName) updateData.patientName = patientName
    if (phoneNumber) updateData.phoneNumber = phoneNumber
    if (date) updateData.date = new Date(date)
    if (time) updateData.time = time
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData
    })

    return NextResponse.json(appointment)
  } catch (error: any) {
    console.error('Error actualizando cita:', error)
    // Si es un error de Prisma por registro no encontrado
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Extraer ID PRIMERO desde la URL (más confiable)
    const urlMatch = request.url.match(/\/api\/appointments\/([^/?]+)/)
    let appointmentId: string | null = null
    
    if (urlMatch && urlMatch[1]) {
      appointmentId = urlMatch[1].trim()
      logger.info('[DELETE] ID extraído de URL', { 
        id: appointmentId,
        url: request.url
      })
    } else {
      // Fallback: intentar desde params
      try {
        const resolvedParams = params instanceof Promise ? await params : params
        appointmentId = resolvedParams?.id?.trim() || null
        logger.info('[DELETE] ID extraído de params', { id: appointmentId })
      } catch (error: any) {
        logger.error('[DELETE] Error obteniendo ID', { error: error.message })
      }
    }
    
    if (!appointmentId) {
      logger.error('[DELETE] No se pudo extraer el ID', { url: request.url })
      return NextResponse.json(
        { error: 'ID de cita inválido' },
        { status: 400 }
      )
    }
    
    logger.info('[DELETE] Iniciando eliminación', { 
      appointmentId,
      url: request.url
    })
    
    const user = verifyToken(request)
    
    if (!user) {
      logger.warn('[DELETE] Usuario no autorizado')
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    logger.info('[DELETE] Usuario autenticado', { username: user.username })

    // Obtener todas las citas para comparar
    const allAppointments = await prisma.appointment.findMany({
      select: { id: true, patientName: true }
    })
    
    logger.debug('[DELETE] Citas disponibles', { 
      total: allAppointments.length,
      ids: allAppointments.map(a => a.id),
      buscando: appointmentId
    })

    // Buscar la cita
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    })

    if (!existingAppointment) {
      // Intentar búsqueda alternativa (case-insensitive)
      const foundAppointment = allAppointments.find(a => 
        a.id.toLowerCase() === appointmentId.toLowerCase()
      )
      
      if (foundAppointment) {
        logger.info('[DELETE] Cita encontrada con búsqueda alternativa', {
          originalId: appointmentId,
          foundId: foundAppointment.id
        })
        appointmentId = foundAppointment.id
      } else {
        logger.error('[DELETE] Cita no encontrada', { 
          searchedId: appointmentId,
          availableIds: allAppointments.map(a => a.id),
          comparison: allAppointments.map(a => ({
            id: a.id,
            exactMatch: a.id === appointmentId,
            caseInsensitiveMatch: a.id.toLowerCase() === appointmentId.toLowerCase(),
            length: a.id.length,
            searchedLength: appointmentId.length
          }))
        })
        
        return NextResponse.json(
          { error: 'Cita no encontrada', debug: process.env.NODE_ENV === 'development' ? { searchedId: appointmentId, availableIds: allAppointments.map(a => a.id) } : undefined },
          { status: 404 }
        )
      }
    }

    logger.info('[DELETE] Cita encontrada, eliminando', { 
      id: appointmentId,
      patientName: existingAppointment?.patientName || 'N/A'
    })
    
    await prisma.appointment.delete({
      where: { id: appointmentId }
    })

    logger.info('[DELETE] Cita eliminada exitosamente', { id: appointmentId })
    return NextResponse.json({ message: 'Cita eliminada exitosamente' })
  } catch (error: any) {
    logger.error('[DELETE] Error eliminando cita', {
      message: error.message,
      code: error.code,
      stack: error.stack
    })
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: 'Error interno del servidor', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
