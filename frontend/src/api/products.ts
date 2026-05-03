import { api } from './client'
import type {
  AutoGenerateResponse,
  ProductCreate,
  ProductRead,
  ProductUpdate,
} from '@/types'

export const listProducts = (params?: {
  search?: string
  caliber_id?: number
  manufacturer_id?: number
}) => {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.caliber_id != null) qs.set('caliber_id', String(params.caliber_id))
  if (params?.manufacturer_id != null) qs.set('manufacturer_id', String(params.manufacturer_id))
  const query = qs.toString()
  return api.get<ProductRead[]>(`/products${query ? `?${query}` : ''}`)
}

export const getProduct = (id: number) => api.get<ProductRead>(`/products/${id}`)

export const createProduct = (data: ProductCreate) =>
  api.post<ProductRead>('/products', data)

export const updateProduct = (id: number, data: ProductUpdate) =>
  api.put<ProductRead>(`/products/${id}`, data)

export const deleteProduct = (id: number) => api.delete<void>(`/products/${id}`)

export const autoGenerateProducts = () =>
  api.get<AutoGenerateResponse>('/products/auto-generate')

export const deleteProductImage = (id: number) =>
  api.delete<ProductRead>(`/products/${id}/image`)

export const getProductImageUrl = (id: number) => `/api/products/${id}/image`

export const uploadProductImage = async (id: number, file: File): Promise<ProductRead> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`/api/products/${id}/image`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    let error = { detail: `HTTP ${res.status}` }
    try {
      error = await res.json()
    } catch {
      // keep default
    }
    throw error
  }
  return res.json()
}
