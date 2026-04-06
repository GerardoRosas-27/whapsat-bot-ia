import { runBackpackLlmTurn, TINY_PNG_DATA_URL } from '@/lib/backpack-llm-pipeline'
import type { BackpackProduct } from '@prisma/client'

const emptyPolicy = {
  rulesForBot: 'Sé breve.',
  customerFacts: 'Horario 10–19.',
  interactionWorkflow: ''
}

const fakeProducts: BackpackProduct[] = [
  {
    id: 'p1',
    name: 'Mochila test',
    description: 'Negra escolar',
    imageUrl: null,
    useType: 'school',
    gender: 'unisex',
    price: 100,
    stock: 2,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

describe('runBackpackLlmTurn', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('envía image_url en el último mensaje user cuando hay foto', async () => {
    let parsed: { messages?: unknown[] } | null = null
    global.fetch = jest.fn(async (_url, init) => {
      parsed = JSON.parse((init!.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OK visión' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await runBackpackLlmTurn({
      userText: '¿Tienen esta?',
      userImageDataUrl: TINY_PNG_DATA_URL,
      policy: emptyPolicy,
      products: fakeProducts,
      history: []
    })

    const messages = parsed?.messages ?? []
    const last = messages[messages.length - 1] as {
      role: string
      content: unknown
    }
    expect(last.role).toBe('user')
    const str = JSON.stringify(last.content)
    expect(str).toContain('image_url')
  })

  it('sin imagen, el user message es texto o array sin image_url de cliente', async () => {
    let parsed: { messages?: unknown[] } | null = null
    global.fetch = jest.fn(async (_url, init) => {
      parsed = JSON.parse((init!.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OK texto' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await runBackpackLlmTurn({
      userText: 'Hola',
      userImageDataUrl: null,
      policy: emptyPolicy,
      products: fakeProducts,
      history: []
    })

    const messages = parsed?.messages ?? []
    const last = messages[messages.length - 1] as { content: unknown }
    const str = JSON.stringify(last.content)
    expect(str).not.toContain('image_url')
  })
})
