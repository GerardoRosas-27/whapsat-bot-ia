'use client'

import { useEffect, useState } from 'react'

export default function BackpackCompanyDataManager() {
  const [rulesForBot, setRulesForBot] = useState('')
  const [interactionWorkflow, setInteractionWorkflow] = useState('')
  const [customerFacts, setCustomerFacts] = useState('')
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
      setInteractionWorkflow(data.interactionWorkflow ?? '')
      setCustomerFacts(data.customerFacts ?? '')
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
          interactionWorkflow,
          customerFacts
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Error al guardar' })
        return
      }
      setRulesForBot(data.rulesForBot ?? '')
      setInteractionWorkflow(data.interactionWorkflow ?? '')
      setCustomerFacts(data.customerFacts ?? '')
      if (data.updatedAt) setUpdatedAt(data.updatedAt)
      setMessage({ type: 'ok', text: 'Datos de empresa guardados correctamente.' })
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <p style={{ margin: 0, color: '#64748b' }}>Cargando datos de empresa...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>
        Datos de empresa para el bot
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
        Esta información se guarda en la base de datos y el LLM local la usa como fuente oficial para horarios, ubicación, envíos, mayoreo, pagos, contacto y políticas.
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
        Información oficial de la empresa
      </label>
      <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#94a3b8' }}>
        Escribe solo datos confirmados. Si un dato no está aquí, el bot contestará que no lo tiene confirmado.
      </p>
      <textarea
        value={customerFacts}
        onChange={(e) => setCustomerFacts(e.target.value)}
        rows={14}
        placeholder={`Ejemplo:\nHorario: lunes a domingo de 10:30 a 19:30.\nUbicación: ...\nEnvíos: solo por mayoreo.\nPagos: efectivo y transferencia.\nPolíticas: ...`}
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
          {saving ? 'Guardando...' : 'Guardar datos'}
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
