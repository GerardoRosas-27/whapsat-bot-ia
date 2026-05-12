'use client'

import { useCallback, useEffect, useState } from 'react'

type ConversationSummary = {
  id: string
  phoneNumber: string
  lastMessage: string | null
  createdAt: string
  updatedAt: string
  _count: { messages: number }
}

type ConversationMessage = {
  id: string
  role: string
  body: string
  messageType: string
  mediaUrl: string | null
  createdAt: string
}

type ConversationDetail = ConversationSummary & {
  messages: ConversationMessage[]
}

function getToken() {
  return localStorage.getItem('token')
}

export default function BackpackConversationsManager() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const loadConversations = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const token = getToken()
      const res = await fetch('/api/backpack-bot/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Error al cargar conversaciones' })
        return
      }
      setConversations(data.conversations ?? [])
      if (!selectedId && data.conversations?.[0]?.id) {
        setSelectedId(data.conversations[0].id)
      }
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  const loadConversation = useCallback(async (id: string) => {
    setLoadingChat(true)
    setMessage(null)
    try {
      const token = getToken()
      const res = await fetch(`/api/backpack-bot/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Error al cargar chat' })
        return
      }
      setSelected(data.conversation)
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    } finally {
      setLoadingChat(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (selectedId) {
      loadConversation(selectedId)
    } else {
      setSelected(null)
    }
  }, [selectedId, loadConversation])

  const refreshAll = async () => {
    await loadConversations()
    if (selectedId) await loadConversation(selectedId)
  }

  const deleteSelected = async () => {
    if (!selectedId || !selected) return
    if (!confirm(`¿Borrar el historial guardado del número ${selected.phoneNumber}?`)) return
    try {
      const token = getToken()
      const res = await fetch(`/api/backpack-bot/conversations/${selectedId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'err', text: data.error || 'Error al borrar chat' })
        return
      }
      setSelectedId(null)
      setSelected(null)
      setMessage({ type: 'ok', text: 'Historial borrado de la base de datos.' })
      await loadConversations()
    } catch {
      setMessage({ type: 'err', text: 'Error de conexión' })
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '20px' }}>
      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Chats de clientes</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Historial guardado por número.
            </p>
          </div>
          <button type="button" onClick={refreshAll} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>
            Recargar
          </button>
        </div>

        {message && (
          <div style={{ margin: '12px', padding: '10px', borderRadius: '6px', fontSize: '14px', background: message.type === 'ok' ? '#ecfdf5' : '#fef2f2', color: message.type === 'ok' ? '#047857' : '#b91c1c' }}>
            {message.text}
          </div>
        )}

        {loading ? (
          <p style={{ padding: '16px', color: '#64748b' }}>Cargando...</p>
        ) : conversations.length === 0 ? (
          <p style={{ padding: '16px', color: '#64748b' }}>Aún no hay conversaciones guardadas.</p>
        ) : (
          <div style={{ maxHeight: '620px', overflow: 'auto' }}>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                style={{
                  width: '100%',
                  display: 'block',
                  textAlign: 'left',
                  padding: '14px 16px',
                  border: 'none',
                  borderBottom: '1px solid #f1f5f9',
                  background: selectedId === conversation.id ? '#ecfdf5' : 'white',
                  cursor: 'pointer'
                }}
              >
                <strong style={{ color: '#0f172a' }}>{conversation.phoneNumber}</strong>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  {conversation._count.messages} mensajes · {new Date(conversation.updatedAt).toLocaleString()}
                </div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {conversation.lastMessage || '-'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
              {selected ? selected.phoneNumber : 'Selecciona un chat'}
            </h2>
            {selected && (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                Última actualización: {new Date(selected.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={refreshAll} disabled={!selectedId} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: selectedId ? 'pointer' : 'not-allowed' }}>
              Recargar chat
            </button>
            <button type="button" onClick={deleteSelected} disabled={!selectedId} style={{ padding: '8px 12px', border: '1px solid #fecaca', borderRadius: '6px', background: '#fef2f2', color: '#b91c1c', cursor: selectedId ? 'pointer' : 'not-allowed' }}>
              Borrar chat guardado
            </button>
          </div>
        </div>

        <div style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
          {loadingChat ? (
            <p style={{ color: '#64748b' }}>Cargando chat...</p>
          ) : !selected ? (
            <p style={{ color: '#64748b' }}>Elige un número para ver su historial.</p>
          ) : selected.messages.length === 0 ? (
            <p style={{ color: '#64748b' }}>Este chat no tiene mensajes guardados.</p>
          ) : (
            selected.messages.map((item) => {
              const isBot = item.role === 'assistant'
              return (
                <div key={item.id} style={{ display: 'flex', justifyContent: isBot ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                  <div style={{ maxWidth: '78%', padding: '10px 12px', borderRadius: '10px', background: isBot ? '#d1fae5' : '#f1f5f9', color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      {isBot ? 'Bot' : 'Cliente'} · {item.messageType} · {new Date(item.createdAt).toLocaleString()}
                    </div>
                    {item.mediaUrl && (
                      <a href={item.mediaUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: '8px' }}>
                        <img
                          src={item.mediaUrl}
                          alt="Imagen del mensaje"
                          style={{ display: 'block', maxWidth: '100%', maxHeight: '260px', borderRadius: '8px', objectFit: 'contain', background: '#fff' }}
                        />
                      </a>
                    )}
                    <div>{item.body}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
