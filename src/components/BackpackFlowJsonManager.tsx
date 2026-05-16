'use client'

import { useEffect, useState } from 'react'

const DEFAULT_INPUT_FORMAT = `{
  "historial_ultimos_5_mensajes": [
    { "role": "user", "content": "mensaje previo" },
    { "role": "assistant", "content": "respuesta previa" }
  ],
  "mensaje_actual": "texto actual del cliente",
  "flujos_disponibles": [
    "consulta_ubicacion",
    "consulta_horarios",
    "consulta_politicas",
    "consulta_productos",
    "fuera_de_alcance"
  ]
}`

const DEFAULT_OUTPUT_FORMAT = `{
  "flujo": "consulta_productos",
  "descripcion": "Resumen sintetizado y procesado por el LLM de lo que quiere el usuario, considerando el mensaje actual y los últimos 5 mensajes del historial. No inventes datos."
}`

const DEFAULT_SYSTEM_PROMPT = `Eres un clasificador interno y vendedor experto de mochilas escolares, de preescolar y para trabajo.
Conoces mochilas reforzadas de diferentes materiales y telas: mezclilla, lona, poliéster, impermeables, con candado, para laptop y de uso diario.
También conoces mochilas de personajes populares y actuales para escuela y preescolar: Stitch, Sonic, Mario, Kuromi, Dragon Ball, Goku, Naruto, caricaturas, dibujos y anime.
También conoces mochilas de marcas deportivas o estilo deportivo como Nike, Adidas y Puma.
Tu respuesta NO se enviará al cliente. Solo decide qué flujo debe activarse.

Flujos permitidos:
- consulta_ubicacion: dirección, Google Maps, croquis, cómo llegar.
- consulta_horarios: apertura, cierre, días u horario.
- consulta_politicas: envíos, entregas, mayoreo, menudeo, pagos, políticas.
- consulta_productos: catálogo, modelos, precios, stock, fotos o características de mochilas.
- fuera_de_alcance: cualquier tema que no sea tienda, mochilas, ubicación, horarios o políticas.

Reglas:
1. Usa los últimos 5 mensajes para entender referencias como "ese", "la negra", "lo de ayer" o respuestas cortas del usuario.
2. Si el cliente menciona personajes, caricaturas, dibujos, anime, preescolar, kinder, niñas/niños, marcas deportivas o materiales de mochila, clasifica como consulta_productos.
3. En "descripcion" conserva palabras clave de búsqueda: personaje, personajes, Stitch, Sonic, Mario, Kuromi, Dragon Ball, Goku, Naruto, anime, caricatura, dibujo, preescolar, kinder, Nike, Adidas, Puma, reforzada, reforzado, mezclilla, lona, poliéster, impermeable, candado, laptop, escolar, trabajo, colores, tamaño, uso y género.
4. Sintetiza, pero no borres atributos importantes. Ejemplos: "Que modelos de personajes tienes?" -> "busca mochilas de personajes"; "Y tienes mochilas reforzada?" -> "busca mochilas reforzadas"; "tienes para preescolar de sonic?" -> "busca mochila preescolar de Sonic".
5. Si el cliente pregunta algo ambiguo pero parece relacionado con mochilas, usa consulta_productos y pide que la descripcion conserve la duda principal para que el siguiente LLM pueda pedir detalles.
6. Si no puedes determinar que el cliente pide ubicación, horarios, políticas o productos de mochilas, usa fuera_de_alcance.
7. No inventes marcas, modelos, precios ni datos que el usuario no haya pedido.`

function validateJsonExample(value: string, label: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    JSON.parse(trimmed)
    return null
  } catch {
    return `${label} debe ser JSON válido o quedar vacío para usar el formato por defecto.`
  }
}

export default function BackpackFlowJsonManager() {
  const [flowClassifierSystemPrompt, setFlowClassifierSystemPrompt] = useState('')
  const [flowClassifierInputFormat, setFlowClassifierInputFormat] = useState('')
  const [flowClassifierOutputFormat, setFlowClassifierOutputFormat] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/backpack-bot/policy', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Error al cargar' })
        return
      }
      setFlowClassifierSystemPrompt(data.flowClassifierSystemPrompt ?? DEFAULT_SYSTEM_PROMPT)
      setFlowClassifierInputFormat(data.flowClassifierInputFormat ?? DEFAULT_INPUT_FORMAT)
      setFlowClassifierOutputFormat(data.flowClassifierOutputFormat ?? DEFAULT_OUTPUT_FORMAT)
      if (data.updatedAt) setUpdatedAt(data.updatedAt)
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    const inputError = validateJsonExample(flowClassifierInputFormat, 'El formato de entrada')
    const outputError = validateJsonExample(flowClassifierOutputFormat, 'El formato de salida')
    if (inputError || outputError) {
      setMessage({ type: 'err', text: inputError || outputError || 'JSON inválido' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/backpack-bot/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          flowClassifierSystemPrompt,
          flowClassifierInputFormat,
          flowClassifierOutputFormat
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Error al guardar' })
        return
      }
      setFlowClassifierSystemPrompt(data.flowClassifierSystemPrompt ?? DEFAULT_SYSTEM_PROMPT)
      setFlowClassifierInputFormat(data.flowClassifierInputFormat ?? DEFAULT_INPUT_FORMAT)
      setFlowClassifierOutputFormat(data.flowClassifierOutputFormat ?? DEFAULT_OUTPUT_FORMAT)
      if (data.updatedAt) setUpdatedAt(data.updatedAt)
      setMessage({ type: 'ok', text: 'Formatos JSON guardados correctamente.' })
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <p style={{ margin: 0, color: '#64748b' }}>Cargando formatos JSON...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>
        JSON del clasificador de flujo
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
        Esta configuración solo guía la llamada interna de análisis. Ese LLM recibe los últimos 5 mensajes y el mensaje actual, pero no recibe catálogo ni datos completos de empresa.
      </p>

      {message && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '14px',
            background: message.type === 'ok' ? '#ecfdf5' : '#fef2f2',
            color: message.type === 'ok' ? '#047857' : '#b91c1c'
          }}
        >
          {message.text}
        </div>
      )}

      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#334155' }}>
        System prompt del LLM de análisis
      </label>
      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#94a3b8' }}>
        Reglas internas para clasificar el flujo y sintetizar la descripcion sin perder palabras clave de búsqueda.
      </p>
      <textarea
        value={flowClassifierSystemPrompt}
        onChange={(e) => setFlowClassifierSystemPrompt(e.target.value)}
        rows={16}
        spellCheck={false}
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          fontSize: '13px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          marginBottom: '20px',
          resize: 'vertical'
        }}
      />

      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#334155' }}>
        Formato JSON de entrada al LLM de análisis
      </label>
      <textarea
        value={flowClassifierInputFormat}
        onChange={(e) => setFlowClassifierInputFormat(e.target.value)}
        rows={14}
        spellCheck={false}
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          fontSize: '13px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          marginBottom: '20px',
          resize: 'vertical'
        }}
      />

      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#334155' }}>
        Formato JSON esperado de salida
      </label>
      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#94a3b8' }}>
        El campo <code>flujo</code> debe ser uno de: consulta_ubicacion, consulta_horarios, consulta_politicas, consulta_productos o fuera_de_alcance. El campo <code>descripcion</code> debe resumir lo que quiere el usuario ya procesado para el siguiente LLM.
      </p>
      <textarea
        value={flowClassifierOutputFormat}
        onChange={(e) => setFlowClassifierOutputFormat(e.target.value)}
        rows={14}
        spellCheck={false}
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          fontSize: '13px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          marginBottom: '20px',
          resize: 'vertical'
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: '10px 22px',
            background: saving ? '#94a3b8' : '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {saving ? 'Guardando...' : 'Guardar formatos'}
        </button>
        {updatedAt && (
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            Ultima actualización: {new Date(updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
