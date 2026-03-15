import { prisma } from './prisma'
import { format, addDays, setHours, setMinutes, isBefore, isAfter, startOfDay, set } from 'date-fns'

interface TimeSlot {
  time: string
  available: boolean
}

interface AvailabilityResult {
  isFull: boolean
  availableSlots: TimeSlot[]
  suggestedSlots: TimeSlot[]
}

/**
 * Obtiene los horarios de atención configurados
 */
export async function getBusinessHours() {
  const hours = await prisma.businessHours.findFirst({
    where: { isActive: true },
    include: {
      restPeriods: {
        where: { isActive: true },
        orderBy: { startTime: 'asc' }
      },
      nonWorkingDays: {
        where: { isActive: true }
      }
    }
  })

  // Valores por defecto si no hay configuración
  if (!hours) {
    return {
      startTime: '08:00',
      endTime: '18:00',
      appointmentDuration: 60,
      restPeriods: [],
      nonWorkingDays: []
    }
  }

  return {
    startTime: hours.startTime,
    endTime: hours.endTime,
    appointmentDuration: hours.appointmentDuration,
    restPeriods: hours.restPeriods.map(rp => ({
      startTime: rp.startTime,
      endTime: rp.endTime,
      description: rp.description
    })),
    nonWorkingDays: hours.nonWorkingDays.map(nwd => ({
      date: nwd.date,
      description: nwd.description
    }))
  }
}

/**
 * Verifica si una fecha es día no laborable
 */
async function isNonWorkingDay(date: Date): Promise<boolean> {
  const businessHours = await getBusinessHours()
  const dateStr = format(date, 'yyyy-MM-dd')
  
  return businessHours.nonWorkingDays.some(nwd => {
    const nwdStr = format(new Date(nwd.date), 'yyyy-MM-dd')
    return nwdStr === dateStr
  })
}

/**
 * Genera todos los slots de tiempo disponibles para un día
 */
function generateTimeSlots(startTime: string, endTime: string, duration: number, restPeriods: Array<{ startTime: string, endTime: string }>): string[] {
  const slots: string[] = []
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)
  
  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin
  
  for (let minutes = startMinutes; minutes + duration <= endMinutes; minutes += duration) {
    const slotHour = Math.floor(minutes / 60)
    const slotMin = minutes % 60
    const slotTime = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`
    
    // Verificar si el slot está en un periodo de descanso
    const isInRestPeriod = restPeriods.some(restPeriod => {
      const [restStartHour, restStartMin] = restPeriod.startTime.split(':').map(Number)
      const [restEndHour, restEndMin] = restPeriod.endTime.split(':').map(Number)
      const restStartMinutes = restStartHour * 60 + restStartMin
      const restEndMinutes = restEndHour * 60 + restEndMin
      
      return minutes >= restStartMinutes && minutes < restEndMinutes
    })
    
    if (!isInRestPeriod) {
      slots.push(slotTime)
    }
  }
  
  return slots
}

/**
 * Verifica la disponibilidad de un día específico
 */
export async function checkDayAvailability(date: Date, requestedTime?: string): Promise<AvailabilityResult> {
  const businessHours = await getBusinessHours()
  
  // Verificar si es día no laborable
  const isNonWorking = await isNonWorkingDay(date)
  if (isNonWorking) {
    return {
      isFull: true,
      availableSlots: [],
      suggestedSlots: []
    }
  }
  
  // Preparar periodos de descanso
  const restPeriods = businessHours.restPeriods.map(rp => ({
    startTime: rp.startTime,
    endTime: rp.endTime
  }))
  
  // Generar todos los slots disponibles del día
  const allSlots = generateTimeSlots(
    businessHours.startTime,
    businessHours.endTime,
    businessHours.appointmentDuration,
    restPeriods
  )
  
  // Obtener citas del día (comparar solo la fecha, no la hora)
  const dayStart = startOfDay(date)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  
  const appointments = await prisma.appointment.findMany({
    where: {
      date: {
        gte: dayStart,
        lt: dayEnd
      },
      status: {
        in: ['pending', 'confirmed']
      }
    }
  })
  
  // Normalizar las fechas de las citas para comparar solo el día
  const appointmentsByDate = appointments.map(apt => {
    const aptDate = new Date(apt.date)
    return {
      ...apt,
      dateOnly: format(aptDate, 'yyyy-MM-dd')
    }
  })
  
  const requestedDateOnly = format(date, 'yyyy-MM-dd')
  
  // Crear set de horarios ocupados (solo del día solicitado)
  const occupiedTimes = new Set(
    appointmentsByDate
      .filter(apt => apt.dateOnly === requestedDateOnly)
      .map(apt => apt.time)
  )
  
  // Verificar disponibilidad de cada slot
  const availableSlots: TimeSlot[] = allSlots.map(slot => ({
    time: slot,
    available: !occupiedTimes.has(slot)
  }))
  
  // Filtrar solo los disponibles
  const freeSlots = availableSlots.filter(slot => slot.available)
  
  // Si hay un horario solicitado, encontrar los 2 más cercanos
  let suggestedSlots: TimeSlot[] = []
  if (requestedTime && freeSlots.length > 0) {
    const [reqHour, reqMin] = requestedTime.split(':').map(Number)
    const requestedMinutes = reqHour * 60 + reqMin
    
    // Ordenar por cercanía al horario solicitado
    const sortedSlots = [...freeSlots].sort((a, b) => {
      const [aHour, aMin] = a.time.split(':').map(Number)
      const [bHour, bMin] = b.time.split(':').map(Number)
      const aMinutes = aHour * 60 + aMin
      const bMinutes = bHour * 60 + bMin
      
      const diffA = Math.abs(aMinutes - requestedMinutes)
      const diffB = Math.abs(bMinutes - requestedMinutes)
      
      return diffA - diffB
    })
    
    suggestedSlots = sortedSlots.slice(0, 2)
  } else if (freeSlots.length > 0) {
    // Si no hay horario solicitado, tomar los primeros 2 disponibles
    suggestedSlots = freeSlots.slice(0, 2)
  }
  
  return {
    isFull: freeSlots.length === 0,
    availableSlots: availableSlots,
    suggestedSlots: suggestedSlots
  }
}

/**
 * Verifica si un horario específico está disponible
 */
export async function isTimeSlotAvailable(date: Date, time: string): Promise<boolean> {
  const businessHours = await getBusinessHours()
  
  // Verificar si es día no laborable
  const isNonWorking = await isNonWorkingDay(date)
  if (isNonWorking) {
    return false
  }
  
  // Verificar que esté dentro del horario de atención
  const [timeHour, timeMin] = time.split(':').map(Number)
  const [startHour, startMin] = businessHours.startTime.split(':').map(Number)
  const [endHour, endMin] = businessHours.endTime.split(':').map(Number)
  
  const timeMinutes = timeHour * 60 + timeMin
  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin
  
  if (timeMinutes < startMinutes || timeMinutes >= endMinutes) {
    return false
  }
  
  // Verificar que no esté en periodo de descanso
  for (const restPeriod of businessHours.restPeriods) {
    const [restStartHour, restStartMin] = restPeriod.startTime.split(':').map(Number)
    const [restEndHour, restEndMin] = restPeriod.endTime.split(':').map(Number)
    const restStartMinutes = restStartHour * 60 + restStartMin
    const restEndMinutes = restEndHour * 60 + restEndMin
    
    if (timeMinutes >= restStartMinutes && timeMinutes < restEndMinutes) {
      return false
    }
  }
  
  // Verificar que no haya otra cita en ese horario
  const dayStart = startOfDay(date)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  
  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      date: {
        gte: dayStart,
        lt: dayEnd
      },
      time: time,
      status: {
        in: ['pending', 'confirmed']
      }
    }
  })
  
  return !existingAppointment
}

/**
 * Busca las próximas citas disponibles en los siguientes días (solo días laborables)
 */
export async function findNextAvailableSlots(requestedDate: Date, requestedTime: string, maxDays: number = 7): Promise<Array<{ date: Date, time: string }>> {
  const slots: Array<{ date: Date, time: string }> = []
  let currentDate = new Date(requestedDate)
  let daysChecked = 0
  
  while (daysChecked < maxDays && slots.length < 2) {
    if (daysChecked > 0) {
      currentDate = addDays(currentDate, 1)
    }
    
    // Verificar si es día no laborable
    const isNonWorking = await isNonWorkingDay(currentDate)
    if (!isNonWorking) {
      const availability = await checkDayAvailability(currentDate, daysChecked === 0 ? requestedTime : undefined)
      
      if (availability.suggestedSlots.length > 0) {
        for (const slot of availability.suggestedSlots) {
          if (slots.length < 2) {
            slots.push({ date: new Date(currentDate), time: slot.time })
          }
        }
      }
    }
    
    daysChecked++
  }
  
  return slots
}
