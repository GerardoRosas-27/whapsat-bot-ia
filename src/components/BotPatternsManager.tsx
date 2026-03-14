'use client'

import { useEffect, useState } from 'react'

interface AppointmentPattern {
  id: string
  pattern: string
  description: string
  priority: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function BotPatternsManager() {
  const [patterns, setPatterns] = useState<AppointmentPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPattern, setEditingPattern] = useState<AppointmentPattern | null>(null)
  const [formData, setFormData] = useState({
    pattern: '',
    description: '',
    priority: 0,
    isActive: true
  })

  useEffect(() => {
    fetchPatterns()
  }, [])

  const fetchPatterns = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/bot/patterns?type=appointment', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Datos recibidos:', data)
        setPatterns(data.appointmentPatterns || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Error en respuesta:', response.status, errorData)
        alert(`Error al cargar patrones: ${errorData.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('Error obteniendo patrones:', error)
      alert('Error de conexión al cargar patrones')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')
      const url = editingPattern
        ? `/api/bot/patterns/${editingPattern.id}`
        : '/api/bot/patterns'

      const response = await fetch(url, {
        method: editingPattern ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: 'appointment',
          data: formData
        })
      })

      if (response.ok) {
        setShowForm(false)
        setEditingPattern(null)
        setFormData({ pattern: '', description: '', priority: 0, isActive: true })
        fetchPatterns()
      } else {
        alert('Error al guardar el patrón')
      }
    } catch (error) {
      console.error('Error guardando patrón:', error)
      alert('Error al guardar el patrón')
    }
  }

  const handleEdit = (pattern: AppointmentPattern) => {
    setEditingPattern(pattern)
    setFormData({
      pattern: pattern.pattern,
      description: pattern.description,
      priority: pattern.priority,
      isActive: pattern.isActive
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este patrón?')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/bot/patterns/${id}?type=appointment`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        fetchPatterns()
      } else {
        alert('Error al eliminar el patrón')
      }
    } catch (error) {
      console.error('Error eliminando patrón:', error)
      alert('Error al eliminar el patrón')
    }
  }

  const handleToggleActive = async (pattern: AppointmentPattern) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/bot/patterns/${pattern.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: 'appointment',
          data: { isActive: !pattern.isActive }
        })
      })

      if (response.ok) {
        fetchPatterns()
      }
    } catch (error) {
      console.error('Error actualizando patrón:', error)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando patrones...</div>
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
          Patrones de Solicitud de Citas
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
              setEditingPattern(null)
              setFormData({ pattern: '', description: '', priority: 0, isActive: true })
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
            + Nuevo Patrón
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
            {editingPattern ? 'Editar Patrón' : 'Nuevo Patrón'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Patrón (Regex o texto) *
              </label>
              <input
                type="text"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                required
                placeholder="Ej: agendar|solicitar|reservar"
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
                Descripción *
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                placeholder="Descripción del patrón"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                  Prioridad (mayor = más importante)
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
                {editingPattern ? 'Actualizar' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingPattern(null)
                  setFormData({ pattern: '', description: '', priority: 0, isActive: true })
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
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#333' }}>Patrón</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#333' }}>Descripción</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Prioridad</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Estado</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {patterns.map((pattern) => (
              <tr key={pattern.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>
                  <code style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                    {pattern.pattern}
                  </code>
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#666' }}>{pattern.description}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px', color: '#333' }}>{pattern.priority}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleToggleActive(pattern)}
                    style={{
                      padding: '4px 12px',
                      background: pattern.isActive ? '#d1fae5' : '#fee2e2',
                      color: pattern.isActive ? '#065f46' : '#991b1b',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    {pattern.isActive ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      onClick={() => handleEdit(pattern)}
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
                      onClick={() => handleDelete(pattern.id)}
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
        {patterns.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            No hay patrones configurados. Crea uno nuevo para comenzar.
          </div>
        )}
      </div>
    </div>
  )
}
