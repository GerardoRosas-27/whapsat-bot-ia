'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BotStatusBackpack from '@/components/BotStatusBackpack'
import BackpackProductsManager from '@/components/BackpackProductsManager'

export default function BackpackConfigPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
      return
    }

    const checkAdmin = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
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
      } catch {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          if (payload.role === 'admin') {
            setIsAdmin(true)
          } else {
            router.push('/dashboard')
            return
          }
        } catch {
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
        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
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
              Configuración Bot de Mochilas
            </h1>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              Administra productos y estado del bot de WhatsApp (mochilas)
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
        <BotStatusBackpack />
        <BackpackProductsManager />
      </main>
    </div>
  )
}
