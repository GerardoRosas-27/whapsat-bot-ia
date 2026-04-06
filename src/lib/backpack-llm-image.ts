import sharp from 'sharp'

/** Si la foto del cliente supera esto, se reescala (WebP) antes de enviar al LLM. */
const SHRINK_IF_LARGER_THAN = Math.max(
  200_000,
  (parseInt(process.env.BACKPACK_LLM_SHRINK_USER_IMAGE_BYTES || '450000', 10) || 450_000)
)

/**
 * Reduce peso de la imagen del usuario (WhatsApp suele mandar fotos muy grandes).
 * Evita timeouts y rechazos de LM Studio por body enorme.
 */
export async function shrinkUserImageForLlm(dataUrl: string): Promise<string> {
  const m = /^data:(image\/[\w+.-]+);base64,(.*)$/i.exec(dataUrl.trim())
  if (!m) return dataUrl
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length <= SHRINK_IF_LARGER_THAN) return dataUrl
  try {
    const out = await sharp(buf)
      .rotate()
      .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer()
    const shrunk = `data:image/webp;base64,${out.toString('base64')}`
    console.log(
      `[BackpackLLM] Imagen usuario: ${buf.length} → ${out.length} bytes (webp)`
    )
    return shrunk
  } catch (e) {
    console.warn('[BackpackLLM] No se pudo comprimir imagen del usuario:', e)
    return dataUrl
  }
}
