import type { Request, Response } from 'express'
import * as workerService from '../services/worker.service.js'
import { handleError } from '../utils/handleError.js'
import type { CreateWorkerBody, UpdateWorkerBody, WorkerQuery } from '../interfaces/index.js'

export async function listWorkers(req: Request<{}, {}, {}, WorkerQuery>, res: Response) {
  try {
    const { category, page = '1', limit = '20' } = req.query
    const workers = await workerService.listWorkers({ category, page: Number(page), limit: Number(limit) })
    return res.json({ data: workers, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function showWorker(req: Request, res: Response) {
  try {
    const worker = await workerService.getWorker(req.params.id)
    return res.json({ data: worker, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function createWorker(req: Request<{}, {}, CreateWorkerBody>, res: Response) {
  try {
    const worker = await workerService.createWorker(req.body, req.user!.id)
    return res.status(201).json({ data: worker, status: 'success', code: 201 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function updateWorker(req: Request<{ id: string }, {}, UpdateWorkerBody>, res: Response) {
  try {
    const worker = await workerService.updateWorker(req.params.id, req.body)
    return res.json({ data: worker, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function deleteWorker(req: Request, res: Response) {
  try {
    await workerService.deleteWorker(req.params.id)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err)
  }
}

export async function toggleActivation(req: Request, res: Response) {
  try {
    const updated = await workerService.toggleWorker(req.params.id)
    return res.json({ data: updated, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}
