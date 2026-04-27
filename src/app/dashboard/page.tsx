'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppointmentForm, AppointmentList, BotStatus } from '@/modules/appointments/ui'

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

export default function Dashboard() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
      return
    }
    fetchAppointments()
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setIsAdmin(data?.role === 'admin'))
      .catch(() => {})
  }, [router, filter])

  const fetchAppointments = async () => {
    try {
      const token = localStorage.getItem('token')
      const statusParam = filter !== 'all' ? `?status=${filter}` : ''
      
      const response = await fetch(`/api/appointments${statusParam}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.status === 401) {
        localStorage.removeItem('token')
        router.push('/')
        return
      }

      const data = await response.json()
      setAppointments(data.appointments || [])
    } catch (error) {
      console.error('Error obteniendo citas:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    router.push('/')
  }

  const handleAppointmentCreated = () => {
    setShowForm(false)
    fetchAppointments()
  }

  const handleAppointmentUpdated = () => {
    fetchAppointments()
  }

  const handleAppointmentDeleted = () => {
    fetchAppointments()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '20px 40px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
            Sistema de Agendamiento - Dashboard
          </h1>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => router.push('/dashboard/bot-config')}
              style={{
                padding: '8px 20px',
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              ⚙️ Configurar Bot
            </button>
            {isAdmin && (
              <button
                onClick={() => router.push('/dashboard/backpack-config')}
                style={{
                  padding: '8px 20px',
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                👜 Bot Mochilas
              </button>
            )}
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 20px',
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '40px 20px'
      }}>
        <BotStatus />

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '10px 20px',
                background: filter === 'all' ? '#667eea' : 'white',
                color: filter === 'all' ? 'white' : '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Todas
            </button>
            <button
              onClick={() => setFilter('pending')}
              style={{
                padding: '10px 20px',
                background: filter === 'pending' ? '#667eea' : 'white',
                color: filter === 'pending' ? 'white' : '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFilter('confirmed')}
              style={{
                padding: '10px 20px',
                background: filter === 'confirmed' ? '#667eea' : 'white',
                color: filter === 'confirmed' ? 'white' : '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Confirmadas
            </button>
            <button
              onClick={() => setFilter('cancelled')}
              style={{
                padding: '10px 20px',
                background: filter === 'cancelled' ? '#667eea' : 'white',
                color: filter === 'cancelled' ? 'white' : '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Canceladas
            </button>
            <button
              onClick={() => setFilter('completed')}
              style={{
                padding: '10px 20px',
                background: filter === 'completed' ? '#667eea' : 'white',
                color: filter === 'completed' ? 'white' : '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Completadas
            </button>
          </div>

          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          >
            {showForm ? 'Cancelar' : '+ Nueva Cita'}
          </button>
        </div>

        {showForm && (
          <div style={{ marginBottom: '30px' }}>
            <AppointmentForm
              onSuccess={handleAppointmentCreated}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>Cargando citas...</p>
          </div>
        ) : (
          <AppointmentList
            appointments={appointments}
            onUpdate={handleAppointmentUpdated}
            onDelete={handleAppointmentDeleted}
          />
        )}
      </main>
    </div>
  )
}
