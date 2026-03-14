'use client'

import { useEffect, useState } from 'react'

export default function BotStatus() {
  const [status, setStatus] = useState<{
    isReady: boolean
    state: string
    phoneNumber: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000) // Actualizar cada 5 segundos
    
    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/bot/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Error obteniendo estado del bot:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '30px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <p>Cargando estado del bot...</p>
      </div>
    )
  }

  const isReady = status?.isReady || false
  const state = status?.state || 'disconnected'

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '30px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      flexWrap: 'wrap'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: isReady ? '#10b981' : '#ef4444',
          animation: isReady ? 'none' : 'pulse 2s infinite'
        }} />
        <span style={{ fontWeight: '600', color: '#333' }}>
          Bot de WhatsApp: {isReady ? 'Conectado' : 'Desconectado'}
        </span>
      </div>
      
      {status?.phoneNumber && (
        <span style={{ color: '#666', fontSize: '14px' }}>
          📱 {status.phoneNumber}
        </span>
      )}
      
      <span style={{
        padding: '4px 12px',
        background: state === 'CONNECTED' ? '#d1fae5' : '#fee2e2',
        color: state === 'CONNECTED' ? '#065f46' : '#991b1b',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500'
      }}>
        Estado: {state}
      </span>

      {!isReady && (
        <span style={{ color: '#f59e0b', fontSize: '14px' }}>
          ⚠️ Ejecuta el bot con: npm run bot
        </span>
      )}
    </div>
  )
}
