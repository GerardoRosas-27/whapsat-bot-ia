import { findSimilarBackpackProducts } from '@/lib/backpack-product-similarity'

const products = [
  {
    name: 'mochila de naruto',
    description: 'mochila para escuela de naruto grande'
  },
  {
    name: 'mochila de iroman',
    description: 'mochila para escuela de ironman grande reforzada'
  },
  {
    name: 'mochila de capitan america',
    description: 'mochila para escuela de capitan america grande'
  },
  {
    name: 'lona de candado',
    description: 'mochila grande de lona con candado para escuela reforzada'
  }
]

describe('findSimilarBackpackProducts', () => {
  it('encuentra modelos mencionados con palabras intermedias por nombre', () => {
    const matches = findSimilarBackpackProducts(
      'Sí, claro, manejamos mochila escolar de capitan america grande, mochila escolar de iroman grande reforzada y mochila de naruto grande.',
      products
    )

    expect(matches.map((match) => match.product.name)).toEqual([
      'mochila de naruto',
      'mochila de capitan america',
      'mochila de iroman'
    ])
    expect(matches.every((match) => match.score >= 0.8)).toBe(true)
    expect(matches.every((match) => match.matchedBy === 'name')).toBe(true)
  })

  it('encuentra tres modelos mencionados por el LLM en líneas separadas', () => {
    const matches = findSimilarBackpackProducts(
      `Sí, claro, este es el modelo que manejamos:
mochila escolar de capitan america grande
mochila escolar de iroman grande reforzada
mochila de naruto grande para escuela`,
      products
    )

    expect(matches.map((match) => match.product.name)).toEqual([
      'mochila de naruto',
      'mochila de capitan america',
      'mochila de iroman'
    ])
    expect(matches.map((match) => Math.round(match.score * 100))).toEqual([
      100,
      95,
      95
    ])
  })

  it('encuentra batman, capitan america e iroman en la respuesta exacta del LLM', () => {
    const matches = findSimilarBackpackProducts(
      `Hola, claro, estos son los modelos que manejamos:
mochila de batman grande
mochila escolar de capitan america grande
mochila escolar de iroman grande reforzada`,
      [
        ...products,
        {
          name: 'mochila de batman',
          description: 'mochila para escuela de batman grande'
        }
      ]
    )

    expect(matches.map((match) => match.product.name)).toEqual([
      'mochila de batman',
      'mochila de capitan america',
      'mochila de iroman'
    ])
    expect(matches.every((match) => match.score >= 0.8)).toBe(true)
  })

  it('tolera variaciones pequeñas entre ironman e iroman', () => {
    const matches = findSimilarBackpackProducts(
      'Hola tienes mochilas de personajes como de Ironman ?',
      products
    )

    expect(matches.map((match) => match.product.name)).toEqual([
      'mochila de iroman'
    ])
    expect(matches[0].score).toBeGreaterThanOrEqual(0.8)
  })

  it('no confunde batman con iroman cuando solo se menciona Batman', () => {
    const matches = findSimilarBackpackProducts(
      'Sí, tenemos la mochila de batman grande para escuela. ¿Te interesa esa o buscas algo más?',
      [
        ...products,
        {
          name: 'mochila de batman',
          description: 'mochila para escuela de batman grande'
        }
      ]
    )

    expect(matches.map((match) => match.product.name)).toEqual([
      'mochila de batman'
    ])
  })

  it('busca por descripción solo cuando no hay coincidencias por nombre', () => {
    const matches = findSimilarBackpackProducts(
      'Sí, tenemos una mochila grande de lona con candado para escuela reforzada.',
      [
        {
          name: 'modelo x1',
          description: 'mochila grande de lona con candado para escuela reforzada'
        }
      ]
    )

    expect(matches).toHaveLength(1)
    expect(matches[0].product.name).toBe('modelo x1')
    expect(matches[0].matchedBy).toBe('description')
  })

  it('encuentra modelos reforzados aunque la consulta sea corta', () => {
    const matches = findSimilarBackpackProducts('Y tienes mochilas reforzada?', products, {
      limit: 5
    })

    expect(matches.map((match) => match.product.name)).toEqual([
      'lona de candado',
      'mochila de iroman'
    ])
    expect(matches.every((match) => match.matchedBy === 'description')).toBe(true)
  })

  it('encuentra mochilas escolares para mujer por género y uso', () => {
    const matches = findSimilarBackpackProducts(
      'Mochilas escolar para mujer cuáles tienes',
      [
        {
          name: 'bitono',
          description: 'mochila chica escolar y de trabajo reforzada',
          gender: 'man',
          useType: 'work'
        },
        {
          name: 'gatito impermeable',
          description: 'mochila de gatito impermeable kawai para escuela',
          gender: 'woman',
          useType: 'school'
        },
        {
          name: 'oxfort grande',
          description: 'mochila de mujer grande con monedero, para escuela reforzada',
          gender: 'woman',
          useType: 'school'
        },
        {
          name: 'oxfort impermeable',
          description: 'mochila impermeable para escuela con diseño kawait',
          gender: 'woman',
          useType: 'school'
        }
      ]
    )

    expect(matches.map((match) => match.product.name)).toEqual([
      'oxfort grande',
      'gatito impermeable',
      'oxfort impermeable'
    ])
    expect(matches.every((match) => match.matchedBy === 'description')).toBe(true)
  })
})
