'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BotDateFormatsManager,
  BotPatternsManager,
  BotResponsesManager,
  BotTimeFormatsManager,
  BusinessHoursManager
} from '@/modules/appointments/ui'

export default function BotConfigPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'patterns' | 'dates' | 'times' | 'responses' | 'hours'>('patterns')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
      return
    }

    // Verificar si es admin
    const checkAdmin = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.role === 'admin') {
            setIsAdmin(true)
          } else {
            router.push('/dashboard')
            return
          }
        } else {
          router.push('/')
          return
        }
      } catch (error) {
        // Fallback: verificar token directamente
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          if (payload.role === 'admin') {
            setIsAdmin(true)
          } else {
            router.push('/dashboard')
            return
          }
        } catch (e) {
          router.push('/')
          return
        }
      } finally {
        setLoading(false)
      }
    }

    checkAdmin()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Cargando...</p>
      </div>
    )
  }

  if (!isAdmin) {
    return null
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
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '5px' }}>
              Configuración del Bot
            </h1>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              Administra patrones, formatos y respuestas del bot de WhatsApp
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => router.push('/dashboard')}
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
              ← Volver al Dashboard
            </button>
          </div>
        </div>
      </header>

      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '40px 20px'
      }}>
        {/* Tabs */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '10px',
          marginBottom: '30px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setActiveTab('patterns')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'patterns' ? '#667eea' : 'transparent',
              color: activeTab === 'patterns' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            📋 Patrones de Solicitud
          </button>
          <button
            onClick={() => setActiveTab('dates')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'dates' ? '#667eea' : 'transparent',
              color: activeTab === 'dates' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            📅 Formatos de Fecha
          </button>
          <button
            onClick={() => setActiveTab('times')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'times' ? '#667eea' : 'transparent',
              color: activeTab === 'times' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            🕐 Formatos de Hora
          </button>
          <button
            onClick={() => setActiveTab('responses')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'responses' ? '#667eea' : 'transparent',
              color: activeTab === 'responses' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            💬 Respuestas del Bot
          </button>
          <button
            onClick={() => setActiveTab('hours')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'hours' ? '#667eea' : 'transparent',
              color: activeTab === 'hours' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            ⏰ Horarios de Atención
          </button>
        </div>

        {/* Content */}
        <div>
          {activeTab === 'patterns' && <BotPatternsManager />}
          {activeTab === 'dates' && <BotDateFormatsManager />}
          {activeTab === 'times' && <BotTimeFormatsManager />}
          {activeTab === 'responses' && <BotResponsesManager />}
          {activeTab === 'hours' && <BusinessHoursManager />}
        </div>
      </main>
    </div>
  )
}
