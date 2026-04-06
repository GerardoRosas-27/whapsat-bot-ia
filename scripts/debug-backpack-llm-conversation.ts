/**
 * Simula 2 turnos (texto + imagen) del bot de mochilas contra el pipeline LLM.
 *
 * Uso:
 *   npx tsx scripts/debug-backpack-llm-conversation.ts           → solo prueba mock (fetch falso)
 *   npx tsx scripts/debug-backpack-llm-conversation.ts --real     → llama a LM Studio real (.env)
 *
 * Depura: variables de entorno, cuerpo del POST (incl. image_url) y respuesta.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { isBackpackLlmEnabled } from '../src/lib/backpack-lm-studio'
import {
  runBackpackLlmTurn,
  TINY_PNG_DATA_URL
} from '../src/lib/backpack-llm-pipeline'

const prisma = new PrismaClient()

async function loadPolicy() {
  const row = await prisma.backpackBotPolicy.findUnique({
    where: { id: 'singleton' }
  })
  return {
    rulesForBot: row?.rulesForBot ?? '',
    customerFacts: row?.customerFacts ?? '',
    interactionWorkflow: row?.interactionWorkflow ?? ''
  }
}

async function runWithMockFetch() {
  const original = globalThis.fetch
  let lastUrl = ''
  let lastBody: Record<string, unknown> | null = null

  globalThis.fetch = (async (
    url: RequestInfo | URL,
    init?: RequestInit
  ) => {
    lastUrl = String(url)
    lastBody = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : null
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '*Simulación:* Veo una imagen de prueba. Comparo con catálogo (mock).'
            }
          }
        ]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }) as typeof fetch

  try {
    const policy = await loadPolicy()
    const products = await prisma.backpackProduct.findMany({
      where: { isActive: true },
      take: 20
    })

    console.log('\n=== Turno 1: solo texto ===\n')
    const r1 = await runBackpackLlmTurn({
      userText: 'Hola, busco una mochila para la escuela',
      userImageDataUrl: null,
      policy,
      products,
      history: []
    })
    console.log('Respuesta:', r1)
    const msg1 = lastBody?.messages as unknown[] | undefined
    const user1 = msg1?.[msg1.length - 1]
    console.log('POST último mensaje user (extracto):', JSON.stringify(user1).slice(0, 280))

    console.log('\n=== Turno 2: texto + imagen (PNG 1×1 de prueba) ===\n')
    const r2 = await runBackpackLlmTurn({
      userText: 'Busca si tienen esta mochila o una parecida',
      userImageDataUrl: TINY_PNG_DATA_URL,
      policy,
      products,
      history: [
        { role: 'user', content: 'Hola, busco una mochila para la escuela' },
        { role: 'assistant', content: r1 }
      ]
    })
    console.log('Respuesta:', r2)
    const msg2 = lastBody?.messages as unknown[] | undefined
    const user2 = msg2?.[msg2.length - 1]
    const user2Str = JSON.stringify(user2)
    const hasImageUrl = user2Str.includes('image_url')
    console.log('¿El mensaje user incluye image_url?:', hasImageUrl)
    if (!hasImageUrl) {
      console.error('ERROR: el turno con imagen no envió image_url al modelo.')
      process.exitCode = 1
    } else {
      console.log('OK: visión enviada en el payload.')
    }
    console.log('\nURL llamada:', lastUrl)
  } finally {
    globalThis.fetch = original
  }
}

async function runReal() {
  const policy = await loadPolicy()
  const products = await prisma.backpackProduct.findMany({
    where: { isActive: true }
  })

  console.log('\n=== Turno real 1 (texto) ===\n')
  const r1 = await runBackpackLlmTurn({
    userText: '¿Qué mochilas tienen en stock?',
    userImageDataUrl: null,
    policy,
    products,
    history: []
  })
  console.log(r1)

  console.log('\n=== Turno real 2 (imagen prueba + texto) ===\n')
  const r2 = await runBackpackLlmTurn({
    userText: '¿Se parece a algo del catálogo?',
    userImageDataUrl: TINY_PNG_DATA_URL,
    policy,
    products,
    history: [
      { role: 'user', content: '¿Qué mochilas tienen en stock?' },
      { role: 'assistant', content: r1 }
    ]
  })
  console.log(r2)
}

async function main() {
  console.log('BACKPACK_LLM_ENABLED (raw):', JSON.stringify(process.env.BACKPACK_LLM_ENABLED))
  console.log('isBackpackLlmEnabled():', isBackpackLlmEnabled())
  console.log('LM_STUDIO_BASE_URL:', process.env.LM_STUDIO_BASE_URL || '(default localhost:1234)')

  const useReal = process.argv.includes('--real')
  if (useReal) {
    if (!isBackpackLlmEnabled()) {
      console.error('Para --real necesitas BACKPACK_LLM_ENABLED=true en .env')
      process.exit(1)
    }
    await runReal()
  } else {
    await runWithMockFetch()
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
