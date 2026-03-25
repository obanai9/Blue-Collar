import type { Response } from 'express'
import { AppError } from '../services/AppError.js'
import { logger } from '../config/logger.js'

export function handleError(res: Response, err: unknown) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ status: 'error', message: err.message, code: err.statusCode })
  }
  logger.error({ err }, 'Unexpected error')
  return res.status(500).json({ status: 'error', message: 'Internal server error', code: 500 })
}
