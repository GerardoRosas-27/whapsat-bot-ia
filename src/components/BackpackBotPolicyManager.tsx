'use client'

import { useEffect, useState } from 'react'

export default function BackpackBotPolicyManager() {
  const [rulesForBot, setRulesForBot] = useState('')
  const [customerFacts, setCustomerFacts] = useState('')
  const [interactionWorkflow, setInteractionWorkflow] = useState('')
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
      setRulesForBot(data.rulesForBot ?? '')
      setCustomerFacts(data.customerFacts ?? '')
      setInteractionWorkflow(data.interactionWorkflow ?? '')
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
          rulesForBot,
          customerFacts,
          interactionWorkflow
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Error al guardar' })
        return
      }
      setRulesForBot(data.rulesForBot ?? '')
      setCustomerFacts(data.customerFacts ?? '')
      setInteractionWorkflow(data.interactionWorkflow ?? '')
      if (data.updatedAt) setUpdatedAt(data.updatedAt)
      setMessage({ type: 'ok', text: 'Guardado correctamente.' })
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <p style={{ margin: 0, color: '#64748b' }}>Cargando reglas e información…</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>
        Reglas e información del bot
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
        Con <strong>BACKPACK_LLM_ENABLED=true</strong> y LM Studio en <code style={{ fontSize: '13px' }}>LM_STUDIO_BASE_URL</code>, el bot usa un modelo local (p. ej. con visión) y arma el <em>system prompt</em> con reglas, información oficial, flujo y catálogo desde esta pantalla.
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
        Flujo de trabajo (guardado en base de datos)
      </label>
      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#94a3b8' }}>
        Describe cómo debe interactuar el asistente (pasos, prioridades). Si lo dejas vacío, se usa un flujo por defecto en el código.
      </p>
      <textarea
        value={interactionWorkflow}
        onChange={(e) => setInteractionWorkflow(e.target.value)}
        rows={10}
        placeholder="Ej.: 1) Saludar y ofrecer menú 1-7 o búsqueda por texto. 2) Con foto, comparar con catálogo..."
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          fontSize: '14px',
          fontFamily: 'inherit',
          marginBottom: '20px',
          resize: 'vertical'
        }}
      />

      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#334155' }}>
        Reglas / instrucciones para el bot (system prompt)
      </label>
      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#94a3b8' }}>
        Límites, tono, qué no inventar. Con LLM activo se inyecta en el system prompt.
      </p>
      <textarea
        value={rulesForBot}
        onChange={(e) => setRulesForBot(e.target.value)}
        rows={8}
        placeholder={`Ejemplo:\n- Solo informar productos que existan en el catálogo publicado.\n- No prometer fechas de envío sin confirmar.\n- Si preguntan por menudeo, aclarar que solo hay envíos por mayoreo.`}
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          fontSize: '14px',
          fontFamily: 'inherit',
          marginBottom: '20px',
          resize: 'vertical'
        }}
      />

      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#334155' }}>
        Información oficial para el cliente (system prompt)
      </label>
      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#94a3b8' }}>
        Horarios, ubicación, envíos, políticas. Con LLM, el modelo usa esto para apertura/cierre/ubicación; sin LLM sigue el atajo por palabras clave + *info*.
      </p>
      <textarea
        value={customerFacts}
        onChange={(e) => setCustomerFacts(e.target.value)}
        rows={10}
        placeholder={`Ejemplo:\nAbrimos de 10:30 a 19:30 todos los días.\nHacemos envíos solo por mayoreo.\nNo tenemos otros modelos: solo los publicados en el catálogo.`}
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          fontSize: '14px',
          fontFamily: 'inherit',
          marginBottom: '16px',
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
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {updatedAt && (
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            Última actualización: {new Date(updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
