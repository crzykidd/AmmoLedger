import { api } from './client'
import type { UserRead } from '@/types'

export const getUsers = () => api.get<UserRead[]>('/users')

export const updateUser = (id: number, data: { role?: string; is_active?: boolean }) =>
  api.patch<UserRead>(`/users/${id}`, data)

export const resetUserPassword = (id: number, new_password: string) =>
  api.post<{ message: string }>(`/users/${id}/reset-password`, { new_password })

export const changeMyPassword = (data: {
  current_password: string
  new_password: string
  confirm_password: string
}) => api.post<{ message: string }>('/users/me/change-password', data)
