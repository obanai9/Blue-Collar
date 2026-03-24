import type { Request, Response } from 'express'
import { db } from '../db.js'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { sendVerificationEmail, sendPasswordResetEmail } from '../mailer/index.js'
import { AppError } from '../utils/AppError.js'
import { catchAsync } from '../utils/catchAsync.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign a short-lived verification JWT and return both the raw token and its SHA-256 hash. */
function generateVerificationToken(userId: string): { raw: string; hash: string; expiry: Date } {
  const raw = jwt.sign({ id: userId, purpose: 'email-verify' }, process.env.JWT_SECRET!, {
    expiresIn: '24h',
  })
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return { raw, hash, expiry }
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

export const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !(await argon2.verify(user.password, password))) {
    throw new AppError('Invalid credentials', 401)
  }

  // Block login for unverified accounts
  if (!user.verified) {
    throw new AppError(
      'Your email address has not been verified. Please check your inbox and click the verification link.',
      403
    )
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  })
  const { password: _, verificationToken: __, verificationTokenExpiry: ___, ...data } = user
  return res.status(202).json({ data, status: 'success', message: 'Login successful', code: 202, token })
})

export const register = catchAsync(async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body

  // Check for existing account before hashing
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    throw new AppError('Email already in use', 409)
  }

  const hashed = await argon2.hash(password)
  const user = await db.user.create({ data: { email, password: hashed, firstName, lastName } })

  // Generate verification token and persist its hash
  const { raw, hash, expiry } = generateVerificationToken(user.id)
  await db.user.update({
    where: { id: user.id },
    data: { verificationToken: hash, verificationTokenExpiry: expiry },
  })

  // Fire-and-forget the verification email (failures logged, not surfaced to client)
  sendVerificationEmail(email, firstName, raw).catch((err) =>
    console.error('[mailer] Failed to send verification email:', err),
  )

  const { password: _, verificationToken: __, verificationTokenExpiry: ___, ...data } = user
  return res.status(201).json({
    data,
    status: 'success',
    message: 'Registration successful. Please check your email to verify your account.',
    code: 201,
  })
})

export const verifyAccount = catchAsync(async (req: Request, res: Response) => {
  const token = (req.query.token ?? req.body.token) as string | undefined

  if (!token) {
    throw new AppError('Verification token is required', 400)
  }

  // Decode without verifying first so we can extract the user id
  let payload: { id?: string; purpose?: string }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; purpose: string }
  } catch {
    throw new AppError('Token is invalid or has expired', 400)
  }

  if (payload.purpose !== 'email-verify' || !payload.id) {
    throw new AppError('Invalid verification token', 400)
  }

  const user = await db.user.findUnique({ where: { id: payload.id } })
  if (!user) {
    throw new AppError('User not found', 404)
  }

  if (user.verified) {
    return res.status(200).json({ status: 'success', message: 'Email already verified', code: 200 })
  }

  // Compare token hash
  const incomingHash = crypto.createHash('sha256').update(token).digest('hex')
  const tokenMatches = incomingHash === user.verificationToken
  const notExpired =
    user.verificationTokenExpiry && user.verificationTokenExpiry > new Date()

  if (!tokenMatches || !notExpired) {
    throw new AppError('Token is invalid or has expired', 400)
  }

  await db.user.update({
    where: { id: user.id },
    data: { verified: true, verificationToken: null, verificationTokenExpiry: null },
  })

  return res.status(200).json({ status: 'success', message: 'Email verified successfully', code: 200 })
})

export async function googleAuthCallback(req: Request, res: Response) {
  const user = req.user as any

  if (!user) {
    return res.redirect(`${process.env.APP_URL}/login?error=oauth-failed`)
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  })

  // Redirect to frontend with token as query param
  return res.redirect(`${process.env.APP_URL}/auth-callback?token=${token}`)
}

export async function logout(_req: Request, res: Response) {
  return res.status(200).json({ status: 'success', message: 'Logged out', code: 200 })
}

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body

  const user = await db.user.findUnique({ where: { email } })

  // Security: Always return 200 to prevent user enumeration
  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.user.update({
      where: { id: user.id },
      data: { resetToken: hash, resetTokenExpiry: expiry },
    })

    sendPasswordResetEmail(user.email, user.firstName, rawToken).catch((err) =>
      console.error('[mailer] Failed to send password reset email:', err),
    )
  }

  return res.status(200).json({
    status: 'success',
    message: 'If an account exists with that email, a password reset link has been sent.',
    code: 200,
  })
})

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { token, password } = req.body

  if (!token || !password) {
    throw new AppError('Token and password are required', 400)
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const user = await db.user.findFirst({
    where: {
      resetToken: hash,
      resetTokenExpiry: { gt: new Date() },
    },
  })

  if (!user) {
    throw new AppError('Token is invalid or has expired', 400)
  }

  const hashedPassword = await argon2.hash(password)

  await db.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  })

  return res.status(200).json({ status: 'success', message: 'Password reset successful', code: 200 })
})
