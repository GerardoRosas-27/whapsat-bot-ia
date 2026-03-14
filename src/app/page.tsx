'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LoginForm from '@/components/LoginForm'

export default function Home() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      setIsAuthenticated(true)
      router.push('/dashboard')
    }
  }, [router])

  if (isAuthenticated) {
    return null
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '10px',
          color: '#333',
          textAlign: 'center'
        }}>
          Sistema de Agendamiento
        </h1>
        <p style={{
          color: '#666',
          textAlign: 'center',
          marginBottom: '30px',
          fontSize: '14px'
        }}>
          Administración de citas de psicología
        </p>
        <LoginForm />
      </div>
    </main>
  )
}
