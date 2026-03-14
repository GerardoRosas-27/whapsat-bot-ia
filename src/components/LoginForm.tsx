'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.setItem('token', data.token)
        router.push('/dashboard')
      } else {
        setError(data.error || 'Error al iniciar sesión')
      }
    } catch (err) {
      setError('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          color: '#333',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          Usuario
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.3s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#667eea'}
          onBlur={(e) => e.target.style.borderColor = '#ddd'}
        />
      </div>
      
      <div>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          color: '#333',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          Contraseña
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.3s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#667eea'}
          onBlur={(e) => e.target.style.borderColor = '#ddd'}
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

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.3s'
        }}
      >
        {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
      </button>
    </form>
  )
}
