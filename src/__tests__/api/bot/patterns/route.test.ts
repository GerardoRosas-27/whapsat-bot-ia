import { GET, POST } from '@/app/api/bot/patterns/route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    appointmentPattern: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    dateFormat: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    timeFormat: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    botResponse: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth')

const mockedPrisma = prisma as jest.Mocked<typeof prisma>
const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>

function createPatternsPostRequest(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/bot/patterns', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  request.json = jest.fn().mockResolvedValue(body)
  return request
}

describe('GET /api/bot/patterns', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 when user is not authenticated', async () => {
    mockedVerifyToken.mockReturnValue(null)

    const request = new NextRequest('http://localhost:3000/api/bot/patterns')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('No autorizado')
  })

  it('should return all patterns when type is not specified', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    const mockPatterns = [
      { id: '1', pattern: 'agendar', description: 'Test', priority: 10, isActive: true, createdAt: new Date(), updatedAt: new Date() }
    ]

    mockedVerifyToken.mockReturnValue(mockUser)
    mockedPrisma.appointmentPattern.findMany.mockResolvedValue(mockPatterns as any)
    mockedPrisma.dateFormat.findMany.mockResolvedValue([])
    mockedPrisma.timeFormat.findMany.mockResolvedValue([])
    mockedPrisma.botResponse.findMany.mockResolvedValue([])

    const request = new NextRequest('http://localhost:3000/api/bot/patterns')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.appointmentPatterns).toBeDefined()
    expect(data.dateFormats).toBeDefined()
    expect(data.timeFormats).toBeDefined()
    expect(data.botResponses).toBeDefined()
  })

  it('should return only appointment patterns when type=appointment', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    const mockPatterns = [
      { id: '1', pattern: 'agendar', description: 'Test', priority: 10, isActive: true, createdAt: new Date(), updatedAt: new Date() }
    ]

    mockedVerifyToken.mockReturnValue(mockUser)
    mockedPrisma.appointmentPattern.findMany.mockResolvedValue(mockPatterns as any)

    const request = new NextRequest('http://localhost:3000/api/bot/patterns?type=appointment')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.appointmentPatterns).toHaveLength(1)
    expect(data.dateFormats).toBeUndefined()
  })
})

describe('POST /api/bot/patterns', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 when user is not authenticated', async () => {
    mockedVerifyToken.mockReturnValue(null)

    const request = new NextRequest('http://localhost:3000/api/bot/patterns', {
      method: 'POST',
      body: JSON.stringify({
        type: 'appointment',
        data: { pattern: 'test', description: 'Test pattern' }
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('No autorizado')
  })

  it('should create appointment pattern', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    const mockPattern = {
      id: '1',
      pattern: 'test',
      description: 'Test pattern',
      priority: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockedVerifyToken.mockReturnValue(mockUser)
    mockedPrisma.appointmentPattern.create.mockResolvedValue(mockPattern as any)

    const request = createPatternsPostRequest({
      type: 'appointment',
      data: { pattern: 'test', description: 'Test pattern', priority: 10, isActive: true }
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.id).toBe('1')
    expect(mockedPrisma.appointmentPattern.create).toHaveBeenCalled()
  })

  it('should create date format', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    const mockFormat = {
      id: '1',
      format: 'dd/MM/yyyy',
      pattern: '(\\d{1,2})/(\\d{1,2})/(\\d{4})',
      example: '15/01/2024',
      priority: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockedVerifyToken.mockReturnValue(mockUser)
    mockedPrisma.dateFormat.create.mockResolvedValue(mockFormat as any)

    const request = createPatternsPostRequest({
      type: 'date',
      data: mockFormat
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.format).toBe('dd/MM/yyyy')
    expect(mockedPrisma.dateFormat.create).toHaveBeenCalled()
  })

  it('should return 400 for invalid type', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    mockedVerifyToken.mockReturnValue(mockUser)

    const request = createPatternsPostRequest({
      type: 'invalid',
      data: {}
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Tipo inválido')
  })
})
