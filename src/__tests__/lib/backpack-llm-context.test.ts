import { fetchBackpackCatalogForLlm, sanitizeLlmReplyForCustomer } from '@/modules/backpack/domain'
import { prisma } from '@/lib/prisma'

describe('sanitizeLlmReplyForCustomer', () => {
  it('elimina monólogo CoT en inglés y deja solo el mensaje en español', () => {
    const raw = `Got it, let's see. The client sent a photo.

Hola, esa mochila no la tenemos en catálogo. ¿Te muestro *bitono* o *luna*?`
    expect(sanitizeLlmReplyForCustomer(raw)).toBe(
      'Hola, esa mochila no la tenemos en catálogo. ¿Te muestro *bitono* o *luna*?'
    )
  })

  it('si solo hay razonamiento en inglés, devuelve el mensaje de fallback', () => {
    const raw = `Got it, let's see. The client sent a photo of a backpack. The catalog has two items. So the response should say we don't have that model.`
    const out = sanitizeLlmReplyForCustomer(raw)
    expect(out).toContain('Disculpa')
    expect(out).not.toMatch(/Got it/i)
  })

  it('no borra respuestas válidas que empiezan con Okay y siguen en español', () => {
    const raw =
      'Okay, tenemos la *Luna* con stock, te la dejo en $450. ¿Te sirve?'
    expect(sanitizeLlmReplyForCustomer(raw)).toBe(raw)
  })

  it('quita oraciones iniciales CoT en un solo párrafo antes del español', () => {
    const raw =
      'Got it. Hola, no tenemos ese modelo en catálogo. Te puedo mostrar *bitono*.'
    expect(sanitizeLlmReplyForCustomer(raw)).toBe(
      'Hola, no tenemos ese modelo en catálogo. Te puedo mostrar *bitono*.'
    )
  })
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    backpackProduct: {
      findMany: jest.fn()
    }
  }
}))

describe('fetchBackpackCatalogForLlm', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('solo consulta productos activos y con existencia', async () => {
    ;(prisma.backpackProduct.findMany as jest.Mock).mockResolvedValue([])

    await fetchBackpackCatalogForLlm()

    expect(prisma.backpackProduct.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        stock: { gt: 0 }
      },
      orderBy: { name: 'asc' }
    })
  })
})
