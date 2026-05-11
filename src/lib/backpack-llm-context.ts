import fs from 'fs'
import path from 'path'
import type { BackpackProduct } from '@prisma/client'
import type {
  LlmImagePart,
  LlmTextPart,
  LlmUserContent
} from './backpack-lm-studio'
import { prisma } from './prisma'

/** Máximo de fotos del catálogo por petición con visión (default más bajo = menos errores por body enorme). */
export const MAX_CATALOG_IMAGES_FOR_VISION = Math.min(
  20,
  Math.max(
    1,
    parseInt(process.env.BACKPACK_LLM_MAX_CATALOG_IMAGES || '6', 10) || 6
  )
)

export const DEFAULT_BACKPACK_WORKFLOW = `## Flujo general (respuestas humanas y breves)
1. **Tono**: Hablas como quien atiende la tienda por WhatsApp: primera persona del plural (*tenemos*, *te puedo comentar*, *nos encontramos en…*). Nunca hables de ti en tercera persona ni digas "el asistente", "el bot" ni "debo analizar".
2. **Extensión**: Prioriza 2–6 líneas. Lista productos en formato compacto si hay varios.
3. **Saludo**: Si hace falta, saluda y pregunta qué modelo, uso o característica busca.
4. **Búsqueda**: Solo artículos del catálogo; precio y stock exactos.
5. **Foto**: Si manda imagen, compárala con las referencias visuales y con la lista de modelos que tienen foto. Si es la misma mochila o diseño equivalente a un producto del catálogo, confírmalo con *nombre exacto*, precio y stock. No digas que "no está" si hay coincidencia o similitud clara con una referencia o con un modelo que tiene foto en la lista.
6. **Tienda**: Horarios y dirección solo según la información oficial del prompt.
7. **Límites**: No inventes modelos. Si no hay match, dilo en una frase y ofrece alternativas reales.`

export async function fetchBackpackCatalogForLlm(): Promise<BackpackProduct[]> {
  return prisma.backpackProduct.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  })
}

export function formatCatalogForPrompt(products: BackpackProduct[]): string {
  if (products.length === 0) {
    return '(No hay productos activos en la base de datos.)'
  }
  return products
    .map((p, i) => {
      const img = p.imageUrl?.trim()
        ? ` | imagen:${p.imageUrl.trim()}`
        : ' | sin imagen en catálogo'
      return `${i + 1}. [id:${p.id}] *${p.name}* | género:${p.gender} | uso:${p.useType} | ${formatPrice(p.price)} | stock:${p.stock}${img}\n   ${p.description}`
    })
    .join('\n')
}

function formatPrice(price: number): string {
  return `$${Number(price).toFixed(2)}`
}

export function tryReadPublicImageAsDataUrl(
  relativePath: string | null | undefined
): string | null {
  if (!relativePath?.trim()) return null
  let rel = relativePath.trim()
  if (!rel.startsWith('/')) rel = `/${rel}`
  if (rel.includes('..') || rel.includes('\0')) return null
  const disk = path.join(process.cwd(), 'public', rel.replace(/^\//, ''))
  if (!fs.existsSync(disk)) return null
  const buf = fs.readFileSync(disk)
  const ext = path.extname(disk).toLowerCase()
  const mime =
    ext === '.webp'
      ? 'image/webp'
      : ext === '.png'
        ? 'image/png'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

export function pickCatalogReferenceImages(
  products: BackpackProduct[],
  maxImages: number = MAX_CATALOG_IMAGES_FOR_VISION
): { label: string; dataUrl: string; productId: string }[] {
  const cap = Math.max(0, Math.min(maxImages, MAX_CATALOG_IMAGES_FOR_VISION))
  return getCatalogReferenceImages(products).slice(0, cap)
}

export function getCatalogReferenceImages(
  products: BackpackProduct[]
): { label: string; dataUrl: string; productId: string }[] {
  const withPath = products.filter((p) => p.imageUrl?.trim())
  const out: { label: string; dataUrl: string; productId: string }[] = []
  for (const p of withPath) {
    const dataUrl = tryReadPublicImageAsDataUrl(p.imageUrl)
    if (!dataUrl) continue
    out.push({
      label: `${p.name} [id:${p.id}]`,
      dataUrl,
      productId: p.id
    })
  }
  return out
}

/** Lista compacta de productos que tienen URL de imagen (aunque no todas las fotos vayan en el mensaje). */
export function formatProductsWithPhotosForVision(products: BackpackProduct[]): string {
  const rows = products
    .filter((p) => p.isActive && p.imageUrl?.trim())
    .map(
      (p) =>
        `• *${p.name}* [id:${p.id}] — ${formatPrice(p.price)} — stock:${p.stock}`
    )
  return rows.length > 0
    ? rows.join('\n')
    : '(Ningún producto activo tiene imagen en el sistema.)'
}

/** Respuesta que niega match en catálogo (para decidir un segundo vistazo al modelo). */
export function looksLikeDeniedCatalogVisualMatch(reply: string): boolean {
  const t = reply.toLowerCase()
  const phrases = [
    'no está en el catálogo',
    'no consta en el catálogo',
    'no consta en catalogo',
    'no encontré',
    'no encontramos',
    'no la tenemos',
    'no lo tenemos',
    'no tenemos ese',
    'no tenemos esa',
    'no coincide con',
    'ninguna de las',
    'ninguno de los',
    'no figura',
    'ese diseño no',
    'ese modelo no',
    'no aparece en',
    'no está disponible ese diseño',
    'no hay coincidencia'
  ]
  return phrases.some((p) => t.includes(p))
}

export function replyMentionsAnyProductName(
  reply: string,
  products: BackpackProduct[]
): boolean {
  const t = reply.toLowerCase()
  return products.some((p) => {
    const n = p.name.trim()
    return n.length >= 3 && t.includes(n.toLowerCase())
  })
}

export function buildBackpackSystemPrompt(parts: {
  workflow: string
  rulesForBot: string
  customerFacts: string
  catalogText: string
  /** Contexto extra cuando el cliente mandó foto (reduce falsos "no está"). */
  visionComparison?: {
    attachedReferenceLabels: string[]
    allWithPhotoSummary: string
  }
}): string {
  const workflow = parts.workflow.trim() || DEFAULT_BACKPACK_WORKFLOW
  const visionBlock =
    parts.visionComparison &&
    parts.visionComparison.allWithPhotoSummary.trim().length > 0
      ? `

## Comparación visual (este turno el cliente mandó foto)
- La primera imagen del usuario (tras el texto) es su foto. Las bloques "Catálogo: …" que siguen son fotos **reales** de productos en existencias.
- **Obligatorio**: si la mochila de la foto del cliente es la misma o *muy parecida* a alguna imagen de referencia, responde confirmando con el **nombre exacto** del listado y el **stock/precio** del catálogo en texto. No digas que no está si hay similitud clara.
- **Lista de modelos que tienen foto en el sistema** (puede haber más de los que caben en el mensaje; úsala si la foto coincide con alguno aunque no veas su imagen adjunta):
${parts.visionComparison.allWithPhotoSummary}
- Referencias **adjuntas en este mensaje** (cada una va seguida de su imagen): ${parts.visionComparison.attachedReferenceLabels.length > 0 ? parts.visionComparison.attachedReferenceLabels.join(' | ') : '(ninguna por límite de tamaño; usa la lista anterior y el catálogo en texto).'}
`
      : ''

  return `Respondes WhatsApp de una tienda de mochilas escolares como una persona de mostrador.
Tu salida debe ser ÚNICAMENTE el mensaje final que verá el cliente.
No escribas análisis, planes, instrucciones, intención del cliente ni razonamiento.
No digas que eres bot, IA, vendedor, asistente ni "soy de la tienda".
No uses frases como "el usuario quiere", "el cliente pregunta", "debo responder", "mi objetivo" o "respuesta a generar".

## Formato de salida (obligatorio)
- Devuelve ÚNICAMENTE el mensaje que verá el cliente en WhatsApp.
- PROHIBIDO: razonamiento interno, borradores, pasos de análisis, etiquetas de pensamiento (thinking, redacted, reasoning) o texto meta en inglés.
- PROHIBIDO: razonamiento interno en español, por ejemplo "el usuario quiere saber", "debo responder", "mi objetivo" o "respuesta a generar".
- PROHIBIDO escribir en inglés frases tipo "Got it", "Let's see", "I need to", "The client sent", "Looking at the photo", "The catalog has" — eso es razonamiento que el cliente no debe ver.
- PROHIBIDO hablar en tercera persona sobre ti mismo ("el asistente debe…", "primero verifico…", "analizando el catálogo…").
- Nada de monólogos: solo lo que escribiría una persona al cliente.

## Estilo
- Español (México), natural: *tenemos*, *te la dejo en*, *pásate*, *cualquier cosa me escribes*.
- Corto: idealmente menos de 120 palabras salvo que pidan mucho detalle.
- Negritas WhatsApp: *así*, sin asteriscos duplicados ni anidados.
- Si preguntan por productos disponibles: "Sí, claro, estos son los modelos que manejamos:" y lista productos reales.

## Flujo de trabajo del negocio
${workflow}

## Reglas internas (cumplir siempre)
${parts.rulesForBot.trim() || '(No hay reglas adicionales configuradas en base de datos.)'}

## Información oficial del negocio (horarios, ubicación, envíos, políticas)
Úsala para apertura/cierre/ubicación. No inventes datos fuera de este bloque ni del catálogo.
${parts.customerFacts.trim() || '(Sin datos oficiales cargados: indica que no tienes ese dato confirmado y que pueden contactar al negocio para datos de tienda.)'}

## Catálogo (única fuente de productos, precios y existencias)
${parts.catalogText}

## Imágenes en este turno
- Si hay foto del cliente: la primera imagen tras el texto introductorio es la suya; las siguientes son referencias del catálogo.
- Compara con brevedad; si identificas un modelo, cita nombre exacto, precio, stock y si está en existencia según el stock.${visionBlock}`
}

/**
 * Quita razonamiento filtrado y deja solo la parte útil para el cliente.
 */
export function sanitizeLlmReplyForCustomer(text: string): string {
  let t = text.trim()
  const closingTags = [
    '</think>',
    '</thinking>',
    '</reasoning>',
    '</redacted_thinking>'
  ]
  for (const close of closingTags) {
    const lower = t.toLowerCase()
    const c = close.toLowerCase()
    if (lower.includes(c)) {
      const idx = lower.lastIndexOf(c)
      const after = t.slice(idx + close.length).trim()
      if (after.length >= 3) {
        t = after
        break
      }
    }
  }
  const blocks: RegExp[] = [
    /<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi,
    /<thinking>[\s\S]*?<\/thinking>/gi,
    /<reasoning>[\s\S]*?<\/reasoning>/gi
  ]
  for (const re of blocks) {
    t = t.replace(re, '').trim()
  }
  t = t
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?thinking>/gi, '')
    .replace(/<\/?reasoning>/gi, '')
    .replace(/<\/?redacted_thinking>/gi, '')
    .trim()
  t = stripLeadingEnglishReasoningBlocks(t)
  if (!t) {
    return 'Disculpa, no pude preparar la respuesta. ¿Me escribes de nuevo?'
  }
  return t
}

function spanishMarkCount(s: string): number {
  return (s.match(/[áéíóúñ¿¡ü]/gi) ?? []).length
}

/**
 * Algunos modelos (p. ej. con chain-of-thought) devuelven un monólogo en inglés antes del mensaje real.
 * Quita párrafos iniciales que parecen ese análisis interno.
 */
function stripLeadingEnglishReasoningBlocks(text: string): string {
  const raw = text.trim()
  const parts = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return raw
  }

  let i = 0
  while (i < parts.length && looksLikeEnglishReasoningParagraph(parts[i])) {
    i += 1
  }
  if (i === 0) {
    const fromSentences = stripEnglishCoTFromSingleBlock(raw)
    return fromSentences.length > 0 ? fromSentences : raw
  }
  const tail = parts.slice(i).join('\n\n').trim()
  if (tail.length > 0) {
    return tail
  }
  const fromSentences = stripEnglishCoTFromSingleBlock(raw)
  if (fromSentences.length > 0) {
    return fromSentences
  }
  return salvageSpanishTailAfterEnglishCoT(raw)
}

/** Un solo párrafo mezclando CoT en inglés y respuesta: quita oraciones iniciales de razonamiento. */
function stripEnglishCoTFromSingleBlock(block: string): string {
  const sentences = block
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (sentences.length === 0) {
    return ''
  }
  if (!looksLikeEnglishReasoningParagraph(block) && !looksLikeEnglishReasoningSentence(sentences[0])) {
    return block.trim()
  }
  let j = 0
  while (j < sentences.length && looksLikeEnglishReasoningSentence(sentences[j])) {
    j += 1
  }
  const out = sentences.slice(j).join(' ').trim()
  return out.length >= 12 ? out : ''
}

function looksLikeEnglishReasoningSentence(s: string): boolean {
  const t = s.trim()
  if (/^(got it|okay|ok)\b/i.test(t) && t.length < 120) {
    return true
  }
  if (/^let'?s see\b/i.test(t) && t.length < 100) {
    return true
  }
  if (/^(the client sent|the user sent|the catalog(ue)? has|so the response should|looking at the photo)\b/i.test(t)) {
    return true
  }
  if (t.length < 22) {
    return false
  }
  return looksLikeEnglishReasoningParagraph(t)
}

/** Si todo el mensaje era un solo bloque CoT en inglés + cierre en español, recorta desde ahí. */
function salvageSpanishTailAfterEnglishCoT(text: string): string {
  const marks = spanishMarkCount(text)
  if (marks < 2) {
    return ''
  }
  const spanishLead =
    /\b(?:Hola|Tenemos|Claro|Sí[,.\s]|No tenemos|Te comento|En el catálogo|La mochila|Esta es|Te la)\b/i
  const m = text.match(spanishLead)
  let cut = m?.index != null && m.index > 50 ? m.index : -1
  if (cut < 0) {
    const idxPunct = text.search(/[¿¡]/)
    if (idxPunct >= 50) {
      cut = idxPunct
    }
  }
  if (cut < 0) {
    return ''
  }
  const tail = text.slice(cut).trim()
  return tail.length >= 15 ? tail : ''
}

function looksLikeEnglishReasoningParagraph(block: string): boolean {
  const b = block.trim()
  if (b.length < 50) {
    return false
  }
  const marks = spanishMarkCount(b)
  if (marks >= 3) {
    return false
  }
  if (
    /\b(tenemos|mochila|precio|stock|hola|gracias|catálogo|disponible|escríb|pásate|pasate|cualquier cosa)\b/i.test(
      b
    ) &&
    marks >= 1
  ) {
    return false
  }

  const opensLikeCoT =
    /^(got it[, ]|okay, let'?s|let'?s see|let me |i need to |first, the |first, t|wait,|so i need|the client sent|the user sent|looking at (the |your )|now, check if|i'll |we need to|the key is that|also, check|so the response should)/i.test(
      b
    )
  const longEnglishAnalysis =
    b.length > 120 &&
    marks < 2 &&
    /\b(the client|the user|the catalog(ue)?|reference images?|need to (inform|compare|check|tell)|should (say|respond)|doesn'?t match|do not match|step \d|inner monologue)\b/i.test(
      b
    )

  return opensLikeCoT || longEnglishAnalysis
}

export function buildBackpackUserPayload(params: {
  userText: string
  userImageDataUrl?: string | null
  catalogReferenceImages: { label: string; dataUrl: string }[]
}): LlmUserContent {
  const text =
    params.userText.trim() || '(El usuario solo envió imagen, sin texto.)'

  const blocks: (LlmTextPart | LlmImagePart)[] = []

  const refList =
    params.catalogReferenceImages.length > 0
      ? params.catalogReferenceImages
          .map((r, i) => `${i + 1}) ${r.label}`)
          .join('\n')
      : null

  blocks.push({
    type: 'text',
    text:
      `Cliente:\n${text}\n\n` +
      (params.userImageDataUrl ? 'Siguiente bloque: foto del cliente.\n' : '') +
      (refList
        ? `Referencias de catálogo (cada ítem tiene su imagen justo después en el mensaje):\n${refList}\n`
        : 'Sin fotos de catálogo en este mensaje; usa el listado del system prompt y la lista de modelos con foto.\n') +
      'Responde solo con el texto para WhatsApp, sin preámbulos ni razonamiento.'
  })

  /** Algunos servidores rechazan el campo `detail`; solo se envía si pones BACKPACK_LLM_IMAGE_DETAIL=low */
  const imgDetail =
    process.env.BACKPACK_LLM_IMAGE_DETAIL === 'low'
      ? ('low' as const)
      : undefined

  if (params.userImageDataUrl) {
    blocks.push({
      type: 'image_url',
      image_url: imgDetail
        ? { url: params.userImageDataUrl, detail: imgDetail }
        : { url: params.userImageDataUrl }
    })
  }

  for (const ref of params.catalogReferenceImages) {
    blocks.push({
      type: 'text',
      text: `--- Catálogo: ${ref.label} ---`
    })
    blocks.push({
      type: 'image_url',
      image_url: imgDetail
        ? { url: ref.dataUrl, detail: imgDetail }
        : { url: ref.dataUrl }
    })
  }

  return blocks
}
