'use client'

import { useState, useEffect } from 'react'

interface RestPeriod {
  id?: string
  startTime: string
  endTime: string
  description?: string | null
  isActive?: boolean
}

interface NonWorkingDay {
  id?: string
  date: string // Formato YYYY-MM-DD
  description?: string | null
  isActive?: boolean
}

interface BusinessHours {
  id?: string | null
  startTime: string
  endTime: string
  appointmentDuration: number
  isActive: boolean
  restPeriods?: RestPeriod[]
  nonWorkingDays?: NonWorkingDay[]
}

export default function BusinessHoursManager() {
  const [hours, setHours] = useState<BusinessHours>({
    startTime: '08:00',
    endTime: '18:00',
    appointmentDuration: 60,
    isActive: true,
    restPeriods: [],
    nonWorkingDays: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [newRestPeriod, setNewRestPeriod] = useState({ startTime: '', endTime: '', description: '' })
  const [newNonWorkingDay, setNewNonWorkingDay] = useState({ date: '', description: '' })

  useEffect(() => {
    fetchHours()
  }, [])

  const fetchHours = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/business-hours', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setHours({
          ...data,
          restPeriods: data.restPeriods || [],
          nonWorkingDays: data.nonWorkingDays || []
        })
      }
    } catch (error) {
      console.error('Error obteniendo horarios:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/business-hours', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(hours)
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'Horarios guardados exitosamente' })
        fetchHours()
      } else {
        const error = await response.json()
        setMessage({ type: 'error', text: error.error || 'Error al guardar horarios' })
      }
    } catch (error) {
      console.error('Error guardando horarios:', error)
      setMessage({ type: 'error', text: 'Error al guardar horarios' })
    } finally {
      setSaving(false)
    }
  }

  const addRestPeriod = () => {
    if (newRestPeriod.startTime && newRestPeriod.endTime) {
      setHours({
        ...hours,
        restPeriods: [
          ...(hours.restPeriods || []),
          {
            startTime: newRestPeriod.startTime,
            endTime: newRestPeriod.endTime,
            description: newRestPeriod.description || null
          }
        ]
      })
      setNewRestPeriod({ startTime: '', endTime: '', description: '' })
    }
  }

  const removeRestPeriod = (index: number) => {
    const updated = [...(hours.restPeriods || [])]
    updated.splice(index, 1)
    setHours({ ...hours, restPeriods: updated })
  }

  const addNonWorkingDay = () => {
    if (newNonWorkingDay.date) {
      setHours({
        ...hours,
        nonWorkingDays: [
          ...(hours.nonWorkingDays || []),
          {
            date: newNonWorkingDay.date,
            description: newNonWorkingDay.description || null
          }
        ]
      })
      setNewNonWorkingDay({ date: '', description: '' })
    }
  }

  const removeNonWorkingDay = (index: number) => {
    const updated = [...(hours.nonWorkingDays || [])]
    updated.splice(index, 1)
    setHours({ ...hours, nonWorkingDays: updated })
  }

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Cargando...</div>
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 'bold' }}>
        ⏰ Horarios de Atención
      </h2>

      {message && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          borderRadius: '6px',
          background: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message.text}
        </div>
      )}

      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
          Horario de Atención
        </h3>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: '#666' }}>
              Hora de Inicio
            </label>
            <input
              type="time"
              value={hours.startTime}
              onChange={(e) => setHours({ ...hours, startTime: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <span style={{ marginTop: '24px' }}>a</span>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: '#666' }}>
              Hora de Fin
            </label>
            <input
              type="time"
              value={hours.endTime}
              onChange={(e) => setHours({ ...hours, endTime: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Duración de Citas (minutos)
          </label>
          <input
            type="number"
            min="15"
            max="180"
            step="15"
            value={hours.appointmentDuration}
            onChange={(e) => setHours({ ...hours, appointmentDuration: parseInt(e.target.value) || 60 })}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              maxWidth: '200px'
            }}
          />
          <p style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
            Duración de cada cita en minutos (15, 30, 45, 60, etc.)
          </p>
        </div>
      </div>

      {/* Periodos de Descanso */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
          Periodos de Descanso
        </h3>
        
        {(hours.restPeriods || []).length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            {hours.restPeriods!.map((period, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: '6px',
                marginBottom: '8px'
              }}>
                <span style={{ flex: 1 }}>
                  {period.startTime} - {period.endTime}
                  {period.description && <span style={{ color: '#666', marginLeft: '8px' }}>({period.description})</span>}
                </span>
                <button
                  onClick={() => removeRestPeriod(index)}
                  style={{
                    padding: '6px 12px',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: '#666' }}>
              Inicio
            </label>
            <input
              type="time"
              value={newRestPeriod.startTime}
              onChange={(e) => setNewRestPeriod({ ...newRestPeriod, startTime: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: '#666' }}>
              Fin
            </label>
            <input
              type="time"
              value={newRestPeriod.endTime}
              onChange={(e) => setNewRestPeriod({ ...newRestPeriod, endTime: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: '#666' }}>
              Descripción (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Hora de comida"
              value={newRestPeriod.description}
              onChange={(e) => setNewRestPeriod({ ...newRestPeriod, description: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <button
            onClick={addRestPeriod}
            style={{
              padding: '8px 16px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Días No Laborables */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
          Días No Laborables
        </h3>
        
        {(hours.nonWorkingDays || []).length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            {hours.nonWorkingDays!.map((day, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: '6px',
                marginBottom: '8px'
              }}>
                <span style={{ flex: 1 }}>
                  {new Date(day.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  {day.description && <span style={{ color: '#666', marginLeft: '8px' }}>({day.description})</span>}
                </span>
                <button
                  onClick={() => removeNonWorkingDay(index)}
                  style={{
                    padding: '6px 12px',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: '#666' }}>
              Fecha
            </label>
            <input
              type="date"
              value={newNonWorkingDay.date}
              onChange={(e) => setNewNonWorkingDay({ ...newNonWorkingDay, date: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: '#666' }}>
              Descripción (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Día festivo, Vacaciones"
              value={newNonWorkingDay.description}
              onChange={(e) => setNewNonWorkingDay({ ...newNonWorkingDay, description: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <button
            onClick={addNonWorkingDay}
            style={{
              padding: '8px 16px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            + Agregar
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '12px 24px',
          background: saving ? '#ccc' : '#667eea',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          fontWeight: '500'
        }}
      >
        {saving ? 'Guardando...' : '💾 Guardar Horarios'}
      </button>
    </div>
  )
}
