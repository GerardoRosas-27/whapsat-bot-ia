'use client'

import { useEffect, useState } from 'react'

export default function BotStatusBackpack() {
  const [status, setStatus] = useState<{
    isReady: boolean
    isStarting: boolean
    state: string
    phoneNumber: string | null
    qrDataUrl: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/backpack-bot/status', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Error obteniendo estado del backpack bot:', error)
    } finally {
      setLoading(false)
    }
  }

  const runAction = async (action: 'start' | 'logout' | 'test') => {
    setActionLoading(action)
    setMessage(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(
        action === 'test'
          ? '/api/backpack-bot/test-message'
          : '/api/backpack-bot/status',
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          action === 'test'
            ? { message: 'Hola, ¿qué mochilas tienen disponibles?' }
            : { action }
        )
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ type: 'err', text: data.error || 'No se pudo ejecutar la acción' })
        return
      }
      setMessage({
        type: 'ok',
        text:
          action === 'start'
            ? 'Bot iniciado. Si no hay sesión activa, espera el QR para escanearlo.'
            : action === 'logout'
              ? 'Sesión cerrada. Puedes iniciar de nuevo para generar un QR.'
              : 'Prueba enviada a la sesión activa de WhatsApp.'
      })
      await fetchStatus()
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    } finally {
      setActionLoading(null)
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
        <p>Cargando estado del bot de mochilas...</p>
      </div>
    )
  }

  const isReady = status?.isReady ?? false
  const isStarting = status?.isStarting ?? false
  const state = status?.state ?? 'disconnected'
  const hasQr = Boolean(status?.qrDataUrl)

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '30px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: isReady ? '#10b981' : isStarting ? '#f59e0b' : '#ef4444',
            animation: isReady ? 'none' : 'pulse 2s infinite'
          }} />
          <span style={{ fontWeight: '600', color: '#333' }}>
            Bot de Mochilas: {isReady ? 'Conectado' : isStarting ? 'Iniciando' : 'Desconectado'}
          </span>
        </div>
        {status?.phoneNumber && (
          <span style={{ color: '#666', fontSize: '14px' }}>📱 {status.phoneNumber}</span>
        )}
        <span style={{
          padding: '4px 12px',
          background: state === 'CONNECTED' ? '#d1fae5' : hasQr ? '#fef3c7' : '#fee2e2',
          color: state === 'CONNECTED' ? '#065f46' : hasQr ? '#92400e' : '#991b1b',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '500'
        }}>
          Estado: {state}
        </span>
      </div>

      {message && (
        <div
          style={{
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

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => runAction('start')}
          disabled={isReady || isStarting || actionLoading !== null}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderRadius: '6px',
            background: isReady || isStarting || actionLoading !== null ? '#94a3b8' : '#059669',
            color: 'white',
            cursor: isReady || isStarting || actionLoading !== null ? 'not-allowed' : 'pointer',
            fontWeight: 600
          }}
        >
          {actionLoading === 'start' ? 'Iniciando...' : 'Iniciar bot / generar QR'}
        </button>
        <button
          type="button"
          onClick={() => runAction('logout')}
          disabled={actionLoading !== null || (!isReady && !hasQr && !isStarting)}
          style={{
            padding: '10px 18px',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            background: actionLoading !== null || (!isReady && !hasQr && !isStarting) ? '#f1f5f9' : '#fef2f2',
            color: actionLoading !== null || (!isReady && !hasQr && !isStarting) ? '#94a3b8' : '#b91c1c',
            cursor: actionLoading !== null || (!isReady && !hasQr && !isStarting) ? 'not-allowed' : 'pointer',
            fontWeight: 600
          }}
        >
          {actionLoading === 'logout' ? 'Cerrando...' : 'Cerrar sesión'}
        </button>
        <button
          type="button"
          onClick={() => runAction('test')}
          disabled={!isReady || actionLoading !== null}
          style={{
            padding: '10px 18px',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            background: !isReady || actionLoading !== null ? '#f1f5f9' : '#eff6ff',
            color: !isReady || actionLoading !== null ? '#94a3b8' : '#1d4ed8',
            cursor: !isReady || actionLoading !== null ? 'not-allowed' : 'pointer',
            fontWeight: 600
          }}
        >
          {actionLoading === 'test' ? 'Probando...' : 'Enviar prueba LLM'}
        </button>
      </div>

      {hasQr && (
        <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={status?.qrDataUrl ?? ''}
            alt="QR para iniciar sesión de WhatsApp del bot de mochilas"
            style={{
              width: '220px',
              height: '220px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '8px',
              background: 'white'
            }}
          />
          <div style={{ color: '#334155', fontSize: '14px', lineHeight: 1.5, maxWidth: '420px' }}>
            <strong>Escanea este QR con WhatsApp</strong>
            <br />
            Abre WhatsApp en el teléfono del bot, entra a dispositivos vinculados y escanea el código.
            El QR cambia automáticamente cuando WhatsApp genera uno nuevo.
          </div>
        </div>
      )}

      {!isReady && !hasQr && !isStarting && (
        <span style={{ color: '#f59e0b', fontSize: '14px' }}>
          ⚠️ Presiona “Iniciar bot / generar QR” para levantar la sesión desde esta interfaz.
        </span>
      )}
    </div>
  )
}
