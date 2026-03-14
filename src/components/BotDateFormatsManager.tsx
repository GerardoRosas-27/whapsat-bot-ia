'use client'

import { useEffect, useState } from 'react'

interface DateFormat {
  id: string
  format: string
  pattern: string
  example: string
  priority: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function BotDateFormatsManager() {
  const [formats, setFormats] = useState<DateFormat[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingFormat, setEditingFormat] = useState<DateFormat | null>(null)
  const [formData, setFormData] = useState({
    format: '',
    pattern: '',
    example: '',
    priority: 0,
    isActive: true
  })

  useEffect(() => {
    fetchFormats()
  }, [])

  const fetchFormats = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/bot/patterns?type=date', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Datos recibidos:', data)
        setFormats(data.dateFormats || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Error en respuesta:', response.status, errorData)
        alert(`Error al cargar formatos: ${errorData.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('Error obteniendo formatos:', error)
      alert('Error de conexión al cargar formatos')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const token = localStorage.getItem('token')
      const url = editingFormat
        ? `/api/bot/patterns/${editingFormat.id}`
        : '/api/bot/patterns'

      const response = await fetch(url, {
        method: editingFormat ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: 'date',
          data: formData
        })
      })

      if (response.ok) {
        setShowForm(false)
        setEditingFormat(null)
        setFormData({ format: '', pattern: '', example: '', priority: 0, isActive: true })
        fetchFormats()
      } else {
        alert('Error al guardar el formato')
      }
    } catch (error) {
      console.error('Error guardando formato:', error)
      alert('Error al guardar el formato')
    }
  }

  const handleEdit = (format: DateFormat) => {
    setEditingFormat(format)
    setFormData({
      format: format.format,
      pattern: format.pattern,
      example: format.example,
      priority: format.priority,
      isActive: format.isActive
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este formato?')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/bot/patterns/${id}?type=date`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        fetchFormats()
      } else {
        alert('Error al eliminar el formato')
      }
    } catch (error) {
      console.error('Error eliminando formato:', error)
      alert('Error al eliminar el formato')
    }
  }

  const handleToggleActive = async (format: DateFormat) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/bot/patterns/${format.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: 'date',
          data: { isActive: !format.isActive }
        })
      })

      if (response.ok) {
        fetchFormats()
      }
    } catch (error) {
      console.error('Error actualizando formato:', error)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando formatos...</div>
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
          Formatos de Fecha
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
              setEditingFormat(null)
              setFormData({ format: '', pattern: '', example: '', priority: 0, isActive: true })
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
            + Nuevo Formato
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
            {editingFormat ? 'Editar Formato' : 'Nuevo Formato de Fecha'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Formato (date-fns) *
              </label>
              <input
                type="text"
                value={formData.format}
                onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                required
                placeholder="Ej: dd/MM/yyyy"
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
                Patrón Regex *
              </label>
              <input
                type="text"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                required
                placeholder="Ej: (\\d{1,2})/(\\d{1,2})/(\\d{4})"
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
                Ejemplo *
              </label>
              <input
                type="text"
                value={formData.example}
                onChange={(e) => setFormData({ ...formData, example: e.target.value })}
                required
                placeholder="Ej: 15/01/2024"
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
                {editingFormat ? 'Actualizar' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingFormat(null)
                  setFormData({ format: '', pattern: '', example: '', priority: 0, isActive: true })
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
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#333' }}>Formato</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#333' }}>Patrón Regex</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#333' }}>Ejemplo</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Prioridad</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Estado</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#333' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {formats.map((format) => (
              <tr key={format.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>
                  <code style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                    {format.format}
                  </code>
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#666' }}>
                  <code style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '11px' }}>
                    {format.pattern}
                  </code>
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>{format.example || 'N/A'}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px', color: '#333' }}>{format.priority}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleToggleActive(format)}
                    style={{
                      padding: '4px 12px',
                      background: format.isActive ? '#d1fae5' : '#fee2e2',
                      color: format.isActive ? '#065f46' : '#991b1b',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    {format.isActive ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      onClick={() => handleEdit(format)}
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
                      onClick={() => handleDelete(format.id)}
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
        {formats.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            No hay formatos configurados. Crea uno nuevo para comenzar.
          </div>
        )}
      </div>
    </div>
  )
}
