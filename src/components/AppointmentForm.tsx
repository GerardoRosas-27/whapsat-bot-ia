'use client'

import { useState } from 'react'

interface AppointmentFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export default function AppointmentForm({ onSuccess, onCancel }: AppointmentFormProps) {
  const [formData, setFormData] = useState({
    patientName: '',
    phoneNumber: '',
    date: '',
    time: '',
    status: 'pending',
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          date: new Date(formData.date).toISOString()
        })
      })

      if (response.ok) {
        setFormData({
          patientName: '',
          phoneNumber: '',
          date: '',
          time: '',
          status: 'pending',
          notes: ''
        })
        onSuccess()
      } else {
        const data = await response.json()
        setError(data.error || 'Error al crear la cita')
      }
    } catch (error) {
      console.error('Error creando cita:', error)
      setError('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      padding: '30px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ marginBottom: '20px', color: '#333', fontSize: '20px' }}>
        Nueva Cita
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label style={{
            display: 'block',
            marginBottom: '5px',
            color: '#333',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Nombre del Paciente *
          </label>
          <input
            type="text"
            value={formData.patientName}
            onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
            required
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
          <label style={{
            display: 'block',
            marginBottom: '5px',
            color: '#333',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Número de Teléfono *
          </label>
          <input
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            required
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
            <label style={{
              display: 'block',
              marginBottom: '5px',
              color: '#333',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Fecha *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
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
            <label style={{
              display: 'block',
              marginBottom: '5px',
              color: '#333',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Hora *
            </label>
            <input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        <div>
          <label style={{
            display: 'block',
            marginBottom: '5px',
            color: '#333',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Estado
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmada</option>
            <option value="cancelled">Cancelada</option>
            <option value="completed">Completada</option>
          </select>
        </div>

        <div>
          <label style={{
            display: 'block',
            marginBottom: '5px',
            color: '#333',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Notas (opcional)
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              resize: 'vertical'
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: '#fee',
            color: '#c33',
            borderRadius: '6px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px',
              background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Creando...' : 'Crear Cita'}
          </button>
          <button
            type="button"
            onClick={onCancel}
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
  )
}
