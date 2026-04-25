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

export const getMe = () => api.get<MeResponse>('/auth/me')
export const login = (data: LoginPayload) => api.post<User>('/auth/login', data)
export const logout = () => api.post<void>('/auth/logout')
export const setup = (data: SetupPayload) => api.post<User>('/auth/setup', data)
