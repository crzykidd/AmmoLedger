import { api } from './client'
import type { InviteCreate, InviteRead } from '@/types'

export const createInvite = (data: InviteCreate) =>
  api.post<InviteRead>('/auth/invite', data)

export const getInvites = () => api.get<InviteRead[]>('/auth/invites')

export const revokeInvite = (token: string) =>
  api.delete<{ message: string }>(`/auth/invite/${token}`)

export const validateInviteToken = (token: string) =>
  api.get<{ role: string; email_hint: string | null }>(`/auth/invite/${token}`)
