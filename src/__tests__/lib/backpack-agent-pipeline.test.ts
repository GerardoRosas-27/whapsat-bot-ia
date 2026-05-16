import { runBackpackAgentTurnWithMeta } from '@/modules/backpack/domain'
import type { BackpackProduct } from '@prisma/client'

const fakeProducts: BackpackProduct[] = [
  {
    id: 'naruto',
    name: 'mochila de naruto',
    description: 'mochila de naruto grande para escuela',
    imageUrl: null,
    useType: 'school',
    gender: 'unisex',
    sizes: '[]',
    colors: '[]',
    price: 180,
    stock: 2,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

describe('runBackpackAgentTurn unified LLM mode', () => {
  const originalFetch = global.fetch
  const originalUnifiedReasoning = process.env.BACKPACK_LLM_UNIFIED_REASONING

  afterEach(() => {
    global.fetch = originalFetch
    process.env.BACKPACK_LLM_UNIFIED_REASONING = originalUnifiedReasoning
    jest.restoreAllMocks()
  })

  it('usa una sola llamada con contexto unificado y reasoning apagado por defecto', async () => {
    let requestBody: {
      messages?: Array<{ role: string; content: string }>
      reasoning_effort?: string
      reasoning?: { effort?: string }
    } = {}
    process.env.BACKPACK_LLM_UNIFIED_REASONING = 'false'
    global.fetch = jest.fn(async (_url, init) => {
      requestBody = JSON.parse((init?.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Sí, tenemos la mochila de naruto en $180.00.' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'De personaje de Naruto',
      policy: {
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.',
        flowClassifierSystemPrompt: 'analiza flujo',
        searchLlmSystemPrompt: 'busca catálogo',
        filterLlmSystemPrompt: 'filtra respuesta'
      },
      products: fakeProducts,
      history: [
        { role: 'user', content: 'Tienes de personajes' },
        {
          role: 'assistant',
          content:
            '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
        }
      ]
    })

    const systemPrompt = requestBody.messages?.[0]?.content ?? ''
    const serializedMessages = JSON.stringify(requestBody.messages ?? [])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(requestBody.reasoning_effort).toBe('none')
    expect(systemPrompt).toContain('Modo unificado de razonamiento')
    expect(systemPrompt).toContain('analiza flujo')
    expect(systemPrompt).toContain('busca catálogo')
    expect(systemPrompt).toContain('filtra respuesta')
    expect(systemPrompt).toContain('mochila de naruto')
    expect(systemPrompt).toContain('Horario de atención')
    expect(serializedMessages).toContain('Tienes de personajes')
    expect(serializedMessages).toContain('De personaje de Naruto')
    expect(result).toEqual({
      reply: 'Sí, tenemos la mochila de naruto en $180.00.',
      needsClarification: false,
      exhaustedClarification: false,
      clarificationKey: expect.stringContaining('unified:')
    })
  })

  it('activa reasoning en la misma llamada cuando BACKPACK_LLM_UNIFIED_REASONING=true', async () => {
    let requestBody: { reasoning_effort?: string; reasoning?: { effort?: string } } = {}
    process.env.BACKPACK_LLM_UNIFIED_REASONING = 'true'
    global.fetch = jest.fn(async (_url, init) => {
      requestBody = JSON.parse((init?.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Sí, tenemos la mochila de naruto en $180.00.' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await runBackpackAgentTurnWithMeta({
      userText: 'Tienes mochila de naruto?',
      policy: { customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.' },
      products: fakeProducts,
      history: []
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(requestBody.reasoning_effort).toBe('high')
    expect(requestBody.reasoning?.effort).toBe('high')
  })

  it('si la respuesta viene en inglés, usa respuesta determinística en español desde el catálogo', async () => {
    process.env.BACKPACK_LLM_UNIFIED_REASONING = 'true'
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Yes, we have Naruto backpacks available.' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'De personaje de Naruto',
      policy: { customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.' },
      products: fakeProducts,
      history: [{ role: 'user', content: 'Tienes de personajes' }]
    })

    expect(result.reply).toContain('mochila de naruto')
    expect(result.reply).not.toContain('Yes')
    expect(result.reply).not.toContain('backpacks')
  })
})
