import { db } from '../db.js'
import { AppError } from './AppError.js'
import { formatWorker } from '../models/worker.model.js'
import type { CreateWorkerBody, UpdateWorkerBody, WorkerQuery } from '../interfaces/index.js'

const workerInclude = { category: true, curator: true } as const

export async function listWorkers({ category, page = 1, limit = 20 }: WorkerQuery & { page?: number; limit?: number }) {
  const workers = await db.worker.findMany({
    where: { isActive: true, ...(category ? { categoryId: category } : {}) },
    skip: (page - 1) * limit,
    take: limit,
    include: workerInclude,
  })
  return workers.map(formatWorker)
}

export async function getWorker(id: string) {
  const worker = await db.worker.findUnique({ where: { id }, include: workerInclude })
  if (!worker) throw new AppError('Not found', 404)
  return formatWorker(worker)
}

export async function createWorker(data: CreateWorkerBody, curatorId: string) {
  const worker = await db.worker.create({ data: { ...data, curatorId }, include: workerInclude })
  return formatWorker(worker)
}

export async function updateWorker(id: string, data: UpdateWorkerBody) {
  const worker = await db.worker.update({ where: { id }, data, include: workerInclude })
  return formatWorker(worker)
}

export async function deleteWorker(id: string) {
  await db.worker.delete({ where: { id } })
}

export async function toggleWorker(id: string) {
  const worker = await db.worker.findUnique({ where: { id } })
  if (!worker) throw new AppError('Not found', 404)
  const updated = await db.worker.update({ where: { id }, data: { isActive: !worker.isActive }, include: workerInclude })
  return formatWorker(updated)
}
