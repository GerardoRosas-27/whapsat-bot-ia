import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = verifyToken(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id }
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
  { params }: { params: { id: string } }
) {
  try {
    const user = verifyToken(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { patientName, phoneNumber, date, time, status, notes } = body

    const updateData: any = {}
    if (patientName) updateData.patientName = patientName
    if (phoneNumber) updateData.phoneNumber = phoneNumber
    if (date) updateData.date = new Date(date)
    if (time) updateData.time = time
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    const appointment = await prisma.appointment.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json(appointment)
  } catch (error) {
    console.error('Error actualizando cita:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = verifyToken(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    await prisma.appointment.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: 'Cita eliminada exitosamente' })
  } catch (error) {
    console.error('Error eliminando cita:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
