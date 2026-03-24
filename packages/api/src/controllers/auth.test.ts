/**
 * Unit tests for the email verification flow.
 *
 * Strategy:
 *  - Mock `../db.js` (Prisma client) and `../mailer/index.js` (Nodemailer helper).
 *  - Build lightweight Request / Response mocks so we never need a live HTTP server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

// ─── Env setup ───────────────────────────────────────────────────────────────
process.env.JWT_SECRET = 'test-secret'
process.env.APP_URL = 'http://localhost:3000'

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../db.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('../mailer/index.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Import AFTER mocks are registered
import { db } from '../db.js'
import { sendVerificationEmail } from '../mailer/index.js'
import { login, register, verifyAccount } from '../controllers/auth.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────
type MockResponse = {
  statusCode: number
  body: Record<string, unknown>
  status: (code: number) => MockResponse
  json: (data: Record<string, unknown>) => MockResponse
}

function makeRes(): MockResponse {
  const res = {
    statusCode: 200,
    body: {},
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(data: Record<string, unknown>) {
      this.body = data
      return this
    },
  }
  return res
}

function makeReq(overrides: Record<string, unknown> = {}): any {
  return { body: {}, query: {}, headers: {}, ...overrides }
}

/** Hash a raw JWT the same way the controller does. */
function sha256(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Sign a verification JWT. */
function signVerificationToken(userId: string, expiresIn = '24h') {
  return jwt.sign({ id: userId, purpose: 'email-verify' }, process.env.JWT_SECRET!, { expiresIn })
}

// ─── Test definitions ─────────────────────────────────────────────────────────

describe('register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a user, stores hashed token, and sends a verification email', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      role: 'user',
      verified: false,
      password: 'hashed',
      verificationToken: null,
      verificationTokenExpiry: null,
      walletAddress: null,
      avatar: null,
      bio: null,
      phone: null,
      locationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(db.user.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser)
    ;(db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser)

    const req = makeReq({
      body: { email: 'alice@example.com', password: 'secret', firstName: 'Alice', lastName: 'Smith' },
    })
    const res = makeRes()

    await register(req, res as any)

    expect(res.statusCode).toBe(201)
    expect(res.body.status).toBe('success')
    expect(res.body.message).toMatch(/verify/i)

    // verificationToken hash must have been stored
    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateCall.data.verificationToken).toBeTruthy()
    expect(updateCall.data.verificationToken).toHaveLength(64) // sha-256 hex

    // sendVerificationEmail must have been called
    expect(sendVerificationEmail).toHaveBeenCalledOnce()
    expect((sendVerificationEmail as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      'alice@example.com',
    )
  })

  it('returns 409 when email is already registered', async () => {
    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' })

    const req = makeReq({
      body: { email: 'alice@example.com', password: 'secret', firstName: 'Alice', lastName: 'Smith' },
    })
    const res = makeRes()

    await register(req, res as any)

    expect(res.statusCode).toBe(409)
    expect(res.body.status).toBe('error')
  })

  it('does NOT expose password or verification fields in the response', async () => {
    const mockUser = {
      id: 'user-2',
      email: 'bob@example.com',
      firstName: 'Bob',
      lastName: 'Jones',
      role: 'user',
      verified: false,
      password: 'hashed-password',
      verificationToken: 'abc123',
      verificationTokenExpiry: new Date(),
      walletAddress: null,
      avatar: null,
      bio: null,
      phone: null,
      locationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(db.user.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser)
    ;(db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser)

    const req = makeReq({ body: { email: 'bob@example.com', password: 'secret', firstName: 'Bob', lastName: 'Jones' } })
    const res = makeRes()

    await register(req, res as any)

    const data = res.body.data as Record<string, unknown>
    expect(data).not.toHaveProperty('password')
    expect(data).not.toHaveProperty('verificationToken')
    expect(data).not.toHaveProperty('verificationTokenExpiry')
  })
})

describe('login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when user is not verified', async () => {
    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      password: await import('argon2').then((m) => m.hash('secret')),
      verified: false,
      role: 'user',
    })

    const req = makeReq({ body: { email: 'alice@example.com', password: 'secret' } })
    const res = makeRes()

    await login(req, res as any)

    expect(res.statusCode).toBe(403)
    expect(res.body.status).toBe('error')
    expect(String(res.body.message)).toMatch(/verif/i)
  })

  it('returns 401 for wrong password', async () => {
    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      password: await import('argon2').then((m) => m.hash('correct-password')),
      verified: true,
      role: 'user',
    })

    const req = makeReq({ body: { email: 'alice@example.com', password: 'wrong-password' } })
    const res = makeRes()

    await login(req, res as any)

    expect(res.statusCode).toBe(401)
  })

  it('returns 202 and token for verified user with correct credentials', async () => {
    const argon2 = await import('argon2')
    const hashedPw = await argon2.hash('secret')

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      role: 'user',
      verified: true,
      password: hashedPw,
      verificationToken: null,
      verificationTokenExpiry: null,
      walletAddress: null,
      avatar: null,
      bio: null,
      phone: null,
      locationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const req = makeReq({ body: { email: 'alice@example.com', password: 'secret' } })
    const res = makeRes()

    await login(req, res as any)

    expect(res.statusCode).toBe(202)
    expect(res.body.token).toBeTruthy()
    const data = res.body.data as Record<string, unknown>
    expect(data).not.toHaveProperty('password')
    expect(data).not.toHaveProperty('verificationToken')
  })
})

describe('verifyAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when no token is provided', async () => {
    const req = makeReq({ query: {}, body: {} })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for a JWT signed with the wrong secret', async () => {
    const badToken = jwt.sign({ id: 'user-1', purpose: 'email-verify' }, 'wrong-secret', {
      expiresIn: '24h',
    })

    const req = makeReq({ query: { token: badToken } })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(400)
    expect(String(res.body.message)).toMatch(/invalid|expired/i)
  })

  it('returns 400 for an expired token', async () => {
    const expiredToken = jwt.sign(
      { id: 'user-1', purpose: 'email-verify' },
      process.env.JWT_SECRET!,
      { expiresIn: '0s' },
    )
    // tiny sleep so the token is truly expired
    await new Promise((r) => setTimeout(r, 10))

    const req = makeReq({ query: { token: expiredToken } })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when hash does not match stored hash', async () => {
    const validToken = signVerificationToken('user-1')

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      verified: false,
      verificationToken: 'completely-different-hash',
      verificationTokenExpiry: new Date(Date.now() + 60_000),
    })

    const req = makeReq({ query: { token: validToken } })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when token expiry has passed (DB-level check)', async () => {
    const validToken = signVerificationToken('user-1')
    const hash = sha256(validToken)

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      verified: false,
      verificationToken: hash,
      verificationTokenExpiry: new Date(Date.now() - 1),  // already expired
    })

    const req = makeReq({ query: { token: validToken } })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(400)
  })

  it('verifies the account and returns 200 for a valid token', async () => {
    const validToken = signVerificationToken('user-1')
    const hash = sha256(validToken)

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      verified: false,
      verificationToken: hash,
      verificationTokenExpiry: new Date(Date.now() + 60_000),
    })
    ;(db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', verified: true })

    const req = makeReq({ query: { token: validToken } })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('success')

    const updateCall = (db.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateCall.data.verified).toBe(true)
    expect(updateCall.data.verificationToken).toBeNull()
    expect(updateCall.data.verificationTokenExpiry).toBeNull()
  })

  it('returns 200 (idempotent) when the account is already verified', async () => {
    const validToken = signVerificationToken('user-1')

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      verified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
    })

    const req = makeReq({ query: { token: validToken } })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(200)
    expect(String(res.body.message)).toMatch(/already verified/i)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('accepts the token from req.body as well as req.query', async () => {
    const validToken = signVerificationToken('user-2')
    const hash = sha256(validToken)

    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-2',
      verified: false,
      verificationToken: hash,
      verificationTokenExpiry: new Date(Date.now() + 60_000),
    })
    ;(db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-2', verified: true })

    const req = makeReq({ query: {}, body: { token: validToken } })
    const res = makeRes()

    await verifyAccount(req, res as any)

    expect(res.statusCode).toBe(200)
  })
})
