import { runBackpackAgentTurn, runBackpackAgentTurnWithMeta } from '@/modules/backpack/domain'
import type { BackpackProduct } from '@prisma/client'

const fakeProducts: BackpackProduct[] = [
  {
    id: 'p1',
    name: 'Mochila Escolar Luna',
    description: 'Mochila negra escolar con compartimento amplio',
    imageUrl: null,
    useType: 'school',
    gender: 'unisex',
    sizes: '[]',
    colors: '[]',
    price: 450,
    stock: 3,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

describe('runBackpackAgentTurn', () => {
  const originalFetch = global.fetch
  const originalUnifiedReasoning = process.env.BACKPACK_LLM_UNIFIED_REASONING

  afterEach(() => {
    global.fetch = originalFetch
    process.env.BACKPACK_LLM_UNIFIED_REASONING = originalUnifiedReasoning
    jest.restoreAllMocks()
  })

  it('consulta de producto usa analisis rápido y segundo LLM con reasoning', async () => {
    let requestBody: {
      messages?: Array<{ role: string; content: string }>
      reasoning_effort?: string
      reasoning?: { effort?: string }
    } = {}
    const requests: Array<typeof requestBody> = []
    global.fetch = jest.fn(async (_url, init) => {
      requestBody = JSON.parse((init?.body as string) || '{}')
      requests.push(requestBody)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochila negra escolar","respuesta_directa":""}'
                    : 'Sí, tenemos la Mochila Escolar Luna en $450.00.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Tienes mochila negra escolar?',
      policy: {
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.',
        flowClassifierSystemPrompt: 'analiza flujo',
        searchLlmSystemPrompt: 'busca en catálogo',
        filterLlmSystemPrompt: 'filtra respuesta'
      },
      products: fakeProducts,
      history: []
    })

    const systemPrompt = requests[1].messages?.[0]?.content ?? ''
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(requests[0].reasoning_effort).toBe('none')
    expect(requests[1].reasoning_effort).toBe('high')
    expect(requests[1].reasoning?.effort).toBe('high')
    expect(systemPrompt).toContain('LLM de productos')
    expect(systemPrompt).toContain('busca en catálogo')
    expect(systemPrompt).toContain('filtra respuesta')
    expect(systemPrompt).toContain('Mochila Escolar Luna')
    expect(systemPrompt).not.toContain('Horario de atención: lunes a viernes de 8 a 5.')
    expect(result.reply).toBe('Sí, tenemos la Mochila Escolar Luna en $450.00.')
  })

  it('primer LLM clasifica "Tienes mochilas de personajes?" como consulta_productos', async () => {
    const requests: Array<{
      messages?: Array<{ role: string; content: string }>
      reasoning_effort?: string
    }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochilas de personajes","respuesta_directa":""}'
                    : 'Sí, tenemos la mochila de sonic en $175.00.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Tienes mochilas de personajes?',
      policy: {
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.',
        flowClassifierSystemPrompt: 'Clasifica productos aunque no tengas catálogo.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'sonic',
          name: 'mochila de sonic',
          description: 'mochila escolar de personaje sonic',
          price: 175,
          stock: 5
        }
      ],
      history: [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Hola, ¿qué mochila buscas?' }
      ]
    })

    const firstSystemPrompt = requests[0].messages?.[0]?.content ?? ''
    const firstPayload = JSON.stringify(requests[0].messages ?? [])
    const productSystemPrompt = requests[1].messages?.[0]?.content ?? ''
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(requests[0].reasoning_effort).toBe('none')
    expect(firstSystemPrompt).toContain('el flujo debe ser consulta_productos')
    expect(firstPayload).toContain('historial_ultimos_5_mensajes')
    expect(firstPayload).toContain('Tienes mochilas de personajes?')
    expect(productSystemPrompt).toContain('LLM de productos')
    expect(requests[1].reasoning_effort).toBe('high')
    expect(result.reply).toBe('Sí, tenemos la mochila de sonic en $175.00.')
  })

  it('conserva detalle Naruto del mensaje actual aunque análisis sea genérico', async () => {
    const requests: Array<{
      messages?: Array<{ role: string; content: string }>
      reasoning_effort?: string
    }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? JSON.stringify({
                        flujo: 'consulta_productos',
                        descripcion: {
                          intencion: 'buscar mochila de personaje',
                          consulta_catalogo: 'mochila naruto personaje escuela',
                          palabras_clave_actuales: ['naruto', 'personaje'],
                          palabras_clave_historial: ['mochilas', 'personajes'],
                          atributos: { personaje: 'naruto', uso: 'escuela' },
                          detalle_para_busqueda:
                            'El cliente primero pidió mochilas de personajes y ahora especifica Naruto.'
                        },
                        respuesta_directa: ''
                      })
                    : 'Sí, tenemos la mochila de naruto en $180.00.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'De personaje de Naruto',
      policy: {
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.',
        flowClassifierSystemPrompt: 'Clasifica productos aunque no tengas catálogo.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar sencilla',
          price: 175,
          stock: 5
        },
        {
          ...fakeProducts[0],
          id: 'naruto',
          name: 'mochila de naruto',
          description: 'mochila de naruto grande para escuela',
          price: 180,
          stock: 2
        }
      ],
      history: [
        { role: 'user', content: 'Tienes de personajes' },
        {
          role: 'assistant',
          content: '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
        }
      ]
    })

    const productSystemPrompt = requests[1].messages?.[0]?.content ?? ''
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(productSystemPrompt).toContain('mochila de naruto')
    expect(productSystemPrompt).not.toContain('*bitono*')
    expect(result.reply).toBe('Sí, tenemos la mochila de naruto en $180.00.')
  })

  it('si el LLM de productos responde en inglés, usa respuesta determinística en español', async () => {
    const requests: Array<{
      messages?: Array<{ role: string; content: string }>
      reasoning_effort?: string
    }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? JSON.stringify({
                        flujo: 'consulta_productos',
                        descripcion: {
                          intencion: 'buscar mochila de personaje',
                          consulta_catalogo: 'mochila naruto personaje escuela',
                          palabras_clave_actuales: ['naruto', 'personaje'],
                          palabras_clave_historial: ['mochilas', 'personajes']
                        },
                        respuesta_directa: ''
                      })
                    : 'Yes, we have Naruto backpacks available.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'De personaje de Naruto',
      policy: {
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.',
        flowClassifierSystemPrompt: 'Clasifica productos aunque no tengas catálogo.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'naruto',
          name: 'mochila de naruto',
          description: 'mochila de naruto grande para escuela',
          price: 180,
          stock: 2
        }
      ],
      history: [
        { role: 'user', content: 'Tienes de personajes' },
        {
          role: 'assistant',
          content: '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
        }
      ]
    })

    expect(result.reply).toContain('mochila de naruto')
    expect(result.reply).not.toContain('Yes')
    expect(result.reply).not.toContain('backpacks')
  })

  it('pide más detalles con el LLM cuando no encuentra información en la BD', async () => {
    const fetchMock = jest.fn(async () => {
      const content =
        fetchMock.mock.calls.length === 1
          ? 'No tengo confirmado ese modelo de dinosaurio en el catálogo.'
          : '¿Me puedes decir si buscas mochila escolar, de trabajo o algún color específico?'
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Tienen mochila roja de dinosaurio?',
      policy: { customerFacts: 'Horario 10:30 a 19:30.' },
      products: fakeProducts,
      history: []
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(reply).toBe('¿Me puedes decir si buscas mochila escolar, de trabajo o algún color específico?')
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

  it('si no hay coincidencia real, no manda modelos por default y pide detalle', async () => {
    const fetchMock = jest.fn(async () => {
      const content =
        fetchMock.mock.calls.length === 1
          ? 'Cliente pregunta por mochilas de unicornio.\nRevisando el catálogo disponible:\n1. No hay coincidencia.'
          : '¿Me puedes decir qué color, tamaño o personaje buscas en la mochila?'
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: '¿Tienes mochila de unicornio?',
      policy: { customerFacts: 'Horario configurado por empresa.' },
      products: fakeProducts,
      history: []
    })

    expect(reply).toBe('¿Me puedes decir qué color, tamaño o personaje buscas en la mochila?')
    expect(reply).not.toContain('Mochila Escolar Luna')
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

  it('usa los últimos 5 mensajes para formular una pregunta cuando el LLM responde vacío', async () => {
    let secondRequest: { messages?: Array<{ role: string; content: string }> } = {}
    const fetchMock = jest.fn(async (_url, init) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '' } }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      secondRequest = JSON.parse((init?.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '¿Buscas una mochila para escuela o para trabajo?'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'tienes alguna mochila bonita?',
      policy: { customerFacts: 'Horario configurado por empresa.' },
      products: fakeProducts,
      history: [
        { role: 'user', content: 'mensaje 1' },
        { role: 'assistant', content: 'respuesta 1' },
        { role: 'user', content: 'mensaje 2' },
        { role: 'assistant', content: 'respuesta 2' },
        { role: 'user', content: 'mensaje 3' },
        { role: 'assistant', content: 'respuesta 3' }
      ]
    })

    const sentMessages = secondRequest.messages ?? []
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      reply: '¿Buscas una mochila para escuela o para trabajo?',
      needsClarification: true,
      exhaustedClarification: false,
      clarificationKey: expect.any(String)
    })
    expect(JSON.stringify(sentMessages)).not.toContain('mensaje 1')
    expect(JSON.stringify(sentMessages)).toContain('respuesta 1')
    expect(JSON.stringify(sentMessages)).toContain('mensaje 3')
  })

  it('después de 3 aclaraciones fallidas responde el mensaje estático', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'No encontré información sobre eso.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'tienes mochila de ese?',
      policy: { customerFacts: 'Horario configurado por empresa.' },
      products: fakeProducts,
      history: [],
      clarificationAttempts: 3,
      clarificationKey: 'consulta_productos:tienes mochila de ese:tienes mochila de ese'
    })

    expect(result).toEqual({
      reply: 'Por el momento no podemos atenderle.',
      needsClarification: false,
      exhaustedClarification: true,
      clarificationKey: expect.any(String)
    })
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  it('pasa la política de entrega al LLM para que responda al cliente', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      requests.push(JSON.parse((init?.body as string) || '{}'))
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

    expect(global.fetch).toHaveBeenCalledTimes(0)
    expect(reply).toBe(
      'Envíos y entregas\n• Las entregas se hacen solo en sucursal Centro.\n• Para compras por caja podemos coordinar envío regional.'
    )
  })

  it('pasa el horario de atención al LLM para que responda apertura y cierre', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      requests.push(JSON.parse((init?.body as string) || '{}'))
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

    expect(global.fetch).toHaveBeenCalledTimes(0)
    expect(reply).toBe('Horario de atención\n• De lunes a viernes de 8:15 a 17:45 horas')
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

  it('con clasificador configurado primero decide el flujo y luego envía solo contexto de horarios', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      const isClassifier = requests.length === 1
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: isClassifier
                  ? JSON.stringify({
                      flujo: 'consulta_horarios',
                      descripcion: 'quiere saber a qué hora abren y cierran',
                      respuesta_directa: 'Abrimos de lunes a viernes de 8:15 a 17:45 horas.'
                    })
                  : 'Abrimos de lunes a viernes de 8:15 a 17:45 horas.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: 'A qué hora abren?',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"consulta_horarios","descripcion":"..."}',
        customerFacts: [
          'Ubicación',
          '• Sucursal Norte',
          'Horario de atención',
          '• De lunes a viernes de 8:15 a 17:45 horas',
          'Envíos y entregas',
          '• No hay entregas fuera de sucursal.'
        ].join('\n')
      },
      products: fakeProducts,
      history: [
        { role: 'user', content: 'mensaje viejo 1' },
        { role: 'assistant', content: 'respuesta vieja 1' },
        { role: 'user', content: 'mensaje reciente' }
      ]
    })

    const classifierPayload = JSON.stringify(requests[0].messages ?? [])

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(classifierPayload).toContain('historial_ultimos_5_mensajes')
    expect(classifierPayload).toContain('mensaje reciente')
    expect(classifierPayload).not.toContain('Mochila Escolar Luna')
    expect(reply).toBe('Abrimos de lunes a viernes de 8:15 a 17:45 horas.')
  })

  it('con clasificador configurado limita consulta de productos al catálogo y no manda datos de empresa', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochila negra escolar"}'
                    : 'Sí, tenemos la Mochila Escolar Luna en $450.00, con 3 en existencia.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: 'Tienes mochila negra escolar?',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"consulta_productos","descripcion":"..."}',
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.\nUbicación: Sucursal Centro.'
      },
      products: fakeProducts,
      history: []
    })

    const finalSystemPrompt = requests[1].messages?.[0]?.content ?? ''
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(finalSystemPrompt).toContain('Flujo activado: consulta_productos')
    expect(finalSystemPrompt).toContain('Mochila Escolar Luna')
    expect(finalSystemPrompt).not.toContain('Horario de atención: lunes a viernes')
    expect(finalSystemPrompt).not.toContain('Ubicación: Sucursal Centro')
    expect(reply).toBe('Sí, tenemos la Mochila Escolar Luna en $450.00, con 3 en existencia.')
  })

  it('recupera modelos reforzados cuando la descripcion del análisis conserva palabras clave', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochilas reforzadas"}'
                    : 'Sí, tenemos la mochila reforzada Lona Pro en $300.00.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const reply = await runBackpackAgentTurn({
      userText: 'Y tienes mochilas reforzada?',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierSystemPrompt:
          'Clasifica el flujo y conserva palabras clave como reforzada en la descripcion.',
        flowClassifierOutputFormat: '{"flujo":"consulta_productos","descripcion":"..."}',
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar sencilla',
          price: 175,
          stock: 5
        },
        {
          ...fakeProducts[0],
          id: 'lona-pro',
          name: 'mochila reforzada Lona Pro',
          description: 'mochila escolar de lona reforzada para uso diario',
          price: 300,
          stock: 4
        },
        {
          ...fakeProducts[0],
          id: 'candado',
          name: 'diamante de candado',
          description: 'mochila grande con costuras reforzadas y candado',
          price: 240,
          stock: 10
        }
      ],
      history: []
    })

    const finalSystemPrompt = requests[1].messages?.[0]?.content ?? ''
    const classifierSystemPrompt = requests[0].messages?.[0]?.content ?? ''
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(classifierSystemPrompt).toContain('conserva palabras clave')
    expect(finalSystemPrompt).toContain('mochila reforzada Lona Pro')
    expect(finalSystemPrompt).toContain('diamante de candado')
    expect(finalSystemPrompt).not.toContain('*bitono*')
    expect(reply).toBe('Sí, tenemos la mochila reforzada Lona Pro en $300.00.')
  })

  it('pide más detalles cuando una búsqueda específica no tiene coincidencias reales', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochilas con ruedas"}'
                    : '¿Me puedes decir si buscas mochila escolar, de trabajo o algún color específico?'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Tienes mochilas con ruedas?',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"consulta_productos","descripcion":"..."}',
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar sencilla',
          price: 175,
          stock: 5
        }
      ],
      history: []
    })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      reply: '¿Me puedes decir si buscas mochila escolar, de trabajo o algún color específico?',
      needsClarification: true,
      exhaustedClarification: false,
      clarificationKey: expect.any(String)
    })
  })

  it('para modelos de personajes pide detalles genéricos sin heredar intentos de otra consulta', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca modelos de personajes"}'
                    : '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Que modelos de personajes tienes ?',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"consulta_productos","descripcion":"..."}',
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar sencilla',
          price: 175,
          stock: 5
        }
      ],
      history: [],
      clarificationAttempts: 3,
      clarificationKey: 'consulta_productos:busca mochilas con ruedas'
    })

    expect(global.fetch).toHaveBeenCalledTimes(4)
    expect(result.reply).toBe('¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.')
    expect(result.needsClarification).toBe(true)
    expect(result.exhaustedClarification).toBe(false)
    expect(result.clarificationKey).toContain('personajes')
  })

  it('para busqueda de personajes usa pregunta determinística si el LLM de aclaración no ayuda', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochilas de personajes"}'
                    : 'No encontré información sobre eso.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Hola buenas noches busco mochilas de personajes',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"consulta_productos","descripcion":"..."}',
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar sencilla',
          price: 175,
          stock: 5
        }
      ],
      history: [],
      clarificationAttempts: 3,
      clarificationKey: 'consulta_productos:busca mochilas de personajes'
    })

    expect(global.fetch).toHaveBeenCalledTimes(4)
    expect(result.reply).toBe('¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.')
    expect(result.needsClarification).toBe(true)
    expect(result.exhaustedClarification).toBe(false)
  })

  it('flujo completo inicial: "Hola tines de personajes" pide detalle del personaje', async () => {
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochilas de personajes"}'
                    : 'No encontré información sobre eso.'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Hola tines de personajes',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"consulta_productos","descripcion":"..."}',
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar sencilla',
          price: 175,
          stock: 5
        }
      ],
      history: [],
      clarificationAttempts: 0,
      clarificationKey: null
    })

    expect(requests[0].messages?.[1]?.content).toContain('Hola tines de personajes')
    expect(global.fetch).toHaveBeenCalledTimes(4)
    expect(result).toEqual({
      reply: '¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.',
      needsClarification: true,
      exhaustedClarification: false,
      clarificationKey: expect.stringContaining('personajes')
    })
  })

  it('descarta razonamiento interno del LLM de aclaración y usa pregunta genérica', async () => {
    const metaReply =
      'El usuario preguntó por "tines de personajes".\n' +
      'La base de datos no encontró productos activos para esa consulta.\n' +
      'Debo pedir al usuario que especifique qué tipo de producto o personaje busca para poder ayudarle a encontrar algo.\n' +
      'Objetivo: Pedir el detalle más útil para refinar la búsqueda.\n' +
      'Idioma: Español de México.\n' +
      'Límite: Máximo 2 líneas.¿Podrías decirme qué tipo de personajes o tines estás buscando?'
    const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = []
    global.fetch = jest.fn(async (_url, init) => {
      const parsed = JSON.parse((init?.body as string) || '{}')
      requests.push(parsed)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1
                    ? '{"flujo":"consulta_productos","descripcion":"busca mochilas de personajes"}'
                    : metaReply
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Hola tines de personajes ?',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"consulta_productos","descripcion":"..."}',
        customerFacts: 'Horario de atención: lunes a viernes de 8 a 5.'
      },
      products: [
        {
          ...fakeProducts[0],
          id: 'bitono',
          name: 'bitono',
          description: 'mochila escolar sencilla',
          price: 175,
          stock: 5
        }
      ],
      history: []
    })

    expect(global.fetch).toHaveBeenCalledTimes(4)
    expect(result.reply).toBe('¿Qué tipo de mochila buscas? Puedes darme más detalles: si es para escuela o trabajo, color, personaje, material o tamaño.')
    expect(result.reply).not.toContain('El usuario')
    expect(result.reply).not.toContain('tines')
    expect(result.needsClarification).toBe(true)
  })

  it('fuera de alcance también entra al ciclo de aclaración hasta 3 veces', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"flujo":"fuera_de_alcance","descripcion":"pide información fuera de la tienda"}'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'háblame de otra cosa',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"fuera_de_alcance","descripcion":"..."}',
        customerFacts: 'Horario 10:30 a 19:30.'
      },
      products: fakeProducts,
      history: [],
      clarificationAttempts: 3,
      clarificationKey: 'fuera_de_alcance:otra consulta anterior'
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.reply).toContain('Qué tipo de mochila buscas')
    expect(result.needsClarification).toBe(true)
    expect(result.exhaustedClarification).toBe(false)
  })

  it('con clasificador configurado responde guía cuando el mensaje queda fuera de alcance', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"flujo":"fuera_de_alcance","descripcion":"pide una receta"}'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const result = await runBackpackAgentTurnWithMeta({
      userText: 'Dame una receta de pastel',
      policy: {
        flowClassifierInputFormat: '{}',
        flowClassifierOutputFormat: '{"flujo":"fuera_de_alcance","descripcion":"..."}',
        customerFacts: 'Horario 10:30 a 19:30.'
      },
      products: fakeProducts,
      history: []
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.reply).toContain('Qué tipo de mochila buscas')
    expect(result.needsClarification).toBe(true)
  })
})
