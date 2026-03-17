'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale/es'

interface Appointment {
  id: string
  patientName: string
  phoneNumber: string
  date: string
  time: string
  status: string
  notes?: string
  createdAt: string
  updatedAt: string
}

interface AppointmentCardProps {
  appointment: Appointment
  onUpdate: () => void
  onDelete: () => void
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e', label: 'Pendiente' },
  confirmed: { bg: '#d1fae5', text: '#065f46', label: 'Confirmada' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', label: 'Cancelada' },
  completed: { bg: '#dbeafe', text: '#1e40af', label: 'Completada' }
}

export default function AppointmentCard({ appointment, onUpdate, onDelete }: AppointmentCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    patientName: appointment.patientName,
    phoneNumber: appointment.phoneNumber,
    date: format(new Date(appointment.date), 'yyyy-MM-dd'),
    time: appointment.time,
    status: appointment.status,
    notes: appointment.notes || ''
  })

  const statusInfo = statusColors[appointment.status] || statusColors.pending
  const formattedDate = format(new Date(appointment.date), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })

  const handleUpdate = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        alert('No estás autenticado. Por favor, inicia sesión nuevamente.')
        return
      }

      const response = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          date: new Date(formData.date).toISOString()
        })
      })

      const data = await response.json()

      if (response.ok) {
        setIsEditing(false)
        onUpdate()
      } else {
        const errorMessage = data.error || 'Error al actualizar la cita'
        alert(`Error: ${errorMessage}`)
        console.error('Error al actualizar cita:', data)
      }
    } catch (error) {
      console.error('Error actualizando cita:', error)
      alert('Error de conexión. Por favor, verifica tu conexión a internet e intenta de nuevo.')
    }
  }

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta cita?')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        alert('No estás autenticado. Por favor, inicia sesión nuevamente.')
        return
      }

      console.log('[DELETE] Intentando eliminar cita con ID:', appointment.id)
      console.log('[DELETE] URL:', `/api/appointments/${appointment.id}`)
      
      const response = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('[DELETE] Respuesta recibida:', response.status, response.statusText)

      // Verificar si la respuesta tiene contenido antes de parsear JSON
      const contentType = response.headers.get('content-type')
      let data: any = null

      if (contentType && contentType.includes('application/json')) {
        try {
          const text = await response.text()
          data = text ? JSON.parse(text) : null
        } catch (parseError) {
          console.error('Error parseando respuesta JSON:', parseError)
          data = null
        }
      }

      if (response.ok) {
        onDelete()
      } else {
        const errorMessage = data?.error || `Error ${response.status}: ${response.statusText}`
        alert(`Error: ${errorMessage}`)
        console.error('Error al eliminar cita:', {
          status: response.status,
          statusText: response.statusText,
          data
        })
      }
    } catch (error: any) {
      console.error('Error eliminando cita:', error)
      
      // Distinguir entre errores de red y otros errores
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        alert('Error de conexión. Por favor, verifica tu conexión a internet e intenta de nuevo.')
      } else {
        alert(`Error inesperado: ${error.message || 'Por favor, intenta de nuevo.'}`)
      }
    }
  }

  if (isEditing) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        border: '2px solid #667eea'
      }}>
        <h3 style={{ marginBottom: '15px', color: '#333' }}>Editar Cita</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
          <input
            type="text"
            value={formData.patientName}
            onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
            placeholder="Nombre del paciente"
            style={{
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
          
          <input
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            placeholder="Número de teléfono"
            style={{
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
          
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            style={{
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
          
          <input
            type="time"
            value={formData.time}
            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            style={{
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
          
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            style={{
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          >
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmada</option>
            <option value="cancelled">Cancelada</option>
            <option value="completed">Completada</option>
          </select>
          
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Notas (opcional)"
            rows={3}
            style={{
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              resize: 'vertical'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleUpdate}
            style={{
              flex: 1,
              padding: '8px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Guardar
          </button>
          <button
            onClick={() => setIsEditing(false)}
            style={{
              flex: 1,
              padding: '8px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'transform 0.2s, box-shadow 0.2s',
      borderLeft: `4px solid ${statusInfo.text}`
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
    }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'start',
        marginBottom: '15px'
      }}>
        <div>
          <h3 style={{ marginBottom: '5px', color: '#333', fontSize: '18px' }}>
            {appointment.patientName}
          </h3>
          <p style={{ color: '#666', fontSize: '14px' }}>
            📱 {appointment.phoneNumber}
          </p>
        </div>
        <span style={{
          padding: '4px 12px',
          background: statusInfo.bg,
          color: statusInfo.text,
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '500'
        }}>
          {statusInfo.label}
        </span>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <p style={{ color: '#333', marginBottom: '5px', fontSize: '14px' }}>
          📅 <strong>{formattedDate}</strong>
        </p>
        <p style={{ color: '#333', fontSize: '14px' }}>
          🕐 <strong>{appointment.time}</strong>
        </p>
      </div>

      {appointment.notes && (
        <div style={{
          background: '#f9fafb',
          padding: '10px',
          borderRadius: '4px',
          marginBottom: '15px'
        }}>
          <p style={{ color: '#666', fontSize: '13px' }}>
            <strong>Notas:</strong> {appointment.notes}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => setIsEditing(true)}
          style={{
            flex: 1,
            padding: '8px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500'
          }}
        >
          Editar
        </button>
        <button
          onClick={handleDelete}
          style={{
            flex: 1,
            padding: '8px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500'
          }}
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}
