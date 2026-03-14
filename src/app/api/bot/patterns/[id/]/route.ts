import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// PATCH - Actualizar un patrón
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
    const { type, data } = body

    let result: any

    switch (type) {
      case 'appointment':
        result = await prisma.appointmentPattern.update({
          where: { id: params.id },
          data
        })
        break
      case 'date':
        result = await prisma.dateFormat.update({
          where: { id: params.id },
          data
        })
        break
      case 'time':
        result = await prisma.timeFormat.update({
          where: { id: params.id },
          data
        })
        break
      case 'response':
        result = await prisma.botResponse.update({
          where: { id: params.id },
          data
        })
        break
      default:
        return NextResponse.json(
          { error: 'Tipo inválido' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error actualizando patrón:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar un patrón
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

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')

    switch (type) {
      case 'appointment':
        await prisma.appointmentPattern.delete({
          where: { id: params.id }
        })
        break
      case 'date':
        await prisma.dateFormat.delete({
          where: { id: params.id }
        })
        break
      case 'time':
        await prisma.timeFormat.delete({
          where: { id: params.id }
        })
        break
      case 'response':
        await prisma.botResponse.delete({
          where: { id: params.id }
        })
        break
      default:
        return NextResponse.json(
          { error: 'Tipo inválido' },
          { status: 400 }
        )
    }

    return NextResponse.json({ message: 'Patrón eliminado exitosamente' })
  } catch (error) {
    console.error('Error eliminando patrón:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
