import { POST } from '@/app/api/auth/login/route'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('bcryptjs')
jest.mock('jsonwebtoken')

const mockedPrisma = prisma as jest.Mocked<typeof prisma>
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>
const mockedJwt = jwt as jest.Mocked<typeof jwt>

function createLoginRequest(body: Record<string, string>) {
  const request = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  request.json = jest.fn().mockResolvedValue(body)
  return request
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'test-secret'
  })

  it('should return 400 when username is missing', async () => {
    const request = createLoginRequest({ password: 'password123' })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Usuario y contraseña son requeridos')
  })

  it('should return 400 when password is missing', async () => {
    const request = createLoginRequest({ username: 'testuser' })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Usuario y contraseña son requeridos')
  })

  it('should return 401 when user does not exist', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null)

    const request = createLoginRequest({ username: 'nonexistent', password: 'password123' })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Credenciales inválidas')
    expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'nonexistent' },
    })
  })

  it('should return 401 when password is incorrect', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      password: 'hashed-password',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockedPrisma.user.findUnique.mockResolvedValue(mockUser)
    mockedBcrypt.compare.mockResolvedValue(false as never)

    const request = createLoginRequest({ username: 'testuser', password: 'wrongpassword' })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Credenciales inválidas')
    expect(mockedBcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashed-password')
  })

  it('should return token and user data when credentials are valid', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      password: 'hashed-password',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockToken = 'mock-jwt-token'

    mockedPrisma.user.findUnique.mockResolvedValue(mockUser)
    mockedBcrypt.compare.mockResolvedValue(true as never)
    mockedJwt.sign.mockReturnValue(mockToken as never)

    const request = createLoginRequest({ username: 'testuser', password: 'correctpassword' })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.token).toBe(mockToken)
    expect(data.user).toEqual({
      id: 'user-123',
      username: 'testuser',
      role: 'admin',
    })
    expect(mockedJwt.sign).toHaveBeenCalledWith(
      { userId: 'user-123', username: 'testuser', role: 'admin' },
      'test-secret',
      { expiresIn: '7d' }
    )
  })

  it('should return 500 when database error occurs', async () => {
    mockedPrisma.user.findUnique.mockRejectedValue(new Error('Database error'))

    const request = createLoginRequest({ username: 'testuser', password: 'password123' })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Error interno del servidor')
  })
})
