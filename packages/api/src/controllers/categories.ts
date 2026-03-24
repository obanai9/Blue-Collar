import type { Request, Response } from 'express'
import { db } from '../db.js'
import { AppError } from '../utils/AppError.js'
import { catchAsync } from '../utils/catchAsync.js'

export const listCategories = catchAsync(async (_req: Request, res: Response) => {
  const categories = await db.category.findMany()
  return res.json({ data: categories, status: 'success', code: 200 })
})

export const getCategory = catchAsync(async (req: Request, res: Response) => {
  const category = await db.category.findUnique({ where: { id: req.params.id } })
  if (!category) throw new AppError('Category not found', 404)
  return res.json({ data: category, status: 'success', code: 200 })
})
