import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentCard } from '@/modules/appointments/ui'

const mockAppointment = {
  id: 'apt-1',
  patientName: 'John Doe',
  phoneNumber: '+1234567890',
  date: '2024-01-15T10:00:00Z',
  time: '10:00',
  status: 'pending',
  notes: 'Test notes',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('AppointmentCard', () => {
  const mockOnUpdate = jest.fn()
  const mockOnDelete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockClear()
    localStorage.setItem('token', 'mock-token')
  })

  it('should render appointment information', () => {
    render(
      <AppointmentCard
        appointment={mockAppointment}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText(/\+1234567890/)).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('Test notes')).toBeInTheDocument()
  })

  it('should show edit form when edit button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <AppointmentCard
        appointment={mockAppointment}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: /editar/i }))

    expect(screen.getByText(/editar cita/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument()
  })

  it('should update appointment when form is submitted', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockAppointment, patientName: 'Jane Doe' }),
    })

    render(
      <AppointmentCard
        appointment={mockAppointment}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: /editar/i }))
    await waitFor(() => {
      expect(screen.getByText(/editar cita/i)).toBeInTheDocument()
    })
    const nameInput = screen.getByDisplayValue('John Doe')
    await user.clear(nameInput)
    await user.type(nameInput, 'Jane Doe')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/appointments/apt-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-token',
        },
        body: expect.stringContaining('Jane Doe'),
      })
      expect(mockOnUpdate).toHaveBeenCalledTimes(1)
    })
  })

  it('should delete appointment when delete button is clicked and confirmed', async () => {
    const user = userEvent.setup()
    window.confirm = jest.fn(() => true)
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Cita eliminada exitosamente' }),
    })

    render(
      <AppointmentCard
        appointment={mockAppointment}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: /eliminar/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/appointments/apt-1', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer mock-token',
        },
      })
      expect(mockOnDelete).toHaveBeenCalledTimes(1)
    })
  })

  it('should not delete appointment when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    window.confirm = jest.fn(() => false)

    render(
      <AppointmentCard
        appointment={mockAppointment}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: /eliminar/i }))

    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockOnDelete).not.toHaveBeenCalled()
  })

  it('should display correct status badge', () => {
    const { rerender } = render(
      <AppointmentCard
        appointment={{ ...mockAppointment, status: 'confirmed' }}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText(/confirmada/i)).toBeInTheDocument()

    rerender(
      <AppointmentCard
        appointment={{ ...mockAppointment, status: 'cancelled' }}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText(/cancelada/i)).toBeInTheDocument()
  })
})
