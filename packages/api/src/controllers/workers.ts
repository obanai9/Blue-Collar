import type { Request, Response } from 'express'
import { db } from '../db.js'
import { paginate } from '../utils/paginate.js'

export async function listWorkers(req: Request, res: Response) {
  const { category, search, city, state, country, page = '1', limit = '20' } = req.query

  const { data, meta } = await paginate({
    model: 'worker',
    where: {
      isActive: true,
      ...(category ? { categoryId: String(category) } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: String(search), mode: 'insensitive' } },
              { bio: { contains: String(search), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(city || state || country
        ? {
            location: {
              ...(city ? { city: { contains: String(city), mode: 'insensitive' } } : {}),
              ...(state ? { state: { contains: String(state), mode: 'insensitive' } } : {}),
              ...(country ? { country: { contains: String(country), mode: 'insensitive' } } : {}),
            },
          }
        : {}),
    },
    include: { category: true, location: true },
    page: Number(page),
    limit: Number(limit),
  })
  return res.json({ data, meta, status: 'success', code: 200 })
}

export async function showWorker(req: Request, res: Response) {
  const worker = await db.worker.findUnique({
    where: { id: req.params.id },
    include: { category: true },
  })
  if (!worker) return res.status(404).json({ status: 'error', message: 'Not found', code: 404 })
  return res.json({ data: worker, status: 'success', code: 200 })
}

export async function createWorker(req: Request, res: Response) {
  const worker = await db.worker.create({ data: { ...req.body, curatorId: req.user!.id } })
  return res.status(201).json({ data: worker, status: 'success', code: 201 })
}

export async function updateWorker(req: Request, res: Response) {
  const worker = await db.worker.update({ where: { id: req.params.id }, data: req.body })
  return res.json({ data: worker, status: 'success', code: 200 })
}

export async function deleteWorker(req: Request, res: Response) {
  await db.worker.delete({ where: { id: req.params.id } })
  return res.status(204).send()
}

export async function toggleActivation(req: Request, res: Response) {
  const worker = await db.worker.findUnique({ where: { id: req.params.id } })
  if (!worker) return res.status(404).json({ status: 'error', message: 'Not found', code: 404 })
  const updated = await db.worker.update({
    where: { id: req.params.id },
    data: { isActive: !worker.isActive },
  })
  return res.json({ data: updated, status: 'success', code: 200 })
}
