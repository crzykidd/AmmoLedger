import { api } from './client'
import type { MeResponse, User } from '@/types'

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

export const getMe = () => api.get<MeResponse>('/auth/me')
export const login = (data: LoginPayload) => api.post<User>('/auth/login', data)
export const logout = () => api.post<void>('/auth/logout')
export const setup = (data: SetupPayload) => api.post<User>('/auth/setup', data)
export const register = (data: RegisterPayload) => api.post<User>('/auth/register', data)
