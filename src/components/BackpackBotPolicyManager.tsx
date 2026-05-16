'use client'

import { useEffect, useState } from 'react'

export default function BackpackBotPolicyManager() {
  const [rulesForBot, setRulesForBot] = useState('')
  const [customerFacts, setCustomerFacts] = useState('')
  const [interactionWorkflow, setInteractionWorkflow] = useState('')
  const [flowClassifierSystemPrompt, setFlowClassifierSystemPrompt] = useState('')
  const [flowClassifierInputFormat, setFlowClassifierInputFormat] = useState('')
  const [flowClassifierOutputFormat, setFlowClassifierOutputFormat] = useState('')
  const [searchLlmSystemPrompt, setSearchLlmSystemPrompt] = useState('')
  const [searchLlmInputFormat, setSearchLlmInputFormat] = useState('')
  const [searchLlmOutputFormat, setSearchLlmOutputFormat] = useState('')
  const [filterLlmSystemPrompt, setFilterLlmSystemPrompt] = useState('')
  const [filterLlmInputFormat, setFilterLlmInputFormat] = useState('')
  const [filterLlmOutputFormat, setFilterLlmOutputFormat] = useState('')
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
      setFlowClassifierSystemPrompt(data.flowClassifierSystemPrompt ?? '')
      setFlowClassifierInputFormat(data.flowClassifierInputFormat ?? '')
      setFlowClassifierOutputFormat(data.flowClassifierOutputFormat ?? '')
      setSearchLlmSystemPrompt(data.searchLlmSystemPrompt ?? '')
      setSearchLlmInputFormat(data.searchLlmInputFormat ?? '')
      setSearchLlmOutputFormat(data.searchLlmOutputFormat ?? '')
      setFilterLlmSystemPrompt(data.filterLlmSystemPrompt ?? '')
      setFilterLlmInputFormat(data.filterLlmInputFormat ?? '')
      setFilterLlmOutputFormat(data.filterLlmOutputFormat ?? '')
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
          interactionWorkflow,
          flowClassifierSystemPrompt,
          flowClassifierInputFormat,
          flowClassifierOutputFormat,
          searchLlmSystemPrompt,
          searchLlmInputFormat,
          searchLlmOutputFormat,
          filterLlmSystemPrompt,
          filterLlmInputFormat,
          filterLlmOutputFormat
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
      setFlowClassifierSystemPrompt(data.flowClassifierSystemPrompt ?? '')
      setFlowClassifierInputFormat(data.flowClassifierInputFormat ?? '')
      setFlowClassifierOutputFormat(data.flowClassifierOutputFormat ?? '')
      setSearchLlmSystemPrompt(data.searchLlmSystemPrompt ?? '')
      setSearchLlmInputFormat(data.searchLlmInputFormat ?? '')
      setSearchLlmOutputFormat(data.searchLlmOutputFormat ?? '')
      setFilterLlmSystemPrompt(data.filterLlmSystemPrompt ?? '')
      setFilterLlmInputFormat(data.filterLlmInputFormat ?? '')
      setFilterLlmOutputFormat(data.filterLlmOutputFormat ?? '')
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
        Instrucciones del bot
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
        El bot de mochilas contesta por defecto con el modelo local. Estas instrucciones se combinan con el archivo de contexto, los datos de empresa y el catálogo guardado en base de datos.
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
        Describe prioridades de respuesta. Evita menús públicos: el modelo debe contestar directo usando catálogo y datos oficiales.
      </p>
      <textarea
        value={interactionWorkflow}
        onChange={(e) => setInteractionWorkflow(e.target.value)}
        rows={10}
        placeholder="Ej.: 1) Saludar cordialmente. 2) Buscar primero en la base de datos. 3) Responder con datos confirmados del producto. 4) Si no existe, decirlo sin inventar."
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
        Límites, tono y reglas para no inventar información. Se inyectan en el system prompt del LLM local.
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

      {[
        {
          title: 'LLM 1 - Análisis de flujo',
          fields: [
            ['System prompt', flowClassifierSystemPrompt, setFlowClassifierSystemPrompt],
            ['Formato de entrada JSON', flowClassifierInputFormat, setFlowClassifierInputFormat],
            ['Formato de salida JSON', flowClassifierOutputFormat, setFlowClassifierOutputFormat]
          ] as const
        },
        {
          title: 'LLM 2 - Búsqueda con contexto del flujo',
          fields: [
            ['System prompt', searchLlmSystemPrompt, setSearchLlmSystemPrompt],
            ['Formato de entrada JSON', searchLlmInputFormat, setSearchLlmInputFormat],
            ['Formato de salida JSON', searchLlmOutputFormat, setSearchLlmOutputFormat]
          ] as const
        },
        {
          title: 'LLM 3 - Filtro final para WhatsApp',
          fields: [
            ['System prompt', filterLlmSystemPrompt, setFilterLlmSystemPrompt],
            ['Formato de entrada', filterLlmInputFormat, setFilterLlmInputFormat],
            ['Formato de salida final', filterLlmOutputFormat, setFilterLlmOutputFormat]
          ] as const
        }
      ].map((section) => (
        <div key={section.title} style={{ marginBottom: '20px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: '#0f172a' }}>{section.title}</h3>
          {section.fields.map(([label, value, setter]) => (
            <label key={label} style={{ display: 'block', marginBottom: '12px', fontWeight: 600, fontSize: '14px', color: '#334155' }}>
              {label}
              <textarea
                value={value}
                onChange={(e) => setter(e.target.value)}
                rows={label.includes('System') ? 8 : 5}
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
                  marginTop: '8px',
                  resize: 'vertical'
                }}
              />
            </label>
          ))}
        </div>
      ))}

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
