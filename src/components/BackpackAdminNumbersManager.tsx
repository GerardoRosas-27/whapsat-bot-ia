'use client'

import { useCallback, useEffect, useState } from 'react'
import ResponsiveTableScroll from '@/components/ResponsiveTableScroll'

interface BackpackAdminNumber {
  id: string
  phoneNumber: string
  label: string | null
  isActive: boolean
  treatAsCustomer: boolean
  muteBot: boolean
  createdAt: string
  updatedAt: string
}

const emptyForm = {
  phoneNumber: '',
  label: '',
  isActive: true,
  treatAsCustomer: false,
  muteBot: false
}

function normalizePhoneInput(value: string): string {
  return value.replace(/\D/g, '')
}

function getToken() {
  return localStorage.getItem('token')
}

export default function BackpackAdminNumbersManager() {
  const [adminNumbers, setAdminNumbers] = useState<BackpackAdminNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingNumber, setEditingNumber] = useState<BackpackAdminNumber | null>(null)
  const [formData, setFormData] = useState(emptyForm)

  const fetchAdminNumbers = useCallback(async () => {
    try {
      const token = getToken()
      const response = await fetch('/api/backpack-bot/admin-numbers', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setAdminNumbers(data.adminNumbers ?? [])
      } else {
        alert(data.error || 'Error al cargar números admin')
      }
    } catch (error) {
      console.error('Error obteniendo números admin:', error)
      alert('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAdminNumbers()
  }, [fetchAdminNumbers])

  const resetForm = () => {
    setShowForm(false)
    setEditingNumber(null)
    setFormData(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return

    const phoneNumber = normalizePhoneInput(formData.phoneNumber)
    if (phoneNumber.length < 8) {
      alert('Ingresa un número válido con lada')
      return
    }

    try {
      const url = editingNumber
        ? `/api/backpack-bot/admin-numbers/${editingNumber.id}`
        : '/api/backpack-bot/admin-numbers'
      const response = await fetch(url, {
        method: editingNumber ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phoneNumber,
          label: formData.label,
          isActive: formData.isActive,
          treatAsCustomer: formData.treatAsCustomer,
          muteBot: formData.muteBot
        })
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        resetForm()
        fetchAdminNumbers()
      } else {
        alert(data.error || 'Error al guardar número admin')
      }
    } catch (error) {
      console.error('Error guardando número admin:', error)
      alert('Error al guardar')
    }
  }

  const handleEdit = (adminNumber: BackpackAdminNumber) => {
    setEditingNumber(adminNumber)
    setFormData({
      phoneNumber: adminNumber.phoneNumber,
      label: adminNumber.label ?? '',
      isActive: adminNumber.isActive,
      treatAsCustomer: adminNumber.treatAsCustomer,
      muteBot: adminNumber.muteBot
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este número admin?')) return
    const token = getToken()
    if (!token) return

    try {
      const response = await fetch(`/api/backpack-bot/admin-numbers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        fetchAdminNumbers()
      } else {
        const data = await response.json().catch(() => ({}))
        alert(data.error || 'Error al eliminar')
      }
    } catch (error) {
      console.error('Error eliminando número admin:', error)
      alert('Error al eliminar')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', color: '#000' }}>
        <p style={{ color: '#000' }}>Cargando números admin...</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: '#334155' }}>
          Estos números pueden usar funciones administrativas, probar como cliente o silenciar respuestas del bot.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          + Nuevo admin
        </button>
      </div>

      {showForm && (
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#000' }}>
            {editingNumber ? 'Editar número admin' : 'Nuevo número admin'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '520px', color: '#000' }}>
            <label style={{ color: '#000' }}>
              Número WhatsApp con lada *
              <input
                type="tel"
                required
                placeholder="Ej. 5219991234567"
                value={formData.phoneNumber}
                onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              />
            </label>
            <label style={{ color: '#000' }}>
              Nombre o referencia
              <input
                type="text"
                value={formData.label}
                onChange={e => setFormData({ ...formData, label: e.target.value })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#000' }}>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
              />
              Activo
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#000', lineHeight: 1.4 }}>
              <input
                type="checkbox"
                checked={formData.treatAsCustomer}
                onChange={e => setFormData({ ...formData, treatAsCustomer: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <span>
                Aceptar mensajes como usuario para pruebas
                <br />
                <small style={{ color: '#64748b' }}>
                  Si está activo, este número no verá funciones admin y el bot responderá como a un cliente.
                </small>
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#000', lineHeight: 1.4 }}>
              <input
                type="checkbox"
                checked={formData.muteBot}
                onChange={e => setFormData({ ...formData, muteBot: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <span>
                El bot no contesta a este número
                <br />
                <small style={{ color: '#64748b' }}>
                  Si está activo, el sistema deja pasar los mensajes de este número sin responder.
                </small>
              </span>
            </label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                {editingNumber ? 'Guardar' : 'Crear'}
              </button>
              <button type="button" onClick={resetForm} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {adminNumbers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            No hay números admin. Agrega al menos uno para habilitar ventas y corte de caja en el bot.
          </div>
        ) : (
          <ResponsiveTableScroll minWidth={980}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#000' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Número</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Referencia</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#000' }}>Estado</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#000' }}>Modo</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#000' }}>Respuestas</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: '#000' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {adminNumbers.map(adminNumber => (
                  <tr key={adminNumber.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', color: '#000' }}>{adminNumber.phoneNumber}</td>
                    <td style={{ padding: '12px', color: '#000' }}>{adminNumber.label || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: adminNumber.isActive ? '#d1fae5' : '#fee2e2',
                        color: adminNumber.isActive ? '#065f46' : '#991b1b'
                      }}>
                        {adminNumber.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: adminNumber.treatAsCustomer ? '#dbeafe' : '#ede9fe',
                        color: adminNumber.treatAsCustomer ? '#1e40af' : '#5b21b6'
                      }}>
                        {adminNumber.treatAsCustomer ? 'Cliente prueba' : 'Admin'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: adminNumber.muteBot ? '#fee2e2' : '#dcfce7',
                        color: adminNumber.muteBot ? '#991b1b' : '#166534'
                      }}>
                        {adminNumber.muteBot ? 'No contesta' : 'Contesta'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#000' }}>
                      <button type="button" onClick={() => handleEdit(adminNumber)} style={{ marginRight: '8px', padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #d1d5db', background: 'white' }}>
                        Editar
                      </button>
                      <button type="button" onClick={() => handleDelete(adminNumber.id)} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c' }}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTableScroll>
        )}
      </div>
    </div>
  )
}
