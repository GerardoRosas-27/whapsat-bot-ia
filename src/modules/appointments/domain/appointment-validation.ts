import { isTimeSlotAvailable, normalizeTime } from '@/lib/availability'

export const VALID_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const

export type AppointmentStatus = (typeof VALID_APPOINTMENT_STATUSES)[number]

export async function validateAppointmentDateTime(input: {
  date: unknown
  time: unknown
  status?: unknown
}): Promise<
  | { ok: true; date: Date; time: string; status: AppointmentStatus }
  | { ok: false; error: string }
> {
  const date = new Date(String(input.date))
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Fecha inválida' }
  }

  const time = typeof input.time === 'string' ? normalizeTime(input.time) : null
  if (!time) {
    return { ok: false, error: 'Hora inválida. Usa formato HH:mm' }
  }

  const status = (input.status || 'pending') as AppointmentStatus
  if (!VALID_APPOINTMENT_STATUSES.includes(status)) {
    return { ok: false, error: 'Estado de cita inválido' }
  }

  if (status === 'pending' || status === 'confirmed') {
    const isAvailable = await isTimeSlotAvailable(date, time)
    if (!isAvailable) {
      return { ok: false, error: 'El horario no está disponible' }
    }
  }

  return { ok: true, date, time, status }
}
