import { Router } from 'express'
import {
  login,
  register,
  logout,
  forgotPassword,
  resetPassword,
  verifyAccount,
} from '../controllers/auth.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/login', login)
router.post('/register', register)
router.delete('/logout', authenticate, logout)
router.post('/forgot-password', forgotPassword)
router.put('/reset-password', resetPassword)
router.put('/verify-account', verifyAccount)

export default router
