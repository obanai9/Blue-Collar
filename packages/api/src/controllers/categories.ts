import type { Request, Response } from 'express'
import * as categoryService from '../services/category.service.js'
import { handleError } from '../utils/handleError.js'

export async function listCategories(_req: Request, res: Response) {
  try {
    const categories = await categoryService.listCategories()
    return res.json({ data: categories, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function getCategory(req: Request, res: Response) {
  try {
    const category = await categoryService.getCategory(req.params.id)
    return res.json({ data: category, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}
