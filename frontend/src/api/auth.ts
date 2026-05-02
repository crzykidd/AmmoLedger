import { api } from './client'
import type { MeResponse, ResetTokenInfo, User } from '@/types'

export interface LoginPayload {
  email: string
  password: string
}

export interface SetupPayload {
  email: string
  password: string
  first_name: string
  last_name: string
}

export interface RegisterPayload {
  token: string
  first_name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
}

export interface PasswordResetPayload {
  token: string
  new_password: string
  email?: string
}

export const getMe = () => api.get<MeResponse>('/auth/me')
export const login = (data: LoginPayload) => api.post<User>('/auth/login', data)
export const logout = () => api.post<void>('/auth/logout')
export const setup = (data: SetupPayload) => api.post<User>('/auth/setup', data)
export const register = (data: RegisterPayload) => api.post<User>('/auth/register', data)
export const generateResetToken = (userId: number) =>
  api.post<{ reset_url: string }>(`/auth/reset-token/${userId}`)
export const validateResetToken = (token: string) =>
  api.get<ResetTokenInfo>(`/auth/reset?token=${encodeURIComponent(token)}`)
export const submitPasswordReset = (data: PasswordResetPayload) =>
  api.post<void>('/auth/reset', data)
