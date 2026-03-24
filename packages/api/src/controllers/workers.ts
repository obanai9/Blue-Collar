import type { Request, Response } from 'express'
import { db } from '../db.js'
import { AppError } from '../utils/AppError.js'
import { catchAsync } from '../utils/catchAsync.js'

export const listWorkers = catchAsync(async (req: Request, res: Response) => {
  const { category, location, page = '1', limit = '20' } = req.query
  const workers = await db.worker.findMany({
    where: {
      isActive: true,
      ...(category ? { categoryId: String(category) } : {}),
    },
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    include: { category: true },
  })
  return res.json({ data: workers, status: 'success', code: 200 })
})

export const showWorker = catchAsync(async (req: Request, res: Response) => {
  const worker = await db.worker.findUnique({
    where: { id: req.params.id },
    include: { category: true },
  })
  if (!worker) throw new AppError('Worker not found', 404)
  return res.json({ data: worker, status: 'success', code: 200 })
})

export const createWorker = catchAsync(async (req: Request, res: Response) => {
  const worker = await db.worker.create({ data: { ...req.body, curatorId: req.user!.id } })
  return res.status(201).json({ data: worker, status: 'success', code: 201 })
})

export const updateWorker = catchAsync(async (req: Request, res: Response) => {
  const worker = await db.worker.update({ where: { id: req.params.id }, data: req.body })
  return res.json({ data: worker, status: 'success', code: 200 })
})

export const deleteWorker = catchAsync(async (req: Request, res: Response) => {
  await db.worker.delete({ where: { id: req.params.id } })
  return res.status(204).send()
})

export const toggleActivation = catchAsync(async (req: Request, res: Response) => {
  const worker = await db.worker.findUnique({ where: { id: req.params.id } })
  if (!worker) throw new AppError('Worker not found', 404)
  const updated = await db.worker.update({
    where: { id: req.params.id },
    data: { isActive: !worker.isActive },
  })
  return res.json({ data: updated, status: 'success', code: 200 })
})
