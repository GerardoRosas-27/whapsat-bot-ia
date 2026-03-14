import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// GET - Obtener todos los patrones
export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const type = request.nextUrl.searchParams.get('type') // 'appointment', 'date', 'time', 'response'
    console.log('GET /api/bot/patterns - Tipo solicitado:', type)

    let result: any = {}

    if (!type || type === 'appointment') {
      const patterns = await prisma.appointmentPattern.findMany({
        orderBy: { priority: 'desc' }
      })
      result.appointmentPatterns = patterns
      console.log(`  - Patrones encontrados: ${patterns.length}`)
    }

    if (!type || type === 'date') {
      const dates = await prisma.dateFormat.findMany({
        orderBy: { priority: 'desc' }
      })
      result.dateFormats = dates
      console.log(`  - Formatos de fecha encontrados: ${dates.length}`)
    }

    if (!type || type === 'time') {
      const times = await prisma.timeFormat.findMany({
        orderBy: { priority: 'desc' }
      })
      result.timeFormats = times
      console.log(`  - Formatos de hora encontrados: ${times.length}`)
    }

    if (!type || type === 'response') {
      const responses = await prisma.botResponse.findMany({
        orderBy: { priority: 'desc' }
      })
      result.botResponses = responses
      console.log(`  - Respuestas encontradas: ${responses.length}`)
    }

    console.log('Resultado a enviar:', Object.keys(result))
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error obteniendo patrones:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Crear un nuevo patrón
export async function POST(request: NextRequest) {
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
        result = await prisma.appointmentPattern.create({ data })
        break
      case 'date':
        result = await prisma.dateFormat.create({ data })
        break
      case 'time':
        result = await prisma.timeFormat.create({ data })
        break
      case 'response':
        result = await prisma.botResponse.create({ data })
        break
      default:
        return NextResponse.json(
          { error: 'Tipo inválido' },
          { status: 400 }
        )
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creando patrón:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
