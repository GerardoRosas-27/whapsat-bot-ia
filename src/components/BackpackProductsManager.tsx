'use client'

import { useEffect, useState } from 'react'
import ResponsiveTableScroll from '@/components/ResponsiveTableScroll'

interface BackpackProduct {
  id: string
  name: string
  description: string
  imageUrl: string | null
  useType: string
  gender: string
  sizes: string | string[]
  colors: string | string[]
  price: number
  stock: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const USE_TYPE_OPTIONS = [
  { value: 'school', label: 'Escuela' },
  { value: 'work', label: 'Trabajo' }
]

const GENDER_OPTIONS = [
  { value: 'man', label: 'Hombre' },
  { value: 'woman', label: 'Mujer' },
  { value: 'unisex', label: 'Unisex' }
]

const SIZE_OPTIONS = [
  { value: 'chica', label: 'Chica' },
  { value: 'mediana', label: 'Mediana' },
  { value: 'grande', label: 'Grande' },
  { value: 'extragrande', label: 'Extragrande' }
]

const COLOR_OPTIONS = [
  { value: 'negro', label: 'Negro' },
  { value: 'blanco', label: 'Blanco' },
  { value: 'rojo', label: 'Rojo' },
  { value: 'azul', label: 'Azul' },
  { value: 'verde', label: 'Verde' },
  { value: 'amarillo', label: 'Amarillo' },
  { value: 'rosa', label: 'Rosa' },
  { value: 'morado', label: 'Morado' },
  { value: 'gris', label: 'Gris' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'beige', label: 'Beige' },
  { value: 'naranja', label: 'Naranja' },
  { value: 'multicolor', label: 'Multicolor' }
]

export default function BackpackProductsManager() {
  const [products, setProducts] = useState<BackpackProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<BackpackProduct | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    imageUrl: '',
    useType: 'school' as 'school' | 'work',
    gender: 'unisex' as 'man' | 'woman' | 'unisex',
    sizes: [] as string[],
    colors: [] as string[],
    price: 0,
    stock: 0,
    isActive: true
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/backpack-bot/products', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setProducts(data.products ?? [])
      } else {
        const err = await response.json().catch(() => ({}))
        alert(err.error || 'Error al cargar productos')
      }
    } catch (error) {
      console.error('Error obteniendo productos:', error)
      alert('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const getToken = () => localStorage.getItem('token')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    if (editingProduct && !editingProduct.id) {
      alert('Error: ID del producto no disponible. Cierra el formulario y vuelve a editar.')
      return
    }
    try {
      const url = editingProduct
        ? `/api/backpack-bot/products/${editingProduct.id}`
        : '/api/backpack-bot/products'
      const body = editingProduct
        ? {
            name: formData.name,
            description: formData.description,
            imageUrl: formData.imageUrl || null,
            useType: formData.useType,
            gender: formData.gender,
            sizes: formData.sizes,
            colors: formData.colors,
            price: Number(formData.price),
            stock: Number(formData.stock),
            isActive: formData.isActive
          }
        : {
            name: formData.name,
            description: formData.description,
            imageUrl: formData.imageUrl || null,
            useType: formData.useType,
            gender: formData.gender,
            sizes: formData.sizes,
            colors: formData.colors,
            price: Number(formData.price),
            stock: Number(formData.stock)
          }
      const response = await fetch(url, {
        method: editingProduct ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      const responseData = await response.json().catch(() => ({}))
      if (response.ok) {
        setShowForm(false)
        setEditingProduct(null)
        setFormData({
          name: '',
          description: '',
          imageUrl: '',
          useType: 'school',
          gender: 'unisex',
          sizes: [],
          colors: [],
          price: 0,
          stock: 0,
          isActive: true
        })
        fetchProducts()
      } else {
        alert(responseData.error || `Error al guardar (${response.status})`)
      }
    } catch (error) {
      console.error('Error guardando producto:', error)
      alert('Error al guardar. Revisa la consola.')
    }
  }

  const handleEdit = (p: BackpackProduct) => {
    setEditingProduct(p)
    setFormData({
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl ?? '',
      useType: p.useType as 'school' | 'work',
      gender: p.gender as 'man' | 'woman' | 'unisex',
      sizes: parseSelection(p.sizes),
      colors: parseSelection(p.colors),
      price: p.price ?? 0,
      stock: p.stock,
      isActive: p.isActive
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return
    const token = getToken()
    if (!token) return
    try {
      const response = await fetch(`/api/backpack-bot/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) fetchProducts()
      else {
        const err = await response.json().catch(() => ({}))
        alert(err.error || 'Error al eliminar')
      }
    } catch (error) {
      console.error('Error eliminando:', error)
      alert('Error al eliminar')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const token = getToken()
    if (!token) return
    setUploadingImage(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/backpack-bot/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data.url) {
        setFormData(prev => ({ ...prev, imageUrl: data.url }))
      } else {
        alert(data.error || 'Error al subir la imagen')
      }
    } catch (err) {
      console.error(err)
      alert('Error al subir la imagen')
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  const parseSelection = (value: string | string[] | null | undefined): string[] => {
    if (Array.isArray(value)) return value
    if (!value) return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
    } catch {
      return []
    }
  }

  const toggleSelection = (field: 'sizes' | 'colors', value: string) => {
    setFormData((prev) => {
      const current = prev[field]
      return {
        ...prev,
        [field]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value]
      }
    })
  }

  const formatSelection = (value: string | string[] | null | undefined, options: { value: string; label: string }[]) => {
    const selected = parseSelection(value)
    if (selected.length === 0) return 'Sin configurar'
    return selected
      .map((item) => options.find((option) => option.value === item)?.label ?? item)
      .join(', ')
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingProduct(null)
    setFormData({
      name: '',
      description: '',
      imageUrl: '',
      useType: 'school',
      gender: 'unisex',
      sizes: [],
      colors: [],
      price: 0,
      stock: 0,
      isActive: true
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', color: '#000' }}>
        <p style={{ color: '#000' }}>Cargando productos...</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
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
          + Nuevo producto
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
            {editingProduct ? 'Editar producto' : 'Nuevo producto'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '500px', color: '#000' }}>
            <label style={{ color: '#000' }}>
              Nombre *
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              />
            </label>
            <label style={{ color: '#000' }}>
              Descripción *
              <textarea
                required
                rows={3}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              />
            </label>
            <label style={{ color: '#000' }}>
              Imagen del producto
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                  style={{ color: '#000', maxWidth: '280px' }}
                />
                {uploadingImage && <span style={{ fontSize: '13px', color: '#666' }}>Subiendo y optimizando…</span>}
                <span style={{ fontSize: '12px', color: '#666' }}>
                  Ruta o URL (opcional). Si subes archivo, se guarda como ruta relativa (ej. /uploads/products/…), que también es válida.
                </span>
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="/uploads/products/… o https://..."
                  value={formData.imageUrl}
                  onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
                />
                {formData.imageUrl && (
                  <div style={{ marginTop: '4px' }}>
                    <img
                      src={formData.imageUrl.startsWith('/') ? formData.imageUrl : formData.imageUrl}
                      alt="Vista previa"
                      style={{ maxWidth: '160px', maxHeight: '120px', objectFit: 'contain', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                  </div>
                )}
              </div>
            </label>
            <label style={{ color: '#000' }}>
              Uso
              <select
                value={formData.useType}
                onChange={e => setFormData({ ...formData, useType: e.target.value as 'school' | 'work' })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              >
                {USE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={{ color: '#000' }}>
              Género
              <select
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value as 'man' | 'woman' | 'unisex' })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              >
                {GENDER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <div style={{ color: '#000' }}>
              <div style={{ marginBottom: '6px', fontWeight: 600 }}>Tamaños disponibles</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {SIZE_OPTIONS.map((option) => (
                  <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#000' }}>
                    <input
                      type="checkbox"
                      checked={formData.sizes.includes(option.value)}
                      onChange={() => toggleSelection('sizes', option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ color: '#000' }}>
              <div style={{ marginBottom: '6px', fontWeight: 600 }}>Colores disponibles</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {COLOR_OPTIONS.map((option) => (
                  <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#000' }}>
                    <input
                      type="checkbox"
                      checked={formData.colors.includes(option.value)}
                      onChange={() => toggleSelection('colors', option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ color: '#000' }}>
              Precio
              <input
                type="number"
                min={0}
                step={0.01}
                value={formData.price}
                onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              />
            </label>
            <label style={{ color: '#000' }}>
              Stock
              <input
                type="number"
                min={0}
                value={formData.stock}
                onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value, 10) || 0 })}
                style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              />
            </label>
            {editingProduct && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#000' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Activo
              </label>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {editingProduct ? 'Guardar' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                style={{
                  padding: '10px 20px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {products.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            No hay productos. Agrega mochilas para que el bot pueda mostrarlas.
          </div>
        ) : (
          <ResponsiveTableScroll minWidth={1100}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#000' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Nombre</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Uso</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Género</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Tamaños</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Colores</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#000' }}>Precio</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#000' }}>Stock</th>
                <th style={{ padding: '12px', textAlign: 'center', color: '#000' }}>Estado</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#000' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', color: '#000' }}>{p.name}</td>
                  <td style={{ padding: '12px', color: '#000' }}>{p.useType === 'school' ? 'Escuela' : 'Trabajo'}</td>
                  <td style={{ padding: '12px', color: '#000' }}>{p.gender === 'man' ? 'Hombre' : p.gender === 'woman' ? 'Mujer' : 'Unisex'}</td>
                  <td style={{ padding: '12px', color: '#000', maxWidth: '180px' }}>{formatSelection(p.sizes, SIZE_OPTIONS)}</td>
                  <td style={{ padding: '12px', color: '#000', maxWidth: '220px' }}>{formatSelection(p.colors, COLOR_OPTIONS)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#000' }}>
                    ${Number(p.price ?? 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#000' }}>{p.stock}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: p.isActive ? '#d1fae5' : '#fee2e2',
                      color: p.isActive ? '#065f46' : '#991b1b'
                    }}>
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#000' }}>
                    <button
                      type="button"
                      onClick={() => handleEdit(p)}
                      style={{ marginRight: '8px', padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #d1d5db', background: 'white' }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c' }}
                    >
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
