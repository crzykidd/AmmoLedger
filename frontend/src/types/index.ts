export type Role = 'admin' | 'member' | 'read_only'

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: Role
  is_active: boolean
}

export interface ApiError {
  detail: string
}

export type MeResponse = User | { first_run: true }
