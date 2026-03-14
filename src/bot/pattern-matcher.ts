import { prisma } from '../lib/prisma'
import { parse, format, isValid } from 'date-fns'
import { es } from 'date-fns/locale/es'

interface ParsedDate {
  date: Date
  format: string
}

interface ParsedTime {
  time: string
  format: string
}

export class PatternMatcher {
  private dateFormats: Array<{ format: string; pattern: RegExp; priority: number }> = []
  private timeFormats: Array<{ format: string; pattern: RegExp; priority: number }> = []
  private appointmentPatterns: Array<{ pattern: RegExp; priority: number }> = []

  async initialize() {
    // Cargar formatos de fecha
    const dateFormats = await prisma.dateFormat.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' }
    })

    this.dateFormats = dateFormats.map(df => ({
      format: df.format,
      pattern: new RegExp(df.pattern, 'i'),
      priority: df.priority
    }))

    // Cargar formatos de hora
    const timeFormats = await prisma.timeFormat.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' }
    })

    this.timeFormats = timeFormats.map(tf => ({
      format: tf.format,
      pattern: new RegExp(tf.pattern, 'i'),
      priority: tf.priority
    }))

    // Cargar patrones de solicitud
    const appointmentPatterns = await prisma.appointmentPattern.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' }
    })

    this.appointmentPatterns = appointmentPatterns.map(ap => ({
      pattern: new RegExp(ap.pattern, 'i'),
      priority: ap.priority
    }))
  }

  isAppointmentRequest(text: string): boolean {
    const lowerText = text.toLowerCase()
    
    // Verificar patrones de solicitud
    for (const { pattern } of this.appointmentPatterns) {
      if (pattern.test(lowerText)) {
        return true
      }
    }

    // Verificar palabras clave comunes
    const keywords = ['agendar', 'cita', 'consulta', 'reservar', 'solicitar', 'pedir cita']
    return keywords.some(keyword => lowerText.includes(keyword))
  }

  parseDate(text: string): ParsedDate | null {
    // Intentar con cada formato en orden de prioridad
    for (const { format: dateFormat, pattern } of this.dateFormats) {
      const match = text.match(pattern)
      if (match) {
        try {
          let parsedDate: Date | null = null

          // Manejar diferentes formatos
          if (dateFormat.includes('MMMM') || dateFormat.includes('MMM')) {
            // Formato con nombre de mes
            const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                              'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
            const monthIndex = monthNames.findIndex(m => 
              match[0].toLowerCase().includes(m.toLowerCase())
            )
            
            if (monthIndex !== -1) {
              const day = parseInt(match[1])
              const year = parseInt(match[3] || match[2] || new Date().getFullYear().toString())
              parsedDate = new Date(year, monthIndex, day)
            }
          } else if (dateFormat === 'dd/MM/yyyy' || dateFormat === 'dd-MM-yyyy') {
            const day = parseInt(match[1])
            const month = parseInt(match[2]) - 1
            const year = parseInt(match[3])
            parsedDate = new Date(year, month, day)
          } else if (dateFormat === 'yyyy-MM-dd') {
            const year = parseInt(match[1])
            const month = parseInt(match[2]) - 1
            const day = parseInt(match[3])
            parsedDate = new Date(year, month, day)
          } else if (dateFormat === 'dd/MM/yy') {
            const day = parseInt(match[1])
            const month = parseInt(match[2]) - 1
            let year = parseInt(match[3])
            // Convertir año de 2 dígitos
            if (year < 50) year += 2000
            else year += 1900
            parsedDate = new Date(year, month, day)
          } else {
            // Intentar parsear con date-fns
            parsedDate = parse(match[0], dateFormat, new Date())
          }

          if (parsedDate && isValid(parsedDate)) {
            return { date: parsedDate, format: dateFormat }
          }
        } catch (error) {
          continue
        }
      }
    }

    // Manejar referencias temporales
    const now = new Date()
    const lowerText = text.toLowerCase()

    if (lowerText.includes('mañana') || lowerText.includes('manana')) {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return { date: tomorrow, format: 'mañana' }
    }

    if (lowerText.includes('pasado mañana')) {
      const dayAfterTomorrow = new Date(now)
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
      return { date: dayAfterTomorrow, format: 'pasado mañana' }
    }

    // Días de la semana
    const daysOfWeek = {
      'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0
    }

    for (const [dayName, dayOffset] of Object.entries(daysOfWeek)) {
      if (lowerText.includes(dayName)) {
        const targetDate = new Date(now)
        const currentDay = now.getDay()
        let daysToAdd = dayOffset - currentDay
        if (daysToAdd <= 0) daysToAdd += 7 // Próxima semana
        targetDate.setDate(targetDate.getDate() + daysToAdd)
        return { date: targetDate, format: dayName }
      }
    }

    return null
  }

  parseTime(text: string): ParsedTime | null {
    // Intentar con cada formato en orden de prioridad
    for (const { format: timeFormat, pattern } of this.timeFormats) {
      const match = text.match(pattern)
      if (match) {
        try {
          let hours = 0
          let minutes = 0

          if (timeFormat === 'HH:mm' || timeFormat === 'H:mm') {
            hours = parseInt(match[1])
            minutes = parseInt(match[2])
          } else if (timeFormat === 'HHmm') {
            hours = parseInt(match[1])
            minutes = parseInt(match[2])
          } else if (timeFormat === 'h:mm a' || timeFormat === 'h a') {
            hours = parseInt(match[1])
            minutes = match[2] ? parseInt(match[2]) : 0
            const ampm = match[3]?.toLowerCase() || match[2]?.toLowerCase()
            if (ampm === 'pm' && hours !== 12) hours += 12
            if (ampm === 'am' && hours === 12) hours = 0
          } else if (timeFormat === 'H horas') {
            hours = parseInt(match[1])
            minutes = 0
          } else if (timeFormat === 'H:00') {
            hours = parseInt(match[1])
            minutes = 0
          }

          if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
            return { time: timeString, format: timeFormat }
          }
        } catch (error) {
          continue
        }
      }
    }

    // Manejar horas en texto
    const hourMatch = text.match(/(\d{1,2})\s*(horas?|h|hs)/i)
    if (hourMatch) {
      const hours = parseInt(hourMatch[1])
      if (hours >= 0 && hours <= 23) {
        return { time: `${hours.toString().padStart(2, '0')}:00`, format: 'text' }
      }
    }

    return null
  }

  async getResponse(trigger: string): Promise<string | null> {
    const responses = await prisma.botResponse.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' }
    })

    for (const response of responses) {
      const pattern = new RegExp(response.trigger, 'i')
      if (pattern.test(trigger)) {
        return response.response
      }
    }

    return null
  }
}
