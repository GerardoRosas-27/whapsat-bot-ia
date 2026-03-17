import { GET, POST } from '@/app/api/appointments/route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    appointment: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth')

const mockedPrisma = prisma as jest.Mocked<typeof prisma>
const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>

describe('GET /api/appointments', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 when user is not authenticated', async () => {
    mockedVerifyToken.mockReturnValue(null)

    const request = new NextRequest('http://localhost:3000/api/appointments')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('No autorizado')
  })

  it('should return appointments when authenticated', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    const mockAppointments = [
      {
        id: 'apt-1',
        patientName: 'John Doe',
        phoneNumber: '+1234567890',
        date: new Date('2024-01-15'),
        time: '10:00',
        status: 'pending',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    mockedVerifyToken.mockReturnValue(mockUser)
    mockedPrisma.appointment.findMany.mockResolvedValue(mockAppointments as any)
    mockedPrisma.appointment.count.mockResolvedValue(1)

    const request = new NextRequest('http://localhost:3000/api/appointments')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.appointments).toHaveLength(1)
    expect(data.pagination.total).toBe(1)
  })

  it('should filter appointments by status', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    mockedVerifyToken.mockReturnValue(mockUser)
    mockedPrisma.appointment.findMany.mockResolvedValue([])
    mockedPrisma.appointment.count.mockResolvedValue(0)

    const request = new NextRequest('http://localhost:3000/api/appointments?status=pending')
    await GET(request)

    expect(mockedPrisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'pending' },
      })
    )
  })
})

describe('POST /api/appointments', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 when user is not authenticated', async () => {
    mockedVerifyToken.mockReturnValue(null)

    const request = new NextRequest('http://localhost:3000/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        patientName: 'John Doe',
        phoneNumber: '+1234567890',
        date: '2024-01-15',
        time: '10:00',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('No autorizado')
  })

  it('should return 400 when required fields are missing', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    mockedVerifyToken.mockReturnValue(mockUser)

    // Create a mock request with body
    const requestBody = JSON.stringify({
      patientName: 'John Doe',
      // Missing phoneNumber, date, time
    })
    
    const request = new NextRequest('http://localhost:3000/api/appointments', {
      method: 'POST',
      body: requestBody,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Mock the json method
    request.json = jest.fn().mockResolvedValue(JSON.parse(requestBody))

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Faltan campos requeridos')
  })

  it('should create appointment when all fields are provided', async () => {
    const mockUser = {
      userId: 'user-123',
      username: 'admin',
      role: 'admin',
    }

    const mockAppointment = {
      id: 'apt-1',
      patientName: 'John Doe',
      phoneNumber: '+1234567890',
      date: new Date('2024-01-15'),
      time: '10:00',
      status: 'pending',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockedVerifyToken.mockReturnValue(mockUser)
    mockedPrisma.appointment.create.mockResolvedValue(mockAppointment as any)

    const requestBody = JSON.stringify({
      patientName: 'John Doe',
      phoneNumber: '+1234567890',
      date: '2024-01-15',
      time: '10:00',
    })

    const request = new NextRequest('http://localhost:3000/api/appointments', {
      method: 'POST',
      body: requestBody,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Mock the json method
    request.json = jest.fn().mockResolvedValue(JSON.parse(requestBody))

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.id).toBe('apt-1')
    expect(data.patientName).toBe('John Doe')
    expect(mockedPrisma.appointment.create).toHaveBeenCalled()
  })
})
