import { PatternMatcher } from '@/bot/pattern-matcher'
import { prisma } from '@/lib/prisma'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    dateFormat: {
      findMany: jest.fn(),
    },
    timeFormat: {
      findMany: jest.fn(),
    },
    appointmentPattern: {
      findMany: jest.fn(),
    },
    botResponse: {
      findMany: jest.fn(),
    },
  },
}))

const mockedPrisma = prisma as jest.Mocked<typeof prisma>

describe('PatternMatcher', () => {
  let patternMatcher: PatternMatcher

  beforeEach(() => {
    jest.clearAllMocks()
    patternMatcher = new PatternMatcher()

    // Mock data
    mockedPrisma.dateFormat.findMany.mockResolvedValue([
      {
        id: '1',
        format: 'dd/MM/yyyy',
        pattern: '(\\d{1,2})/(\\d{1,2})/(\\d{4})',
        example: '15/01/2024',
        priority: 10,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        format: 'dd-MM-yyyy',
        pattern: '(\\d{1,2})-(\\d{1,2})-(\\d{4})',
        example: '15-01-2024',
        priority: 9,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any)

    mockedPrisma.timeFormat.findMany.mockResolvedValue([
      {
        id: '1',
        format: 'HH:mm',
        pattern: '(\\d{1,2}):(\\d{2})',
        example: '10:00',
        priority: 10,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        format: 'h:mm a',
        pattern: '(\\d{1,2}):(\\d{2})\\s*(am|pm|AM|PM)',
        example: '10:00 am',
        priority: 7,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any)

    mockedPrisma.appointmentPattern.findMany.mockResolvedValue([
      {
        id: '1',
        pattern: 'agendar|solicitar|reservar',
        description: 'Solicitud de cita',
        priority: 10,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any)
  })

  describe('initialize', () => {
    it('should load patterns and formats from database', async () => {
      await patternMatcher.initialize()

      expect(mockedPrisma.dateFormat.findMany).toHaveBeenCalled()
      expect(mockedPrisma.timeFormat.findMany).toHaveBeenCalled()
      expect(mockedPrisma.appointmentPattern.findMany).toHaveBeenCalled()
    })
  })

  describe('isAppointmentRequest', () => {
    beforeEach(async () => {
      await patternMatcher.initialize()
    })

    it('should return true for appointment request patterns', () => {
      expect(patternMatcher.isAppointmentRequest('quiero agendar una cita')).toBe(true)
      expect(patternMatcher.isAppointmentRequest('solicitar cita')).toBe(true)
      expect(patternMatcher.isAppointmentRequest('reservar consulta')).toBe(true)
    })

    it('should return true for keyword matches', () => {
      expect(patternMatcher.isAppointmentRequest('necesito una cita')).toBe(true)
      expect(patternMatcher.isAppointmentRequest('quiero consulta')).toBe(true)
    })

    it('should return false for non-appointment messages', () => {
      expect(patternMatcher.isAppointmentRequest('hola')).toBe(false)
      expect(patternMatcher.isAppointmentRequest('gracias')).toBe(false)
    })
  })

  describe('parseDate', () => {
    beforeEach(async () => {
      await patternMatcher.initialize()
    })

    it('should parse DD/MM/YYYY format', () => {
      const result = patternMatcher.parseDate('15/01/2024')
      expect(result).not.toBeNull()
      expect(result?.date).toBeInstanceOf(Date)
    })

    it('should parse DD-MM-YYYY format', () => {
      const result = patternMatcher.parseDate('15-01-2024')
      expect(result).not.toBeNull()
      expect(result?.date).toBeInstanceOf(Date)
    })

    it('should handle "mañana" reference', () => {
      const result = patternMatcher.parseDate('quiero cita mañana')
      expect(result).not.toBeNull()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(result?.date.getDate()).toBe(tomorrow.getDate())
    })

    it('should handle day of week', () => {
      const result = patternMatcher.parseDate('cita para el lunes')
      expect(result).not.toBeNull()
      expect(result?.date).toBeInstanceOf(Date)
    })

    it('should return null for invalid date', () => {
      const result = patternMatcher.parseDate('fecha inválida')
      expect(result).toBeNull()
    })
  })

  describe('parseTime', () => {
    beforeEach(async () => {
      await patternMatcher.initialize()
    })

    it('should parse HH:mm format', () => {
      const result = patternMatcher.parseTime('10:00')
      expect(result).not.toBeNull()
      expect(result?.time).toBe('10:00')
    })

    it('should parse 12-hour format with am/pm', () => {
      const result = patternMatcher.parseTime('10:00 am')
      expect(result).not.toBeNull()
      expect(result?.time).toBe('10:00')
    })

    it('should parse 12-hour format with pm', () => {
      const result = patternMatcher.parseTime('2:00 pm')
      expect(result).not.toBeNull()
      expect(result?.time).toBe('14:00')
    })

    it('should handle "horas" format', () => {
      const result = patternMatcher.parseTime('10 horas')
      expect(result).not.toBeNull()
      expect(result?.time).toBe('10:00')
    })

    it('should return null for invalid time', () => {
      const result = patternMatcher.parseTime('hora inválida')
      expect(result).toBeNull()
    })
  })

  describe('getResponse', () => {
    beforeEach(async () => {
      mockedPrisma.botResponse.findMany.mockResolvedValue([
        {
          id: '1',
          trigger: 'hola|hi',
          response: '¡Hola! ¿En qué puedo ayudarte?',
          responseType: 'text',
          priority: 10,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any)
      await patternMatcher.initialize()
    })

    it('should return response for matching trigger', async () => {
      const response = await patternMatcher.getResponse('hola')
      expect(response).toBe('¡Hola! ¿En qué puedo ayudarte?')
    })

    it('should return null for non-matching trigger', async () => {
      const response = await patternMatcher.getResponse('adios')
      expect(response).toBeNull()
    })
  })
})
