import { createContext, useContext, useEffect, useState } from 'react'
import { getMe, login as apiLogin, logout as apiLogout } from '@/api/auth'
import type { LoginPayload } from '@/api/auth'
import type { User } from '@/types'

interface AuthContextType {
  user: User | null
  isFirstRun: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchMe = async () => {
    try {
      const data = await getMe()
      if ('first_run' in data && data.first_run) {
        setIsFirstRun(true)
        setUser(null)
      } else {
        setUser(data as User)
        setIsFirstRun(false)
      }
    } catch {
      setUser(null)
      setIsFirstRun(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchMe() }, [])

  const login = async (email: string, password: string) => {
    const payload: LoginPayload = { email, password }
    await apiLogin(payload)
    await fetchMe()
  }

  const logout = async () => {
    await apiLogout()
    setUser(null)
    setIsFirstRun(false)
  }

  return (
    <AuthContext.Provider value={{ user, isFirstRun, loading, login, logout, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
