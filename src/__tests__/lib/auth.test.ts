import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { verifyToken, AuthUser } from '@/lib/auth'

describe('auth utility functions', () => {
  const mockJwtSecret = 'test-secret-key'
  
  beforeEach(() => {
    process.env.JWT_SECRET = mockJwtSecret
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('verifyToken', () => {
    it('should return user data when token is valid', () => {
      const mockUser: AuthUser = {
        userId: 'user-123',
        username: 'testuser',
        role: 'admin'
      }

      const token = jwt.sign(mockUser, mockJwtSecret)
      const headers = new Headers()
      headers.set('authorization', `Bearer ${token}`)
      
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers
      })

      const result = verifyToken(request)

      expect(result).toEqual(mockUser)
    })

    it('should return null when authorization header is missing', () => {
      const headers = new Headers()
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers
      })

      const result = verifyToken(request)

      expect(result).toBeNull()
    })

    it('should return null when authorization header does not start with Bearer', () => {
      const headers = new Headers()
      headers.set('authorization', 'Invalid token')
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers
      })

      const result = verifyToken(request)

      expect(result).toBeNull()
    })

    it('should return null when token is invalid', () => {
      const headers = new Headers()
      headers.set('authorization', 'Bearer invalid-token')
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers
      })

      const result = verifyToken(request)

      expect(result).toBeNull()
    })

    it('should return null when token is expired', () => {
      const mockUser: AuthUser = {
        userId: 'user-123',
        username: 'testuser',
        role: 'admin'
      }

      const token = jwt.sign(mockUser, mockJwtSecret, { expiresIn: '-1h' })
      const headers = new Headers()
      headers.set('authorization', `Bearer ${token}`)
      
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers
      })

      const result = verifyToken(request)

      expect(result).toBeNull()
    })
  })
})
