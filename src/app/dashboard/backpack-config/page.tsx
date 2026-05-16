'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BackpackAdminNumbersManager,
  BackpackBotPolicyManager,
  BackpackCompanyDataManager,
  BackpackConversationsManager,
  BackpackProductsManager,
  BotStatusBackpack
} from '@/modules/backpack/ui'

type BackpackTab = 'status' | 'rules' | 'company' | 'products' | 'conversations' | 'admins'

export default function BackpackConfigPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<BackpackTab>('status')
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
              Estado, reglas del bot y catálogo de mochilas
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
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '4px'
          }}
        >
          {(
            [
              { id: 'status' as const, label: 'Estado del bot' },
              { id: 'rules' as const, label: 'Instrucciones IA' },
              { id: 'company' as const, label: 'Datos de empresa' },
              { id: 'products' as const, label: 'Productos' },
              { id: 'conversations' as const, label: 'Conversaciones' },
              { id: 'admins' as const, label: 'Admins del bot' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                background: activeTab === tab.id ? 'white' : 'transparent',
                color: activeTab === tab.id ? '#047857' : '#64748b',
                boxShadow: activeTab === tab.id ? '0 -2px 0 #059669 inset' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'status' && <BotStatusBackpack />}
        {activeTab === 'rules' && <BackpackBotPolicyManager />}
        {activeTab === 'company' && <BackpackCompanyDataManager />}
        {activeTab === 'products' && <BackpackProductsManager />}
        {activeTab === 'conversations' && <BackpackConversationsManager />}
        {activeTab === 'admins' && <BackpackAdminNumbersManager />}
      </main>
    </div>
  )
}
