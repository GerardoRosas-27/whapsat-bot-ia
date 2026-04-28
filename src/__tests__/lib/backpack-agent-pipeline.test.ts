import { runBackpackAgentTurn } from '@/modules/backpack/domain'
import type { BackpackProduct } from '@prisma/client'

const fakeProducts: BackpackProduct[] = [
  {
    id: 'p1',
    name: 'Mochila Escolar Luna',
    description: 'Mochila negra escolar con compartimento amplio',
    imageUrl: null,
    useType: 'school',
    gender: 'unisex',
    price: 450,
    stock: 3,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

describe('runBackpackAgentTurn', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('responde sin llamar al LLM cuando el producto específico no existe', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Tienen mochila roja de dinosaurio?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: fakeProducts,
      history: []
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(reply).toContain('No encontré ese modelo')
  })

  it('bloquea respuestas con JSON o código antes de enviarlas al cliente', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"reply":"Tenemos la Mochila Escolar Luna en $450"}'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Qué mochilas escolares tienen?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: fakeProducts,
      history: []
    })

    expect(reply).toContain('Disculpa')
    expect(reply).not.toContain('{')
    expect(reply).not.toContain('reply')
  })
})
