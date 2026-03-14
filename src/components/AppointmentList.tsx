'use client'

import AppointmentCard from './AppointmentCard'

interface Appointment {
  id: string
  patientName: string
  phoneNumber: string
  date: string
  time: string
  status: string
  notes?: string
  createdAt: string
  updatedAt: string
}

interface AppointmentListProps {
  appointments: Appointment[]
  onUpdate: () => void
  onDelete: () => void
}

export default function AppointmentList({ appointments, onUpdate, onDelete }: AppointmentListProps) {
  if (appointments.length === 0) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <p style={{ color: '#666', fontSize: '16px' }}>
          No hay citas para mostrar
        </p>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
      gap: '20px'
    }}>
      {appointments.map((appointment) => (
        <AppointmentCard
          key={appointment.id}
          appointment={appointment}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
