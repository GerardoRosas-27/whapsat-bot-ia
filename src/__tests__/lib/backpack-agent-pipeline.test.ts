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

  it('si usa fallback por meta texto, no regresa los primeros productos por defecto', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Cliente pregunta por mochilas de Ironman.\n' +
                  'Revisando el catálogo disponible:\n' +
                  '1. Se encontró un producto relacionado en el catálogo.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: 'Hola tienes mochilas de personajes como de Ironman ?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar bitono'
        },
        {
          ...fakeProducts[0],
          id: 'iroman',
          name: 'mochila de iroman',
          description: 'mochila para escuela de ironman grande reforzada',
          price: 180,
          stock: 2
        }
      ],
      history: []
    })

    expect(reply).toContain('mochila de iroman')
    expect(reply).not.toContain('bitono')
  })

  it('elimina respuestas finales duplicadas pegadas', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Sí, tenemos la mochila escolar de iroman grande reforzada. ¿Te interesa esa o buscas algo más?' +
                  'Sí, tenemos la mochila escolar de iroman grande reforzada. ¿Te interesa esa o buscas algo más?'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Tienes mochila de Ironman?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: [
        {
          ...fakeProducts[0],
          id: 'iroman',
          name: 'mochila de iroman',
          description: 'mochila escolar de iroman grande reforzada',
          price: 180,
          stock: 2
        }
      ],
      history: []
    })

    expect(reply).toBe(
      'Sí, tenemos la mochila escolar de iroman grande reforzada. ¿Te interesa esa o buscas algo más?'
    )
  })

  it('recorta instrucciones internas de acción antes de la respuesta final', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Confirmar disponibilidad y ofrecer información si es necesario.' +
                  'Sí, tenemos la mochila escolar de capitan america grande. ¿Te interesa?'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Tienes mochila de Capitán América?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: [
        {
          ...fakeProducts[0],
          id: 'capitan',
          name: 'mochila de capitan america',
          description: 'mochila escolar de capitan america grande',
          price: 180,
          stock: 2
        }
      ],
      history: []
    })

    expect(reply).toBe('Sí, tenemos la mochila escolar de capitan america grande. ¿Te interesa?')
  })

  it('pasa la política de entrega al LLM para que responda al cliente', async () => {
    let parsed: { messages?: Array<{ role: string; content: string }> } = {}
    global.fetch = jest.fn(async (_url, init) => {
      parsed = JSON.parse((init?.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Las entregas se hacen solo en sucursal Centro. Para compras por caja podemos coordinar envío regional.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: 'Dónde entregas',
      policy: {
        customerFacts: [
          'Información de empresa configurada — Tienda Demo',
          'Ubicación',
          '• Sucursal Centro',
          'Horario de atención',
          '• Lunes a sábado de 9:00 a 18:00 horas',
          'Catálogo y existencias',
          '• Solo manejamos modelos publicados',
          'Formas de pago',
          '• Efectivo',
          'Envíos y entregas',
          '• Las entregas se hacen solo en sucursal Centro.',
          '• Para compras por caja podemos coordinar envío regional.'
        ].join('\n')
      },
      products: fakeProducts,
      history: []
    })

    const systemPrompt = parsed.messages?.[0]?.content ?? ''
    expect(systemPrompt).toContain('Información oficial del negocio (Datos de empresa configurados)')
    expect(systemPrompt).toContain('Las entregas se hacen solo en sucursal Centro')
    expect(systemPrompt).toContain('Para compras por caja podemos coordinar envío regional')
    expect(reply).toBe(
      'Las entregas se hacen solo en sucursal Centro. Para compras por caja podemos coordinar envío regional.'
    )
  })

  it('pasa el horario de atención al LLM para que responda apertura y cierre', async () => {
    let parsed: { messages?: Array<{ role: string; content: string }> } = {}
    global.fetch = jest.fn(async (_url, init) => {
      parsed = JSON.parse((init?.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Abrimos de lunes a viernes de 8:15 a 17:45 horas.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: 'A qué hora abren y cierran?',
      policy: {
        customerFacts: [
          'Información de empresa configurada — Tienda Demo',
          'Ubicación',
          '• Sucursal Norte',
          'Horario de atención',
          '• De lunes a viernes de 8:15 a 17:45 horas',
          'Catálogo y existencias',
          '• Solo manejamos modelos publicados',
          'Formas de pago',
          '• Efectivo',
          'Envíos y entregas',
          '• No hay entregas fuera de sucursal.'
        ].join('\n')
      },
      products: fakeProducts,
      history: []
    })

    const systemPrompt = parsed.messages?.[0]?.content ?? ''
    expect(systemPrompt).toContain('Información oficial del negocio (Datos de empresa configurados)')
    expect(systemPrompt).toContain('Horario de atención')
    expect(systemPrompt).toContain('De lunes a viernes de 8:15 a 17:45 horas')
    expect(reply).toBe('Abrimos de lunes a viernes de 8:15 a 17:45 horas.')
  })

  it('usa la política oficial como red de seguridad si el LLM responde con meta texto', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Informar sobre la política de envío'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: 'Dónde entregas',
      policy: {
        customerFacts: [
          'Información de empresa configurada — Tienda Demo',
          'Ubicación',
          '• Sucursal Centro',
          'Horario de atención',
          '• Lunes a sábado de 9:00 a 18:00 horas',
          'Catálogo y existencias',
          '• Solo manejamos modelos publicados',
          'Formas de pago',
          '• Efectivo',
          'Envíos y entregas',
          '• Las entregas se hacen solo en sucursal Centro.',
          '• Para compras por caja podemos coordinar envío regional.'
        ].join('\n')
      },
      products: fakeProducts,
      history: []
    })

    expect(reply).toContain('Las entregas se hacen solo en sucursal Centro')
    expect(reply).toContain('Para compras por caja podemos coordinar envío regional')
    expect(reply).not.toContain('Informar sobre')
  })
})
