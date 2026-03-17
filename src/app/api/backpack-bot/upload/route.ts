import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { randomBytes } from 'crypto'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  if (!user || user.role !== 'admin') return false
  return true
}

const MAX_SIZE_MB = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json(
        { error: 'Solo el administrador puede subir imágenes' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Envía un archivo en el campo "file"' },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Usa JPEG, PNG, WebP o GIF.' },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `El archivo no debe superar ${MAX_SIZE_MB} MB` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const output = await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    const dir = path.join(process.cwd(), 'public', 'uploads', 'products')
    fs.mkdirSync(dir, { recursive: true })
    const filename = `${randomBytes(8).toString('hex')}.webp`
    const filePath = path.join(dir, filename)
    fs.writeFileSync(filePath, output)

    const url = `/uploads/products/${filename}`
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Error subiendo imagen:', error)
    return NextResponse.json(
      { error: 'Error al procesar la imagen' },
      { status: 500 }
    )
  }
}
