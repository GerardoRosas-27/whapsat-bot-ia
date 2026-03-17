import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  if (!user || user.role !== 'admin') {
    return false
  }
  return true
}

export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const products = await prisma.backpackProduct.findMany({
      orderBy: [{ useType: 'asc' }, { gender: 'asc' }, { name: 'asc' }]
    })

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Error listando productos mochilas:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = verifyToken(request)

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede crear productos' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, description, imageUrl, useType, gender, stock, price } = body

    if (!name || !description || !useType || !gender) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: name, description, useType, gender' },
        { status: 400 }
      )
    }

    const validUseTypes = ['school', 'work']
    const validGenders = ['man', 'woman', 'unisex']
    if (!validUseTypes.includes(useType) || !validGenders.includes(gender)) {
      return NextResponse.json(
        { error: 'useType debe ser school o work; gender debe ser man, woman o unisex' },
        { status: 400 }
      )
    }

    const product = await prisma.backpackProduct.create({
      data: {
        name: String(name).trim(),
        description: String(description).trim(),
        imageUrl: imageUrl ? String(imageUrl).trim() : null,
        useType,
        gender,
        stock: typeof stock === 'number' ? Math.max(0, stock) : 0,
        price: typeof price === 'number' && price >= 0 ? price : 0
      }
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Error creando producto mochila:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
