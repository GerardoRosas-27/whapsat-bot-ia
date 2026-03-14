'use client'

import { useEffect, useState } from 'react'

interface BotResponse {
  id: string
  trigger: string
  response: string
  responseType: string
  priority: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function BotResponsesManager() {
  const [responses, setResponses] = useState<BotResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingResponse, setEditingResponse] = useState<BotResponse | null>(null)
  const [formData, setFormData] = useState({
    trigger: '',
    response: '',
    responseType: 'text',
    priority: 0,
    isActive: true
  })

  useEffect(() => {
    fetchResponses()
  }, [])

  const fetchResponses = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/bot/patterns?type=response', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Datos recibidos:', data)
        setResponses(data.botResponses || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Error en respuesta:', response.status, errorData)
        alert(`Error al cargar respuestas: ${errorData.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('Error obteniendo respuestas:', error)
      alert('Error de conexión al cargar respuestas')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')
      const url = editingResponse
        ? `/api/bot/patterns/${editingResponse.id}`
        : '/api/bot/patterns'

      const response = await fetch(url, {
        method: editingResponse ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: 'response',
          data: formData
        })
      })

      if (response.ok) {
        setShowForm(false)
        setEditingResponse(null)
        setFormData({ trigger: '', response: '', responseType: 'text', priority: 0, isActive: true })
        fetchResponses()
      } else {
        alert('Error al guardar la respuesta')
      }
    } catch (error) {
      console.error('Error guardando respuesta:', error)
      alert('Error al guardar la respuesta')
    }
  }

  const handleEdit = (response: BotResponse) => {
    setEditingResponse(response)
    setFormData({
      trigger: response.trigger,
      response: response.response,
      responseType: response.responseType,
      priority: response.priority,
      isActive: response.isActive
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta respuesta?')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/bot/patterns/${id}?type=response`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        fetchResponses()
      } else {
        alert('Error al eliminar la respuesta')
      }
    } catch (error) {
      console.error('Error eliminando respuesta:', error)
      alert('Error al eliminar la respuesta')
    }
  }

  const handleToggleActive = async (response: BotResponse) => {
    try {
      const token = localStorage.getItem('token')
      const response_fetch = await fetch(`/api/bot/patterns/${response.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: 'response',
          data: { isActive: !response.isActive }
        })
      })

      if (response_fetch.ok) {
        fetchResponses()
      }
    } catch (error) {
      console.error('Error actualizando respuesta:', error)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando respuestas...</div>
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>
          Respuestas del Bot
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={async () => {
              try {
                const token = localStorage.getItem('token')
                const response = await fetch('/api/bot/reload', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                })
                if (response.ok) {
                  alert('✅ Patrones recargados. El bot ahora usará la nueva configuración.')
                } else {
                  alert('Error al recargar patrones')
                }
              } catch (error) {
                alert('Error al recargar patrones')
              }
            }}
            style={{
              padding: '10px 20px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            🔄 Recargar Patrones
          </button>
          <button
            onClick={() => {
              setShowForm(true)
              setEditingResponse(null)
              setFormData({ trigger: '', response: '', responseType: 'text', priority: 0, isActive: true })
            }}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            + Nueva Respuesta
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '30px',
          marginBottom: '30px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '20px', color: '#333' }}>
            {editingResponse ? 'Editar Respuesta' : 'Nueva Respuesta'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Trigger (Palabra clave o patrón) *
              </label>
              <input
                type="text"
                value={formData.trigger}
                onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                required
                placeholder="Ej: hola|hi|buenos días"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Respuesta *
              </label>
              <textarea
                value={formData.response}
                onChange={(e) => setFormData({ ...formData, response: e.target.value })}
                required
                rows={6}
                placeholder="Texto de la respuesta del bot..."
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                  Tipo de Respuesta
                </label>
                <select
                  value={formData.responseType}
                  onChange={(e) => setFormData({ ...formData, responseType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="text">Texto</option>
                  <option value="help">Ayuda</option>
                  <option value="error">Error</option>
                  <option value="success">Éxito</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                  Prioridad
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '25px' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  style={{ width: '20px', height: '20px' }}
                />
                <label style={{ color: '#333', fontSize: '14px' }}>Activo</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {editingResponse ? 'Actualizar' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingResponse(null)
                  setFormData({ trigger: '', response: '', responseType: 'text', priority: 0, isActive: true })
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{
        background: 'white',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#333' }}>Trigger</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#333' }}>Respuesta</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Tipo</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Prioridad</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Estado</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((response) => (
              <tr key={response.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>
                  <code style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                    {response.trigger}
                  </code>
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#666', maxWidth: '300px' }}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {response.response.substring(0, 50)}...
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px', color: '#333' }}>
                  <span style={{
                    padding: '4px 8px',
                    background: response.responseType === 'error' ? '#fee2e2' : 
                                response.responseType === 'success' ? '#d1fae5' :
                                response.responseType === 'help' ? '#dbeafe' : '#f3f4f6',
                    color: response.responseType === 'error' ? '#991b1b' :
                           response.responseType === 'success' ? '#065f46' :
                           response.responseType === 'help' ? '#1e40af' : '#333',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {response.responseType}
                  </span>
                </td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px', color: '#333' }}>{response.priority}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleToggleActive(response)}
                    style={{
                      padding: '4px 12px',
                      background: response.isActive ? '#d1fae5' : '#fee2e2',
                      color: response.isActive ? '#065f46' : '#991b1b',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    {response.isActive ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      onClick={() => handleEdit(response)}
                      style={{
                        padding: '6px 12px',
                        background: '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(response.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {responses.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            No hay respuestas configuradas. Crea una nueva para comenzar.
          </div>
        )}
      </div>
    </div>
  )
}
