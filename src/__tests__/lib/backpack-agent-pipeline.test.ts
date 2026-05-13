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

  it('usa el LLM con el catálogo disponible para búsquedas de producto', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'No tengo confirmado ese modelo de dinosaurio en el catálogo.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Tienen mochila roja de dinosaurio?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: fakeProducts,
      history: []
    })

    expect(fetchMock).toHaveBeenCalled()
    expect(reply).toBe('No tengo confirmado ese modelo de dinosaurio en el catálogo.')
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

  it('recorta razonamiento pegado antes de la respuesta final', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Cliente pregunta por mochilas de Batman.\n' +
                  'Revisando el catálogo disponible:\n' +
                  '1. *mochila de batman* | precio:$180.00 | stock:2\n' +
                  'Respuesta a generar debe ser cordial y directa.Sí, tenemos la mochila de batman grande para escuela.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Tienes mochila de Batman?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: [
        {
          ...fakeProducts[0],
          id: 'batman',
          name: 'mochila de batman',
          description: 'mochila para escuela de batman grande',
          price: 180,
          stock: 2
        }
      ],
      history: []
    })

    expect(reply).toBe('Sí, tenemos la mochila de batman grande para escuela.')
  })
})
