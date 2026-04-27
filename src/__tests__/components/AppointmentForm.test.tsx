import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentForm } from '@/modules/appointments/ui'

describe('AppointmentForm', () => {
  const mockOnSuccess = jest.fn()
  const mockOnCancel = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockClear()
    localStorage.setItem('token', 'mock-token')
  })

  it('should render all form fields', () => {
    render(<AppointmentForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    expect(screen.getByText(/nombre del paciente/i)).toBeInTheDocument()
    expect(screen.getByText(/número de teléfono/i)).toBeInTheDocument()
    expect(screen.getByText(/fecha/i)).toBeInTheDocument()
    expect(screen.getByText(/hora/i)).toBeInTheDocument()
    expect(screen.getByText(/estado/i)).toBeInTheDocument()
    expect(screen.getByText(/notas/i)).toBeInTheDocument()
  })

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    render(<AppointmentForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(mockOnCancel).toHaveBeenCalledTimes(1)
  })

  it('should create appointment on successful submit', async () => {
    const user = userEvent.setup()
    const mockAppointment = {
      id: 'apt-1',
      patientName: 'John Doe',
      phoneNumber: '+1234567890',
      date: '2024-01-15',
      time: '10:00',
      status: 'pending',
    }

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAppointment,
    })

    render(<AppointmentForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const textInputs = screen.getAllByRole('textbox')
    const patientInput = textInputs[0]
    const phoneInput = document.querySelector('input[type="tel"]') || textInputs[1]
    const dateInput = document.querySelector('input[type="date"]')
    const timeInput = document.querySelector('input[type="time"]')
    
    await user.type(patientInput, 'John Doe')
    if (phoneInput) await user.type(phoneInput as HTMLElement, '+1234567890')
    if (dateInput) await user.type(dateInput as HTMLElement, '2024-01-15')
    if (timeInput) await user.type(timeInput as HTMLElement, '10:00')
    await user.click(screen.getByRole('button', { name: /crear cita/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token',
        },
        body: expect.stringContaining('John Doe'),
      })
      expect(mockOnSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it('should show error message when creation fails', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Error al crear la cita' }),
    })

    render(<AppointmentForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const textInputs = screen.getAllByRole('textbox')
    const patientInput = textInputs[0]
    const phoneInput = document.querySelector('input[type="tel"]') || textInputs[1]
    const dateInput = document.querySelector('input[type="date"]')
    const timeInput = document.querySelector('input[type="time"]')
    
    await user.type(patientInput, 'John Doe')
    if (phoneInput) await user.type(phoneInput as HTMLElement, '+1234567890')
    if (dateInput) await user.type(dateInput as HTMLElement, '2024-01-15')
    if (timeInput) await user.type(timeInput as HTMLElement, '10:00')
    await user.click(screen.getByRole('button', { name: /crear cita/i }))

    await waitFor(() => {
      expect(screen.getByText('Error al crear la cita')).toBeInTheDocument()
    })
  })

  it('should show loading state while submitting', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 100)
        )
    )

    render(<AppointmentForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const textInputs = screen.getAllByRole('textbox')
    const patientInput = textInputs[0]
    const phoneInput = document.querySelector('input[type="tel"]') || textInputs[1]
    const dateInput = document.querySelector('input[type="date"]')
    const timeInput = document.querySelector('input[type="time"]')
    
    await user.type(patientInput, 'John Doe')
    if (phoneInput) await user.type(phoneInput as HTMLElement, '+1234567890')
    if (dateInput) await user.type(dateInput as HTMLElement, '2024-01-15')
    if (timeInput) await user.type(timeInput as HTMLElement, '10:00')
    await user.click(screen.getByRole('button', { name: /crear cita/i }))

    expect(screen.getByText(/creando/i)).toBeInTheDocument()
  })

  it('should require all mandatory fields', () => {
    render(<AppointmentForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

    const textInputs = screen.getAllByRole('textbox')
    const patientNameInput = textInputs[0]
    const phoneInput = document.querySelector('input[type="tel"]')
    const dateInput = document.querySelector('input[type="date"]')
    const timeInput = document.querySelector('input[type="time"]')

    expect(patientNameInput).toBeRequired()
    if (phoneInput) expect(phoneInput).toBeRequired()
    if (dateInput) expect(dateInput).toBeRequired()
    if (timeInput) expect(timeInput).toBeRequired()
  })
})
