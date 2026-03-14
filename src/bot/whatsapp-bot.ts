import { Client, LocalAuth, Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { prisma } from '../lib/prisma'
import { format, parse, addDays, isBefore, isAfter, setHours, setMinutes } from 'date-fns'
import { es } from 'date-fns/locale/es'

class WhatsAppBot {
  private client: Client
  private isReady: boolean = false

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: '.wwebjs_auth'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    this.client.on('qr', (qr) => {
      console.log('Escanea este código QR con WhatsApp:')
      qrcode.generate(qr, { small: true })
    })

    this.client.on('ready', () => {
      console.log('Bot de WhatsApp está listo!')
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
    const contact = await message.getContact()
    const phoneNumber = contact.number
    const body = message.body.toLowerCase().trim()

    // Ignorar mensajes de grupos y estados
    if (message.from === 'status@broadcast' || message.isGroupMsg) {
      return
    }

    try {
      // Comandos del bot
      if (body === 'hola' || body === 'hi' || body === 'inicio') {
        await this.sendWelcomeMessage(message)
      } else if (body.startsWith('agendar') || body.startsWith('cita')) {
        await this.handleAppointmentRequest(message, phoneNumber)
      } else if (body === 'mis citas' || body === 'citas') {
        await this.sendUserAppointments(message, phoneNumber)
      } else if (body === 'cancelar') {
        await this.handleCancelAppointment(message, phoneNumber)
      } else if (body === 'ayuda' || body === 'help') {
        await this.sendHelpMessage(message)
      } else {
        await this.sendDefaultResponse(message)
      }
    } catch (error) {
      console.error('Error procesando mensaje:', error)
      await message.reply('Lo siento, ocurrió un error. Por favor intenta más tarde.')
    }
  }

  private async sendWelcomeMessage(message: Message) {
    const welcomeText = `👋 ¡Hola! Bienvenido al sistema de agendamiento de citas de psicología.

Puedo ayudarte a:
📅 Agendar una cita
📋 Ver tus citas programadas
❌ Cancelar una cita

Escribe *ayuda* para ver todos los comandos disponibles.`
    
    await message.reply(welcomeText)
  }

  private async sendHelpMessage(message: Message) {
    const helpText = `📚 *Comandos disponibles:*

• *hola* - Iniciar conversación
• *agendar* o *cita* - Agendar una nueva cita
• *mis citas* - Ver tus citas programadas
• *cancelar* - Cancelar una cita
• *ayuda* - Mostrar esta ayuda

Para agendar una cita, escribe:
*agendar* seguido de la fecha y hora deseada.
Ejemplo: *agendar 15/01/2024 10:00*`
    
    await message.reply(helpText)
  }

  private async sendDefaultResponse(message: Message) {
    await message.reply(
      'No entendí tu mensaje. Escribe *ayuda* para ver los comandos disponibles o *hola* para comenzar.'
    )
  }

  private async handleAppointmentRequest(message: Message, phoneNumber: string) {
    const body = message.body.trim()
    
    // Intentar extraer fecha y hora del mensaje
    const dateMatch = body.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    const timeMatch = body.match(/(\d{1,2}):(\d{2})/)
    
    if (!dateMatch) {
      await message.reply(
        'Por favor, proporciona la fecha en formato DD/MM/YYYY.\n' +
        'Ejemplo: *agendar 15/01/2024 10:00*\n\n' +
        'O responde con solo la fecha y hora que deseas.'
      )
      return
    }

    const [, day, month, year] = dateMatch
    let appointmentDate: Date
    let appointmentTime: string = '10:00'

    try {
      appointmentDate = parse(`${day}/${month}/${year}`, 'dd/MM/yyyy', new Date())
      
      if (timeMatch) {
        const [, hours, minutes] = timeMatch
        appointmentTime = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
      }

      // Validar que la fecha no sea en el pasado
      const now = new Date()
      if (isBefore(appointmentDate, now)) {
        await message.reply('❌ No puedes agendar una cita en el pasado. Por favor, elige una fecha futura.')
        return
      }

      // Validar horario (ejemplo: 9:00 - 18:00)
      const [hours, minutes] = appointmentTime.split(':').map(Number)
      const appointmentDateTime = setMinutes(setHours(appointmentDate, hours), minutes)
      
      if (hours < 9 || hours > 18) {
        await message.reply('❌ El horario de atención es de 9:00 a 18:00 horas.')
        return
      }

      // Verificar disponibilidad
      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          date: appointmentDate,
          time: appointmentTime,
          status: {
            in: ['pending', 'confirmed']
          }
        }
      })

      if (existingAppointment) {
        await message.reply(
          `❌ Lo siento, ese horario ya está ocupado.\n` +
          `Por favor, elige otro horario disponible.`
        )
        return
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
      await message.reply('❌ Error al procesar tu solicitud. Por favor, verifica el formato de la fecha (DD/MM/YYYY) y vuelve a intentar.')
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
      await message.reply('No tienes citas para cancelar.')
      return
    }

    if (appointments.length === 1) {
      // Si solo hay una cita, cancelarla directamente
      await prisma.appointment.update({
        where: { id: appointments[0].id },
        data: { status: 'cancelled' }
      })
      
      await message.reply('✅ Tu cita ha sido cancelada exitosamente.')
      return
    }

    // Si hay múltiples citas, pedir que especifique
    let response = `Tienes ${appointments.length} citas. Por favor, responde con el número de la cita que deseas cancelar:\n\n`
    
    appointments.forEach((apt, index) => {
      const formattedDate = format(apt.date, "dd/MM/yyyy", { locale: es })
      response += `${index + 1}. ${formattedDate} a las ${apt.time}\n`
    })

    await message.reply(response)
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
