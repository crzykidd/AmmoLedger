import { api } from './client'
import type {
  AutoGenerateResponse,
  ProductCreate,
  ProductRead,
  ProductUpdate,
  ProductUpdateResponse,
} from '@/types'

export interface ImageSearchResultDto {
  url: string
  thumbnail_url: string
  width: number | null
  height: number | null
  source_page_url: string | null
  title: string | null
}

export interface ImageSearchResponse {
  query: string
  page: number
  results: ImageSearchResultDto[]
}

export interface ImagePreviewResponse {
  preview_token: string
  preview_url: string
  width: number
  height: number
}

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

export const updateProduct = (id: number, data: ProductUpdate, syncBoxes = false) =>
  api.put<ProductUpdateResponse>(
    `/products/${id}${syncBoxes ? '?sync_boxes=true' : ''}`,
    data,
  )

export const deleteProduct = (id: number) => api.delete<void>(`/products/${id}`)

export const autoGenerateProducts = () =>
  api.get<AutoGenerateResponse>('/products/auto-generate')

export const deleteProductImage = (id: number) =>
  api.delete<ProductRead>(`/products/${id}/image`)

export const getProductImageUrl = (id: number) => `/api/products/${id}/image`

export const searchProductImages = (
  productId: number,
  q: string,
  page = 0,
): Promise<ImageSearchResponse> => {
  const qs = new URLSearchParams({ q, page: String(page) })
  return api.get<ImageSearchResponse>(`/products/${productId}/image/search?${qs}`)
}

export const previewProductImage = (
  productId: number,
  sourceUrl: string,
): Promise<ImagePreviewResponse> =>
  api.post<ImagePreviewResponse>(`/products/${productId}/image/preview`, { source_url: sourceUrl })

export const commitProductImageFromSearch = (
  productId: number,
  preview_token: string,
  crop: { x: number; y: number; width: number; height: number } | null,
): Promise<ProductRead> =>
  api.post<ProductRead>(`/products/${productId}/image/from-search`, { preview_token, crop })

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
