import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from '@/components/LoginForm'
import { useRouter } from 'next/navigation'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

const mockPush = jest.fn()
const mockRouter = {
  push: mockPush,
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
}

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    localStorage.clear()
    ;(global.fetch as jest.Mock).mockClear()
    // Mock localStorage methods
    Storage.prototype.setItem = jest.fn()
    Storage.prototype.getItem = jest.fn()
    Storage.prototype.removeItem = jest.fn()
  })

  it('should render login form with username and password fields', () => {
    render(<LoginForm />)

    expect(screen.getByText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument()
  })

  it('should show error message when login fails', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Credenciales inválidas' }),
    })

    render(<LoginForm />)

    const usernameInput = screen.getAllByRole('textbox')[0]
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    await user.type(usernameInput, 'testuser')
    if (passwordInput) await user.type(passwordInput, 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument()
    })
  })

  it('should redirect to dashboard on successful login', async () => {
    const user = userEvent.setup()
    const mockToken = 'mock-jwt-token'
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: mockToken }),
    })

    render(<LoginForm />)

    const usernameInput = screen.getAllByRole('textbox')[0]
    const passwordInput = document.querySelector('input[type="password"]')
    await user.type(usernameInput, 'testuser')
    if (passwordInput) await user.type(passwordInput as HTMLElement, 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('token', mockToken)
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('should show loading state while submitting', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({ token: 'token' }) }), 100)
        )
    )

    render(<LoginForm />)

    const usernameInput = screen.getAllByRole('textbox')[0]
    const passwordInput = document.querySelector('input[type="password"]')
    await user.type(usernameInput, 'testuser')
    if (passwordInput) await user.type(passwordInput as HTMLElement, 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByText(/iniciando sesión/i)).toBeInTheDocument()
    })
  })

  it('should show connection error when fetch fails', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

    render(<LoginForm />)

    const usernameInput = screen.getAllByRole('textbox')[0]
    const passwordInput = document.querySelector('input[type="password"]')
    await user.type(usernameInput, 'testuser')
    if (passwordInput) await user.type(passwordInput as HTMLElement, 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByText(/error de conexión/i)).toBeInTheDocument()
    })
  })

  it('should require username and password fields', () => {
    render(<LoginForm />)

    const usernameInput = screen.getAllByRole('textbox')[0]
    const passwordInput = document.querySelector('input[type="password"]')

    expect(usernameInput).toBeRequired()
    if (passwordInput) expect(passwordInput).toBeRequired()
  })
})
