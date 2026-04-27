import { Client, Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { prisma } from '../lib/prisma'
import { format, parse, addDays, isBefore, isAfter, setHours, setMinutes } from 'date-fns'
import { es } from 'date-fns/locale/es'
import { PatternMatcher } from './pattern-matcher'
import { checkDayAvailability, isTimeSlotAvailable, findNextAvailableSlots, getBusinessHours, normalizeTime } from '../lib/availability'
import { createWhatsAppClient } from '../shared/whatsapp'

type BotState = 
  | 'idle'                    // Estado inicial, esperando acción del usuario
  | 'waiting_for_date_time'   // Esperando fecha y hora para agendar
  | 'selecting_available_slot' // Esperando que el usuario elija entre opciones de citas disponibles
  | 'canceling_appointment'   // Esperando número de cita a cancelar
  | 'reagending_appointment'  // Esperando número de cita a reagendar
  | 'reagending_new_date'     // Esperando nueva fecha/hora para reagendar
  | 'confirming_appointment'   // Esperando número de cita a confirmar

interface UserSession {
  phoneNumber: string
  state: BotState
  context?: {
    waitingForDate?: boolean
    appointments?: any[]
    selectedAppointment?: any
    [key: string]: any
  }
  lastMessage?: string
  createdAt: Date
  updatedAt: Date
}

class WhatsAppBot {
  private client: Client
  private isReady: boolean = false
  private patternMatcher: PatternMatcher
  private userSessions: Map<string, UserSession> = new Map()

  constructor() {
    this.client = createWhatsAppClient('.wwebjs_auth')

    this.patternMatcher = new PatternMatcher()
    this.setupEventHandlers()
  }

  private async getSession(phoneNumber: string): Promise<UserSession> {
    // Primero intentar obtener de memoria
    if (this.userSessions.has(phoneNumber)) {
      return this.userSessions.get(phoneNumber)!
    }

      // Si no está en memoria, crear nueva sesión
      // Por ahora el estado se mantiene solo en memoria
      // En el futuro se puede extender para persistir en BD

    // Crear nueva sesión
    const newSession: UserSession = {
      phoneNumber,
      state: 'idle',
      context: {},
      createdAt: new Date(),
      updatedAt: new Date()
    }
    this.userSessions.set(phoneNumber, newSession)
    await this.saveSession(newSession)
    return newSession
  }

  private async saveSession(session: UserSession) {
    try {
      session.updatedAt = new Date()
      // Por ahora solo guardamos que la sesión está activa
      // El estado se mantiene en memoria (Map)
      // En el futuro se puede extender el schema para guardar estado y contexto
      await prisma.botSession.upsert({
        where: { phoneNumber: session.phoneNumber },
        update: {
          isActive: true,
          updatedAt: session.updatedAt
        },
        create: {
          phoneNumber: session.phoneNumber,
          isActive: true
        }
      })
    } catch (error) {
      console.error('Error guardando sesión:', error)
    }
  }

  private async clearSession(phoneNumber: string) {
    this.userSessions.delete(phoneNumber)
    try {
      await prisma.botSession.update({
        where: { phoneNumber },
        data: { isActive: false }
      })
    } catch (error) {
      console.error('Error limpiando sesión:', error)
    }
  }

  private async updateSessionState(phoneNumber: string, state: BotState, context?: any) {
    const session = await this.getSession(phoneNumber)
    session.state = state
    if (context) {
      session.context = { ...session.context, ...context }
    }
    session.updatedAt = new Date()
    this.userSessions.set(phoneNumber, session)
    await this.saveSession(session)
  }

  private setupEventHandlers() {
    this.client.on('qr', (qr) => {
      console.log('Escanea este código QR con WhatsApp:')
      qrcode.generate(qr, { small: true })
    })

    this.client.on('ready', async () => {
      console.log('Bot de WhatsApp está listo!')
      await this.patternMatcher.initialize()
      console.log('Patrones y formatos cargados correctamente')
      this.isReady = true
    })

    this.client.on('authenticated', () => {
      console.log('Autenticado correctamente')
    })

    this.client.on('auth_failure', (msg) => {
      console.error('Error de autenticación:', msg)
    })

    this.client.on('message', async (message: Message) => {
      await this.handleMessage(message)
    })
  }

  private async handleMessage(message: Message) {
    // Ignorar mensajes propios (eco del bot)
    if (message.fromMe) {
      console.log(`[DEBUG] Ignorando mensaje propio: "${message.body}"`)
      return
    }

    const contact = await message.getContact()
    const phoneNumber = contact.number
    const body = message.body.trim()
    const lowerBody = body.toLowerCase()

    // Ignorar mensajes de grupos y estados
    if (message.from === 'status@broadcast' || message.from.endsWith('@g.us')) {
      return
    }

    try {
      const session = await this.getSession(phoneNumber)
      console.log(`[STATE] Usuario: ${phoneNumber}, Estado: ${session.state}, Mensaje: "${body}"`)

      // MÁQUINA DE ESTADOS - Procesar según el estado actual
      switch (session.state) {
        case 'waiting_for_date_time':
          // El usuario está esperando proporcionar fecha y hora para agendar
          await this.handleDateTimeInput(message, phoneNumber, body, session)
          return

        case 'reagending_new_date':
          // El usuario está proporcionando nueva fecha/hora para reagendar
          await this.handleReagendarNewDateInput(message, phoneNumber, body, session)
          return

        case 'selecting_available_slot':
          // El usuario está eligiendo entre opciones de citas disponibles
          const slotNumber = this.parseNumberSelection(body)
          console.log(`[DEBUG] selecting_available_slot - Número parseado: ${slotNumber}, Mensaje: "${body}"`)
          if (slotNumber !== null) {
            console.log(`[DEBUG] Procesando selección de slot número ${slotNumber}`)
            await this.handleAvailableSlotSelection(message, phoneNumber, slotNumber, session)
            return
          }
          // Si no es un número, verificar si quiere volver al menú principal
          if (lowerBody === 'hola' || lowerBody === 'hi' || lowerBody === 'inicio' || lowerBody.includes('buenos días') || lowerBody.includes('buenas tardes') || lowerBody.includes('buenas noches')) {
            await this.clearSession(phoneNumber)
            await this.sendWelcomeMessage(message, phoneNumber)
            return
          }
          // Si no es un número ni "hola", pedir que elija una opción numérica
          await message.reply(
            '❌ Por favor, responde con el *número* de la opción que prefieres (1, 2, 3, etc.), o escribe *hola* para volver al menú principal.'
          )
          return

        case 'canceling_appointment':
        case 'reagending_appointment':
        case 'confirming_appointment':
          // El usuario está seleccionando una cita por número
          const number = this.parseNumberSelection(body)
          if (number !== null) {
            await this.handleNumberSelection(message, phoneNumber, number, session)
            return
          }
          break

        case 'idle':
        default:
          // Estado inicial, procesar comandos normales
          break
      }

      // Si llegamos aquí, el usuario no está en un flujo específico o el mensaje no coincide con el estado
      // Verificar si es un número para selección del menú principal
      const number = this.parseNumberSelection(body)
      if (number !== null && session.state === 'idle') {
        await this.handleNumberSelection(message, phoneNumber, number, session)
        return
      }

      // Si el usuario está en estado idle, procesar comandos normales
      if (session.state === 'idle') {
        if (lowerBody === 'hola' || lowerBody === 'hi' || lowerBody === 'inicio' || lowerBody.includes('buenos días') || lowerBody.includes('buenas tardes') || lowerBody.includes('buenas noches')) {
          await this.sendWelcomeMessage(message, phoneNumber)
        } else if (lowerBody === 'mis citas' || lowerBody === 'citas' || lowerBody.includes('mis citas')) {
          await this.sendUserAppointments(message, phoneNumber)
          await this.clearSession(phoneNumber)
        } else if (this.matchesCommandIntent(lowerBody, ['cancelar', 'cancelar cita', 'cancelar una cita', 'quiero cancelar', 'necesito cancelar'])) {
          await this.handleCancelAppointment(message, phoneNumber)
        } else if (this.matchesCommandIntent(lowerBody, ['reagendar', 'reagendar cita', 'reprogramar', 'reprogramar cita', 'quiero reagendar', 'quiero reprogramar'])) {
          await this.handleReagendarAppointment(message, phoneNumber)
        } else if (this.matchesCommandIntent(lowerBody, ['confirmar', 'confirmar cita', 'confirmar asistencia', 'quiero confirmar'])) {
          await this.handleConfirmAppointment(message, phoneNumber)
        } else if (lowerBody === 'ayuda' || lowerBody === 'help' || lowerBody.includes('ayuda') || lowerBody.includes('comandos')) {
          await this.sendHelpMessage(message)
          await this.clearSession(phoneNumber)
        } else if (this.patternMatcher.isAppointmentRequest(message.body)) {
          await this.handleAppointmentRequest(message, phoneNumber)
          if (this.userSessions.get(phoneNumber)?.state !== 'selecting_available_slot') {
            await this.clearSession(phoneNumber)
          }
        } else if (lowerBody !== 'hola' && lowerBody !== 'hi' && !lowerBody.includes('buenos días') && !lowerBody.includes('buenas tardes') && !lowerBody.includes('buenas noches')) {
          const customResponse = await this.patternMatcher.getResponse(message.body)
          if (customResponse) {
            await message.reply(customResponse)
            await this.clearSession(phoneNumber)
            return
          }

          await this.sendDefaultResponse(message)
          await this.clearSession(phoneNumber)
        } else {
          await this.sendDefaultResponse(message)
          await this.clearSession(phoneNumber)
        }
      } else {
        // Si el usuario está en un flujo pero el mensaje no coincide, mostrar ayuda
        await message.reply('No entendí tu mensaje. Por favor, sigue las instrucciones del flujo actual o escribe *hola* para volver al menú principal.')
      }
    } catch (error) {
      console.error('Error procesando mensaje:', error)
      await message.reply('Lo siento, ocurrió un error. Por favor intenta más tarde.')
      this.clearSession(phoneNumber)
    }
  }

  private parseNumberSelection(text: string): number | null {
    // Extraer el primer número del texto
    const match = text.match(/^(\d+)/)
    if (match) {
      const num = parseInt(match[1])
      if (num > 0 && num <= 10) { // Limitar a opciones del 1 al 10
        return num
      }
    }
    return null
  }

  private matchesCommandIntent(text: string, commands: string[]): boolean {
    const normalized = text.trim().replace(/\s+/g, ' ')
    return commands.some(command => normalized === command || normalized.startsWith(`${command} `))
  }

  private async handleNumberSelection(message: Message, phoneNumber: string, number: number, session: UserSession) {
    if (session.state === 'canceling_appointment' && session.context?.appointments) {
      const appointments = session.context.appointments
      if (number > 0 && number <= appointments.length) {
        const appointment = appointments[number - 1]
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: 'cancelled' }
        })
        await message.reply('✅ Tu cita ha sido cancelada exitosamente.')
        await this.clearSession(phoneNumber)
        await this.sendWelcomeMessage(message, phoneNumber)
        return
      } else {
        await message.reply(`❌ Número inválido. Por favor, elige un número entre 1 y ${appointments.length}.`)
        return
      }
    }

    if (session.state === 'reagending_appointment' && session.context?.appointments) {
      const appointments = session.context.appointments
      if (number > 0 && number <= appointments.length) {
        await this.updateSessionState(phoneNumber, 'reagending_new_date', { selectedAppointment: appointments[number - 1] })
        await message.reply(
          `📅 Has seleccionado la cita del ${format(appointments[number - 1].date, "dd/MM/yyyy")} a las ${appointments[number - 1].time}.\n\n` +
          `Por favor, proporciona la nueva fecha y hora.\n` +
          `Ejemplo: *15/01/2024 10:00* o *mañana a las 2pm*`
        )
        return
      } else {
        await message.reply(`❌ Número inválido. Por favor, elige un número entre 1 y ${appointments.length}.`)
        return
      }
    }

    if (session.state === 'confirming_appointment' && session.context?.appointments) {
      const appointments = session.context.appointments
      if (number > 0 && number <= appointments.length) {
        const appointment = appointments[number - 1]
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: 'confirmed' }
        })
        await message.reply('✅ Tu asistencia ha sido confirmada. Te esperamos en la fecha y hora acordada.')
        await this.clearSession(phoneNumber)
        await this.sendWelcomeMessage(message, phoneNumber)
        return
      } else {
        await message.reply(`❌ Número inválido. Por favor, elige un número entre 1 y ${appointments.length}.`)
        return
      }
    }

    // Manejar selección del menú principal (solo en estado idle)
    if (session.state === 'idle') {
      switch (number) {
        case 1:
          await this.updateSessionState(phoneNumber, 'waiting_for_date_time', { waitingForDate: true })
          await message.reply(
            '📅 *Agendar Cita*\n\n' +
            'Por favor, proporciona la fecha y hora que deseas.\n\n' +
            '*Ejemplos:*\n' +
            '• 15/01/2024 10:00\n' +
            '• Mañana a las 2pm\n' +
            '• Lunes a las 10 horas\n' +
            '• 20-01-2024 15:30\n\n' +
            'También puedes escribir solo la fecha (ej: *15/01/2024*) y luego la hora.'
          )
          break
        case 2:
          await this.sendUserAppointments(message, phoneNumber)
          await this.clearSession(phoneNumber)
          break
        case 3:
          await this.handleCancelAppointment(message, phoneNumber)
          break
        case 4:
          await this.handleReagendarAppointment(message, phoneNumber)
          break
        case 5:
          await this.handleConfirmAppointment(message, phoneNumber)
          break
        case 6:
          await this.sendHelpMessage(message)
          await this.clearSession(phoneNumber)
          break
        default:
          await message.reply('❌ Opción inválida. Por favor, elige un número del 1 al 6.')
      }
    }
  }

  private async handleDateTimeInput(message: Message, phoneNumber: string, body: string, session: UserSession) {
    console.log(`[STATE] handleDateTimeInput - Mensaje: "${body}"`)
    
    // Intentar parsear fecha y hora del mensaje
    let parsedDate = this.patternMatcher.parseDate(body)
    let parsedTime = this.patternMatcher.parseTime(body)
    
    // Verificar si el mensaje contiene un patrón de fecha (dd/mm/yyyy o dd-mm-yyyy)
    const datePattern = body.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    const timePattern = body.match(/(\d{1,2}):(\d{2})/)
    
    console.log(`[DEBUG] Fecha parseada: ${parsedDate ? parsedDate.date.toISOString() : 'No'}, Hora parseada: ${parsedTime ? parsedTime.time : 'No'}`)
    console.log(`[DEBUG] Patrón de fecha: ${datePattern ? 'Sí' : 'No'}, Patrón de hora: ${timePattern ? 'Sí' : 'No'}`)
    
    // Si tiene fecha parseada, patrón de fecha, o patrón de hora, procesar como solicitud de cita
    if (parsedDate || parsedTime || datePattern || timePattern) {
      console.log(`[DEBUG] Procesando solicitud de cita desde handleDateTimeInput`)
      await this.handleAppointmentRequest(message, phoneNumber)
      if (this.userSessions.get(phoneNumber)?.state === 'selecting_available_slot') {
        return
      }
      await this.clearSession(phoneNumber)
      // Mostrar menú principal después de agendar
      await this.sendWelcomeMessage(message, phoneNumber)
    } else {
      // Si no se pudo parsear, pedir que proporcione fecha/hora válida
      await message.reply(
        '❌ No pude entender la fecha y hora. Por favor, proporciona la información en uno de estos formatos:\n\n' +
        '*Ejemplos:*\n' +
        '• 15/01/2024 10:00\n' +
        '• 05/06/2026 14:30\n' +
        '• Mañana a las 2pm\n' +
        '• Lunes a las 10 horas'
      )
    }
  }

  private async handleAvailableSlotSelection(message: Message, phoneNumber: string, number: number, session: UserSession) {
    const suggestedSlotsRaw = session.context?.suggestedSlots as Array<{ date: Date | string, time: string }>
    
    if (!suggestedSlotsRaw || suggestedSlotsRaw.length === 0) {
      await message.reply('❌ Error: No se encontraron opciones disponibles. Por favor, intenta de nuevo.')
      await this.clearSession(phoneNumber)
      await this.sendWelcomeMessage(message, phoneNumber)
      return
    }
    
    // Asegurarse de que las fechas sean objetos Date
    const suggestedSlots = suggestedSlotsRaw.map(slot => ({
      date: slot.date instanceof Date ? slot.date : new Date(slot.date),
      time: slot.time
    }))
    
    const totalOptions = suggestedSlots.length + 1 // +1 para la opción de fecha personalizada
    
    if (number > 0 && number <= suggestedSlots.length) {
      // El usuario seleccionó una de las opciones de horarios disponibles
      const selectedSlot = suggestedSlots[number - 1]
      
      // Validar que la fecha sea válida
      if (isNaN(selectedSlot.date.getTime())) {
        await message.reply('❌ Error: La fecha seleccionada no es válida. Por favor, intenta de nuevo.')
        await this.clearSession(phoneNumber)
        await this.sendWelcomeMessage(message, phoneNumber)
        return
      }
      
      // Verificar disponibilidad una vez más antes de agendar
      const isAvailable = await isTimeSlotAvailable(selectedSlot.date, selectedSlot.time)
      if (!isAvailable) {
        await message.reply('❌ Lo siento, ese horario ya no está disponible. Por favor, elige otra opción o escribe una nueva fecha y hora.')
        return
      }
      
      // Crear la cita con el slot seleccionado
      const contact = await message.getContact()
      const patientName = contact.pushname || contact.number || 'Paciente'
      
      const appointment = await prisma.appointment.create({
        data: {
          patientName,
          phoneNumber,
          date: selectedSlot.date,
          time: selectedSlot.time,
          status: 'pending'
        }
      })
      
      const formattedDate = format(selectedSlot.date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
      
      await message.reply(
        `✅ *Cita agendada exitosamente*\n\n` +
        `📅 Fecha: ${formattedDate}\n` +
        `🕐 Hora: ${selectedSlot.time}\n` +
        `👤 Paciente: ${patientName}\n\n` +
        `Tu cita está pendiente de confirmación. Te notificaremos cuando sea confirmada.\n\n` +
        `ID de cita: ${appointment.id.substring(0, 8)}`
      )
      
      await this.clearSession(phoneNumber)
      await this.sendWelcomeMessage(message, phoneNumber)
    } else if (number === totalOptions) {
      // El usuario seleccionó la opción de escribir fecha personalizada
      await this.updateSessionState(phoneNumber, 'waiting_for_date_time', { waitingForDate: true })
      await message.reply(
        `📅 *Escribir fecha y hora personalizada*\n\n` +
        `Por favor, proporciona la fecha y hora que deseas.\n\n` +
        `*Ejemplos:*\n` +
        `• 15/01/2024 10:00\n` +
        `• Mañana a las 2pm\n` +
        `• Lunes a las 10 horas\n` +
        `• 20-01-2024 15:30`
      )
    } else {
      await message.reply(`❌ Número inválido. Por favor, elige un número entre 1 y ${totalOptions}.`)
    }
  }

  private async handleReagendarNewDateInput(message: Message, phoneNumber: string, body: string, session: UserSession) {
    const selectedAppointment = session.context?.selectedAppointment
    if (!selectedAppointment) {
      await message.reply('❌ Error: No se encontró la cita a reagendar. Por favor, intenta de nuevo.')
      await this.clearSession(phoneNumber)
      return
    }

    const parsedDate = this.patternMatcher.parseDate(body)
    const parsedTime = this.patternMatcher.parseTime(body)
    
    if (parsedDate || parsedTime) {
      const wasRescheduled = await this.handleReagendarWithNewDate(message, phoneNumber, selectedAppointment, parsedDate, parsedTime)
      if (wasRescheduled) {
        await this.clearSession(phoneNumber)
        await this.sendWelcomeMessage(message, phoneNumber)
      }
    } else {
      await message.reply(
        '❌ No pude entender la nueva fecha y hora. Por favor, proporciona la información en uno de estos formatos:\n\n' +
        '*Ejemplos:*\n' +
        '• 15/01/2024 10:00\n' +
        '• Mañana a las 2pm'
      )
    }
  }

  private async sendWelcomeMessage(message: Message, phoneNumber: string) {
    await this.updateSessionState(phoneNumber, 'idle', {})
    
    const welcomeText = `👋 ¡Hola! Bienvenido al sistema de agendamiento de citas de psicología.

*Selecciona una opción escribiendo el número:*

1️⃣ *Agendar una cita*
2️⃣ *Ver mis citas programadas*
3️⃣ *Cancelar una cita*
4️⃣ *Reagendar una cita*
5️⃣ *Confirmar asistencia*
6️⃣ *Ayuda / Comandos*

*Ejemplo:* Responde con *1* para agendar una cita.`
    
    await message.reply(welcomeText)
  }

  private async sendHelpMessage(message: Message) {
    // Cargar formatos desde la base de datos
    const dateFormats = await prisma.dateFormat.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
      take: 5
    })

    const timeFormats = await prisma.timeFormat.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
      take: 5
    })

    let helpText = `📚 *Ayuda - Comandos disponibles:*

*Puedes usar números o texto:*

*Opciones numeradas:*
1️⃣ Agendar una cita
2️⃣ Ver mis citas
3️⃣ Cancelar una cita
4️⃣ Reagendar una cita
5️⃣ Confirmar asistencia
6️⃣ Ayuda

*Comandos de texto:*
• *hola* - Iniciar conversación
• *agendar* o *cita* - Agendar una nueva cita
• *mis citas* - Ver tus citas programadas
• *cancelar* - Cancelar una cita
• *reagendar* - Reagendar una cita
• *confirmar* - Confirmar asistencia
• *ayuda* - Mostrar esta ayuda

*Formatos de fecha aceptados:*
`

    dateFormats.forEach(df => {
      helpText += `• ${df.example || 'N/A'}\n`
    })

    helpText += `\n*Formatos de hora aceptados:*\n`

    timeFormats.forEach(tf => {
      helpText += `• ${tf.example || 'N/A'}\n`
    })

    helpText += `\n*Ejemplos de solicitud:*
• *1* o *agendar 15/01/2024 10:00*
• *quiero una cita mañana a las 2 pm*
• *reservar cita para el lunes a las 10 horas*
• *necesito una consulta el 20-01-2024 a las 15:30*`

    await message.reply(helpText)
  }

  private async sendDefaultResponse(message: Message) {
    await message.reply(
      'No entendí tu mensaje. Escribe *ayuda* para ver los comandos disponibles o *hola* para comenzar.'
    )
  }

  private async handleAppointmentRequest(message: Message, phoneNumber: string) {
    const body = message.body.trim()
    
    console.log(`[DEBUG] handleAppointmentRequest - Mensaje: "${body}"`)
    
    // Usar el pattern matcher para extraer fecha y hora
    let parsedDate = this.patternMatcher.parseDate(body)
    let parsedTime = this.patternMatcher.parseTime(body)
    
    // Si no se pudo parsear la fecha, intentar parsear manualmente el formato dd/mm/yyyy
    if (!parsedDate) {
      const dateMatch = body.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
      if (dateMatch) {
        const day = parseInt(dateMatch[1])
        const month = parseInt(dateMatch[2]) - 1 // Los meses en JS son 0-indexed
        let year = parseInt(dateMatch[3])
        
        // Si el año tiene 2 dígitos, convertirlo a 4
        if (year < 100) {
          year += year < 50 ? 2000 : 1900
        }
        
        const manualDate = new Date(year, month, day)
        if (!isNaN(manualDate.getTime())) {
          parsedDate = { date: manualDate, format: 'dd/MM/yyyy' }
          console.log(`[DEBUG] Fecha parseada manualmente: ${manualDate.toISOString()}`)
        }
      }
    }
    
    // Si no se pudo parsear la hora, intentar parsear manualmente el formato HH:mm
    if (!parsedTime) {
      const timeMatch = body.match(/(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        const hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          parsedTime = { time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`, format: 'HH:mm' }
          console.log(`[DEBUG] Hora parseada manualmente: ${parsedTime.time}`)
        }
      }
    }
    
    if (!parsedDate) {
      const errorResponse = await this.patternMatcher.getResponse('error.*fecha')
      await message.reply(
        errorResponse || 
        '❌ No pude entender la fecha. Por favor, proporciona la fecha en uno de estos formatos:\n' +
        '• 15/01/2024\n' +
        '• 15-01-2024\n' +
        '• 15 de enero de 2024\n' +
        '• mañana\n' +
        '• lunes\n\n' +
        'Ejemplo: *agendar 15/01/2024 10:00*'
      )
      return
    }

    let appointmentDate: Date = parsedDate.date
    let appointmentTime: string = parsedTime?.time || '10:00'
    const normalizedAppointmentTime = normalizeTime(appointmentTime)
    if (!normalizedAppointmentTime) {
      await message.reply('❌ No pude entender la hora. Por favor, usa un formato como *10:00* o *14:30*.')
      return
    }
    appointmentTime = normalizedAppointmentTime
    
    console.log(`[DEBUG] Fecha final: ${appointmentDate.toISOString()}, Hora final: ${appointmentTime}`)

    try {

      // Validar que la fecha no sea en el pasado
      const now = new Date()
      if (isBefore(appointmentDate, now)) {
        await message.reply('❌ No puedes agendar una cita en el pasado. Por favor, elige una fecha futura.')
        return
      }

      // Obtener horarios de atención configurados
      const businessHours = await getBusinessHours()
      const [hours, minutes] = appointmentTime.split(':').map(Number)
      const [startHour, startMin] = businessHours.startTime.split(':').map(Number)
      const [endHour, endMin] = businessHours.endTime.split(':').map(Number)
      
      // Validar que esté dentro del horario de atención
      const timeMinutes = hours * 60 + minutes
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      
      if (timeMinutes < startMinutes || timeMinutes >= endMinutes) {
        await message.reply(`❌ El horario de atención es de ${businessHours.startTime} a ${businessHours.endTime} horas.`)
        return
      }

      // Verificar disponibilidad del día
      const availability = await checkDayAvailability(appointmentDate, appointmentTime)
      
      // Si el día está completamente lleno o es día no laborable
      if (availability.isFull) {
        // Verificar si es día no laborable
        const businessHours = await getBusinessHours()
        const dateStr = format(appointmentDate, 'yyyy-MM-dd')
        const isNonWorking = businessHours.nonWorkingDays.some(nwd => {
          const nwdStr = format(new Date(nwd.date), 'yyyy-MM-dd')
          return nwdStr === dateStr
        })
        
        if (isNonWorking) {
          // Buscar próximas citas disponibles en días laborables
          const nextSlots = await findNextAvailableSlots(appointmentDate, appointmentTime, 14)
          
          if (nextSlots.length > 0) {
            const session = await this.getSession(phoneNumber)
            // Serializar fechas como ISO strings para guardar en contexto
            const suggestedSlots = nextSlots.map(slot => ({
              date: slot.date.toISOString(),
              time: slot.time
            }))
            
            await this.updateSessionState(phoneNumber, 'selecting_available_slot', { 
              suggestedSlots: suggestedSlots,
              originalDate: appointmentDate.toISOString(),
              originalTime: appointmentTime
            })
            
            console.log(`[DEBUG] Estado actualizado a selecting_available_slot con ${suggestedSlots.length} opciones`)
            
            let response = `❌ Lo siento, ese día no es laborable.\n\n`
            response += `📅 *Citas disponibles más cercanas:*\n\n`
            
            nextSlots.forEach((slot, index) => {
              const formattedDate = format(slot.date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
              response += `${index + 1}️⃣ ${formattedDate} a las ${slot.time}\n`
            })
            
            // Agregar tercera opción para fecha personalizada
            response += `${nextSlots.length + 1}️⃣ Escribir otra fecha y hora\n\n`
            response += `*Responde con el número* de la opción que prefieres (ej: *1*).`
            
            await message.reply(response)
            return
          } else {
            await message.reply(
              `❌ Lo siento, ese día no es laborable y no hay citas disponibles en los próximos días.\n` +
              `Por favor, intenta con otra fecha.`
            )
            return
          }
        } else {
          // El día está lleno (no es día no laborable, solo está ocupado)
          const nextSlots = await findNextAvailableSlots(appointmentDate, appointmentTime, 7)
          
          if (nextSlots.length > 0) {
            const session = await this.getSession(phoneNumber)
            // Serializar fechas como ISO strings para guardar en contexto
            const suggestedSlots = nextSlots.map(slot => ({
              date: slot.date.toISOString(),
              time: slot.time
            }))
            
            await this.updateSessionState(phoneNumber, 'selecting_available_slot', { 
              suggestedSlots: suggestedSlots,
              originalDate: appointmentDate.toISOString(),
              originalTime: appointmentTime
            })
            
            console.log(`[DEBUG] Estado actualizado a selecting_available_slot con ${suggestedSlots.length} opciones`)
            
            let response = `❌ Lo siento, ese día ya está completamente lleno.\n\n`
            response += `📅 *Citas disponibles más cercanas:*\n\n`
            
            nextSlots.forEach((slot, index) => {
              const formattedDate = format(slot.date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
              response += `${index + 1}️⃣ ${formattedDate} a las ${slot.time}\n`
            })
            
            // Agregar tercera opción para fecha personalizada
            response += `${nextSlots.length + 1}️⃣ Escribir otra fecha y hora\n\n`
            response += `*Responde con el número* de la opción que prefieres (ej: *1*).`
            
            await message.reply(response)
            return
          } else {
            await message.reply(
              `❌ Lo siento, ese día ya está completamente lleno y no hay citas disponibles en los próximos días.\n` +
              `Por favor, intenta con otra fecha.`
            )
            return
          }
        }
      }
      
      // Verificar si el horario específico está disponible
      const isAvailable = await isTimeSlotAvailable(appointmentDate, appointmentTime)
      
      if (!isAvailable) {
        // El horario específico está ocupado, pero hay otros disponibles
        if (availability.suggestedSlots.length > 0) {
          const session = await this.getSession(phoneNumber)
          // Serializar fechas como ISO strings para guardar en contexto
          const suggestedSlots = availability.suggestedSlots.map(slot => ({
            date: appointmentDate.toISOString(),
            time: slot.time
          }))
          
          await this.updateSessionState(phoneNumber, 'selecting_available_slot', { 
            suggestedSlots: suggestedSlots,
            originalDate: appointmentDate.toISOString(),
            originalTime: appointmentTime
          })
          
          console.log(`[DEBUG] Estado actualizado a selecting_available_slot con ${suggestedSlots.length} opciones (mismo día)`)
          
          let response = `❌ Lo siento, ese horario ya está ocupado.\n\n`
          response += `📅 *Horarios disponibles ese mismo día:*\n\n`
          
          availability.suggestedSlots.forEach((slot, index) => {
            response += `${index + 1}️⃣ ${slot.time}\n`
          })
          
          // Agregar tercera opción para fecha personalizada
          response += `${availability.suggestedSlots.length + 1}️⃣ Escribir otra fecha y hora\n\n`
          response += `*Responde con el número* de la opción que prefieres (ej: *1*).`
          
          await message.reply(response)
          return
        } else {
          await message.reply(
            `❌ Lo siento, ese horario ya está ocupado.\n` +
            `Por favor, elige otro horario disponible.`
          )
          return
        }
      }

      // Obtener nombre del contacto
      const contact = await message.getContact()
      const patientName = contact.pushname || contact.number || 'Paciente'

      // Crear la cita
      const appointment = await prisma.appointment.create({
        data: {
          patientName,
          phoneNumber,
          date: appointmentDate,
          time: appointmentTime,
          status: 'pending'
        }
      })

      const formattedDate = format(appointmentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
      
      console.log(`[SUCCESS] Cita agendada exitosamente - ID: ${appointment.id}, Fecha: ${formattedDate}, Hora: ${appointmentTime}`)
      
      await message.reply(
        `✅ *Cita agendada exitosamente*\n\n` +
        `📅 Fecha: ${formattedDate}\n` +
        `🕐 Hora: ${appointmentTime}\n` +
        `👤 Paciente: ${patientName}\n\n` +
        `Tu cita está pendiente de confirmación. Te notificaremos cuando sea confirmada.\n\n` +
        `ID de cita: ${appointment.id.substring(0, 8)}`
      )

    } catch (error) {
      console.error('Error agendando cita:', error)
      const errorResponse = await this.patternMatcher.getResponse('error.*fecha')
      await message.reply(
        errorResponse || 
        '❌ Error al procesar tu solicitud. Por favor, verifica el formato y vuelve a intentar.\n\n' +
        'Formatos aceptados:\n' +
        '• Fecha: 15/01/2024, 15-01-2024, 15 de enero de 2024, mañana, lunes\n' +
        '• Hora: 10:00, 10:00 am, 10 horas'
      )
    }
  }

  private async sendUserAppointments(message: Message, phoneNumber: string) {
    const appointments = await prisma.appointment.findMany({
      where: {
        phoneNumber,
        status: {
          in: ['pending', 'confirmed']
        }
      },
      orderBy: {
        date: 'asc'
      }
    })

    if (appointments.length === 0) {
      await message.reply('No tienes citas programadas.')
      return
    }

    let response = `📋 *Tus citas programadas:*\n\n`
    
    appointments.forEach((apt, index) => {
      const formattedDate = format(apt.date, "dd/MM/yyyy", { locale: es })
      const statusEmoji = apt.status === 'confirmed' ? '✅' : '⏳'
      response += `${index + 1}. ${statusEmoji} ${formattedDate} a las ${apt.time}\n`
      response += `   Estado: ${apt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}\n`
      response += `   ID: ${apt.id.substring(0, 8)}\n\n`
    })

    await message.reply(response)
  }

  private async handleCancelAppointment(message: Message, phoneNumber: string) {
    const appointments = await prisma.appointment.findMany({
      where: {
        phoneNumber,
        status: {
          in: ['pending', 'confirmed']
        }
      },
      orderBy: {
        date: 'asc'
      }
    })

    if (appointments.length === 0) {
      await message.reply('ℹ️ No tienes citas para cancelar.')
      this.clearSession(phoneNumber)
      return
    }

    if (appointments.length === 1) {
      // Si solo hay una cita, cancelarla directamente
      await prisma.appointment.update({
        where: { id: appointments[0].id },
        data: { status: 'cancelled' }
      })
      
      await message.reply('✅ Tu cita ha sido cancelada exitosamente.')
      this.clearSession(phoneNumber)
      return
    }

    // Si hay múltiples citas, pedir que especifique con número
    await this.updateSessionState(phoneNumber, 'canceling_appointment', { appointments })

    let response = `❌ *Cancelar Cita*\n\nTienes ${appointments.length} citas. Por favor, responde con el *número* de la cita que deseas cancelar:\n\n`
    
    appointments.forEach((apt, index) => {
      const formattedDate = format(apt.date, "dd/MM/yyyy", { locale: es })
      const statusEmoji = apt.status === 'confirmed' ? '✅' : '⏳'
      response += `${index + 1}. ${statusEmoji} ${formattedDate} a las ${apt.time}\n`
      response += `   Estado: ${apt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}\n\n`
    })

    response += `*Ejemplo:* Responde con *1* para cancelar la primera cita.`

    await message.reply(response)
  }

  private async handleReagendarAppointment(message: Message, phoneNumber: string) {
    const appointments = await prisma.appointment.findMany({
      where: {
        phoneNumber,
        status: {
          in: ['pending', 'confirmed']
        }
      },
      orderBy: {
        date: 'asc'
      }
    })

    if (appointments.length === 0) {
      await message.reply('ℹ️ No tienes citas para reagendar.')
      this.clearSession(phoneNumber)
      return
    }

    if (appointments.length === 1) {
      await this.updateSessionState(phoneNumber, 'reagending_new_date', { selectedAppointment: appointments[0] })
      
      await message.reply(
        `🔄 *Reagendar Cita*\n\n` +
        `Cita actual: ${format(appointments[0].date, "dd/MM/yyyy")} a las ${appointments[0].time}\n\n` +
        `Por favor, proporciona la nueva fecha y hora.\n` +
        `*Ejemplo:* *15/01/2024 10:00* o *mañana a las 2pm*`
      )
      return
    }

    // Si hay múltiples citas, pedir que especifique con número
    await this.updateSessionState(phoneNumber, 'reagending_appointment', { appointments })

    let response = `🔄 *Reagendar Cita*\n\nTienes ${appointments.length} citas. Por favor, responde con el *número* de la cita que deseas reagendar:\n\n`
    
    appointments.forEach((apt, index) => {
      const formattedDate = format(apt.date, "dd/MM/yyyy", { locale: es })
      const statusEmoji = apt.status === 'confirmed' ? '✅' : '⏳'
      response += `${index + 1}. ${statusEmoji} ${formattedDate} a las ${apt.time}\n`
      response += `   Estado: ${apt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}\n\n`
    })

    response += `*Ejemplo:* Responde con *1* para reagendar la primera cita.`

    await message.reply(response)
  }

  private async handleConfirmAppointment(message: Message, phoneNumber: string) {
    const appointments = await prisma.appointment.findMany({
      where: {
        phoneNumber,
        status: 'pending'
      },
      orderBy: {
        date: 'asc'
      }
    })

    if (appointments.length === 0) {
      await message.reply('ℹ️ No tienes citas pendientes de confirmar.')
      this.clearSession(phoneNumber)
      return
    }

    if (appointments.length === 1) {
      await prisma.appointment.update({
        where: { id: appointments[0].id },
        data: { status: 'confirmed' }
      })
      await message.reply('✅ Tu asistencia ha sido confirmada. Te esperamos en la fecha y hora acordada.')
      this.clearSession(phoneNumber)
      return
    }

    // Si hay múltiples citas, pedir que especifique con número
    await this.updateSessionState(phoneNumber, 'confirming_appointment', { appointments })

    let response = `✅ *Confirmar Asistencia*\n\nTienes ${appointments.length} citas pendientes. Por favor, responde con el *número* de la cita que deseas confirmar:\n\n`
    
    appointments.forEach((apt, index) => {
      const formattedDate = format(apt.date, "dd/MM/yyyy", { locale: es })
      response += `${index + 1}. ⏳ ${formattedDate} a las ${apt.time}\n\n`
    })

    response += `*Ejemplo:* Responde con *1* para confirmar la primera cita.`

    await message.reply(response)
  }

  private async handleReagendarWithNewDate(
    message: Message,
    phoneNumber: string,
    oldAppointment: any,
    parsedDate: any,
    parsedTime: any
  ): Promise<boolean> {
    if (!parsedDate) {
      await message.reply(
        '❌ No pude entender la fecha. Por favor, proporciona la fecha en uno de estos formatos:\n' +
        '• 15/01/2024\n' +
        '• 15-01-2024\n' +
        '• mañana\n' +
        '• lunes\n\n' +
        'Ejemplo: *15/01/2024 10:00*'
      )
      return false
    }

    let newDate: Date = parsedDate.date
    let newTime: string = parsedTime?.time || oldAppointment.time
    const normalizedNewTime = normalizeTime(newTime)
    if (!normalizedNewTime) {
      await message.reply('❌ No pude entender la hora. Por favor, usa un formato como *10:00* o *14:30*.')
      return false
    }
    newTime = normalizedNewTime

    try {
      // Validar que la fecha no sea en el pasado
      const now = new Date()
      if (isBefore(newDate, now)) {
        await message.reply('❌ No puedes reagendar una cita al pasado. Por favor, elige una fecha futura.')
        return false
      }

      // Obtener horarios de atención configurados
      const businessHours = await getBusinessHours()
      const [hours, minutes] = newTime.split(':').map(Number)
      const [startHour, startMin] = businessHours.startTime.split(':').map(Number)
      const [endHour, endMin] = businessHours.endTime.split(':').map(Number)
      
      // Validar que esté dentro del horario de atención
      const timeMinutes = hours * 60 + minutes
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      
      if (timeMinutes < startMinutes || timeMinutes >= endMinutes) {
        await message.reply(`❌ El horario de atención es de ${businessHours.startTime} a ${businessHours.endTime} horas.`)
        return false
      }

      // Verificar disponibilidad (excluyendo la cita actual)
      const isAvailable = await isTimeSlotAvailable(newDate, newTime, {
        excludeAppointmentId: oldAppointment.id
      })
      
      if (!isAvailable) {
        // Verificar si es día no laborable
        const dateStr = format(newDate, 'yyyy-MM-dd')
        const isNonWorking = businessHours.nonWorkingDays.some(nwd => {
          const nwdStr = format(new Date(nwd.date), 'yyyy-MM-dd')
          return nwdStr === dateStr
        })
        
        if (isNonWorking) {
          await message.reply(
            `❌ Lo siento, ese día no es laborable.\n` +
            `Por favor, elige otro día disponible.`
          )
          return false
        }
        
        // Verificar si el horario está ocupado
        const dayStart = new Date(newDate)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayEnd.getDate() + 1)
        const existingAppointments = await prisma.appointment.findMany({
          where: {
            date: {
              gte: dayStart,
              lt: dayEnd
            },
            status: {
              in: ['pending', 'confirmed']
            },
            id: {
              not: oldAppointment.id
            }
          }
        })
        const existingAppointment = existingAppointments.find(appointment => {
          return normalizeTime(appointment.time) === normalizedNewTime
        })
        
        if (existingAppointment) {
          await message.reply(
            `❌ Lo siento, ese horario ya está ocupado.\n` +
            `Por favor, elige otro horario disponible.`
          )
          return false
        }
        
        // Si no está ocupado pero no está disponible, puede ser por periodo de descanso
        await message.reply(
          `❌ Lo siento, ese horario no está disponible (puede estar en un periodo de descanso).\n` +
          `Por favor, elige otro horario disponible.`
        )
        return false
      }

      // Actualizar la cita
      await prisma.appointment.update({
        where: { id: oldAppointment.id },
        data: {
          date: newDate,
          time: newTime,
          status: 'pending' // Resetear a pendiente cuando se reagenda
        }
      })

      const formattedDate = format(newDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
      
      await message.reply(
        `✅ *Cita reagendada exitosamente*\n\n` +
        `📅 Nueva fecha: ${formattedDate}\n` +
        `🕐 Nueva hora: ${newTime}\n\n` +
        `Tu cita ha sido actualizada y está pendiente de confirmación.`
      )

      return true

    } catch (error) {
      console.error('Error reagendando cita:', error)
      await message.reply(
        '❌ Error al procesar tu solicitud. Por favor, verifica el formato y vuelve a intentar.\n\n' +
        'Formatos aceptados:\n' +
        '• Fecha: 15/01/2024, 15-01-2024, 15 de enero de 2024, mañana, lunes\n' +
        '• Hora: 10:00, 10:00 am, 10 horas'
      )
      return false
    }
  }

  public async start() {
    try {
      await this.client.initialize()
    } catch (error) {
      console.error('Error iniciando el bot:', error)
      throw error
    }
  }

  public async stop() {
    try {
      await this.client.destroy()
      this.isReady = false
    } catch (error) {
      console.error('Error deteniendo el bot:', error)
    }
  }

  public getClient() {
    return this.client
  }

  public isBotReady() {
    return this.isReady
  }

  public async reloadPatterns() {
    await this.patternMatcher.initialize()
    console.log('Patrones recargados correctamente')
  }
}

// Singleton instance
let botInstance: WhatsAppBot | null = null

export function getBotInstance(): WhatsAppBot {
  if (!botInstance) {
    botInstance = new WhatsAppBot()
  }
  return botInstance
}

// Iniciar el bot si se ejecuta directamente
if (require.main === module) {
  const bot = getBotInstance()
  bot.start().catch(console.error)
}

export default WhatsAppBot
