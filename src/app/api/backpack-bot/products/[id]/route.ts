import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  if (!user || user.role !== 'admin') {
    return false
  }
  return true
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
  const productsIndex = pathParts.indexOf('products')
  if (productsIndex !== -1 && pathParts[productsIndex + 1]) {
    return pathParts[productsIndex + 1].trim()
  }
  return null
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

    const id = await resolveId(request, params)
    if (!id) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const product = await prisma.backpackProduct.findUnique({
      where: { id }
    })
    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error obteniendo producto:', error)
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
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede editar productos' },
        { status: 403 }
      )
    }

    const id = await resolveId(request, params)
    if (!id) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const validUseTypes = ['school', 'work']
    const validGenders = ['man', 'woman', 'unisex']

    const data: {
      name?: string
      description?: string
      imageUrl?: string | null
      useType?: string
      gender?: string
      stock?: number
      price?: number
      isActive?: boolean
    } = {}

    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.description !== undefined) data.description = String(body.description).trim()
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null
    if (body.useType !== undefined) {
      if (!validUseTypes.includes(body.useType)) {
        return NextResponse.json({ error: 'useType debe ser school o work' }, { status: 400 })
      }
      data.useType = body.useType
    }
    if (body.gender !== undefined) {
      if (!validGenders.includes(body.gender)) {
        return NextResponse.json({ error: 'gender debe ser man, woman o unisex' }, { status: 400 })
      }
      data.gender = body.gender
    }
    if (body.stock !== undefined) data.stock = Math.max(0, Number(body.stock))
    if (body.price !== undefined) data.price = Math.max(0, Number(body.price))
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar. Incluye al menos uno: name, description, imageUrl, useType, gender, stock, price, isActive' },
        { status: 400 }
      )
    }

    const product = await prisma.backpackProduct.update({
      where: { id },
      data
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error actualizando producto:', error)
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
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede eliminar productos' },
        { status: 403 }
      )
    }

    const id = await resolveId(request, params)
    if (!id) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    await prisma.backpackProduct.delete({
      where: { id }
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error eliminando producto:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
