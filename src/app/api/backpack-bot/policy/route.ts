import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const POLICY_ID = 'singleton'

function requireAdmin(user: ReturnType<typeof verifyToken>) {
  return user?.role === 'admin'
}

async function getOrCreatePolicy() {
  return prisma.backpackBotPolicy.upsert({
    where: { id: POLICY_ID },
    create: {
      id: POLICY_ID,
      rulesForBot: '',
      customerFacts: '',
      interactionWorkflow: ''
    },
    update: {}
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json({ error: 'Solo el administrador puede ver la política' }, { status: 403 })
    }

    const policy = await getOrCreatePolicy()
    return NextResponse.json({
      rulesForBot: policy.rulesForBot,
      customerFacts: policy.customerFacts,
      interactionWorkflow: policy.interactionWorkflow,
      updatedAt: policy.updatedAt
    })
  } catch (error) {
    console.error('Error obteniendo política mochilas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!requireAdmin(user)) {
      return NextResponse.json({ error: 'Solo el administrador puede editar la política' }, { status: 403 })
    }

    const body = await request.json()
    const current = await getOrCreatePolicy()
    const rulesForBot =
      typeof body.rulesForBot === 'string' ? body.rulesForBot : current.rulesForBot
    const customerFacts =
      typeof body.customerFacts === 'string' ? body.customerFacts : current.customerFacts
    const interactionWorkflow =
      typeof body.interactionWorkflow === 'string'
        ? body.interactionWorkflow
        : current.interactionWorkflow

    const policy = await prisma.backpackBotPolicy.upsert({
      where: { id: POLICY_ID },
      create: {
        id: POLICY_ID,
        rulesForBot,
        customerFacts,
        interactionWorkflow
      },
      update: {
        rulesForBot,
        customerFacts,
        interactionWorkflow
      }
    })

    return NextResponse.json({
      rulesForBot: policy.rulesForBot,
      customerFacts: policy.customerFacts,
      interactionWorkflow: policy.interactionWorkflow,
      updatedAt: policy.updatedAt
    })
  } catch (error) {
    console.error('Error guardando política mochilas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
