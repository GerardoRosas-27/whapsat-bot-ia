import fs from 'fs'
import path from 'path'
import { runBackpackLlmTurn, TINY_PNG_DATA_URL } from '@/modules/backpack/domain'
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
    sizes: '[]',
    colors: '[]',
    price: 100,
    stock: 2,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

const testCatalogImageUrl = '/test-catalog-image.png'

function writeTestCatalogImage() {
  const [, base64] = TINY_PNG_DATA_URL.split(',')
  const filePath = path.join(process.cwd(), 'public', testCatalogImageUrl.replace(/^\//, ''))
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
}

function deleteTestCatalogImage() {
  const filePath = path.join(process.cwd(), 'public', testCatalogImageUrl.replace(/^\//, ''))
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

describe('runBackpackLlmTurn', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    deleteTestCatalogImage()
  })

  it('compara la imagen del cliente contra una imagen del catálogo', async () => {
    writeTestCatalogImage()
    let parsed: { messages?: unknown[] } = {}
    global.fetch = jest.fn(async (_url, init) => {
      parsed = JSON.parse((init!.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"similarity": 92}' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await runBackpackLlmTurn({
      userText: '¿Tienen esta?',
      userImageDataUrl: TINY_PNG_DATA_URL,
      policy: emptyPolicy,
      products: [{ ...fakeProducts[0], imageUrl: testCatalogImageUrl }],
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
    expect(str).toContain('foto del cliente')
    expect(str).toContain('foto del catálogo')
    expect(str).toContain('data:image/png;base64,')
  })

  it('sin imagen, el user message es texto o array sin image_url de cliente', async () => {
    let parsed: { messages?: unknown[] } = {}
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
