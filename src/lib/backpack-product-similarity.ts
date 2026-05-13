import type { BackpackProduct } from '@prisma/client'

type CatalogProduct = Pick<BackpackProduct, 'name' | 'description'>

export type ProductSimilarityMatch<T extends CatalogProduct> = {
  product: T
  score: number
  matchedBy: 'name' | 'description'
}

const DEFAULT_THRESHOLD = 0.8
const DEFAULT_LIMIT = 3

const GENERIC_TERMS = new Set([
  'mochila',
  'mochilas',
  'bolsa',
  'bolsas',
  'modelo',
  'modelos',
  'de',
  'del',
  'la',
  'el',
  'para',
  'con',
  'sin',
  'y',
  'o',
  'escolar',
  'escuela',
  'grande',
  'chica',
  'chico',
  'reforzada',
  'reforzado'
])

export function findSimilarBackpackProducts<T extends CatalogProduct>(
  llmText: string,
  products: T[],
  options: { threshold?: number; limit?: number } = {}
): ProductSimilarityMatch<T>[] {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const limit = options.limit ?? DEFAULT_LIMIT
  const normalizedText = normalizeCatalogText(llmText)
  if (!normalizedText) return []

  const byName = rankProductsByField(normalizedText, products, 'name', threshold, limit)
  if (byName.length > 0) return byName

  return rankProductsByField(normalizedText, products, 'description', threshold, limit)
}

export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rankProductsByField<T extends CatalogProduct>(
  normalizedText: string,
  products: T[],
  field: 'name' | 'description',
  threshold: number,
  limit: number
): ProductSimilarityMatch<T>[] {
  return products
    .map((product) => ({
      product,
      score: bestSimilarityForCatalogValue(normalizedText, product[field]),
      matchedBy: field
    }))
    .filter((match): match is ProductSimilarityMatch<T> => match.score >= threshold)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, limit)
}

function bestSimilarityForCatalogValue(normalizedText: string, catalogValue: string): number {
  const normalizedCatalogValue = normalizeCatalogText(catalogValue)
  if (!normalizedCatalogValue) return 0
  if (normalizedText.includes(normalizedCatalogValue)) return 1

  const distinctive = normalizedCatalogValue
    .split(' ')
    .filter((term) => !GENERIC_TERMS.has(term))
  if (
    distinctive.length > 0 &&
    distinctive.every((term) => normalizedText.includes(term))
  ) {
    return 0.95
  }
  if (distinctive.length > 0) {
    const textTokens = normalizedText.split(' ')
    const termScores = distinctive.map((term) =>
      Math.max(...textTokens.map((token) => similarityPercent(token, term)))
    )
    if (termScores.every((score) => score >= 0.8)) {
      return Math.min(0.94, average(termScores))
    }
  }

  const catalogTokens = normalizedCatalogValue.split(' ')
  const textTokens = normalizedText.split(' ')
  const windows = buildCandidateWindows(textTokens, catalogTokens.length)
  let best = similarityPercent(normalizedText, normalizedCatalogValue)
  for (const window of windows) {
    best = Math.max(best, similarityPercent(window, normalizedCatalogValue))
  }
  return best
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildCandidateWindows(tokens: string[], targetTokenCount: number): string[] {
  const windows = new Set<string>()
  const minSize = Math.max(1, targetTokenCount - 2)
  const maxSize = Math.min(tokens.length, targetTokenCount + 3)

  for (let size = minSize; size <= maxSize; size += 1) {
    for (let start = 0; start <= tokens.length - size; start += 1) {
      windows.add(tokens.slice(start, start + size).join(' '))
    }
  }

  return [...windows]
}

function similarityPercent(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0

  const distance = levenshteinDistance(a, b)
  return 1 - distance / Math.max(a.length, b.length)
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  let current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      )
    }
    ;[previous, current] = [current, previous]
  }

  return previous[b.length]
}
