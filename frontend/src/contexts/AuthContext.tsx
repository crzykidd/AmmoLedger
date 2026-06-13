import { createContext, useContext, useEffect, useState } from 'react'
import { getMe, login as apiLogin, logout as apiLogout } from '@/api/auth'
import { setOn401Handler } from '@/api/client'
import type { LoginPayload } from '@/api/auth'
import type { User } from '@/types'

interface AuthContextType {
  user: User | null
  isFirstRun: boolean
  loading: boolean
  mustChangePassword: boolean
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

  useEffect(() => {
    // Register a global 401 handler so any expired-session response clears
    // auth state and redirects to /login. We use window.location.replace
    // (hard redirect) because AuthProvider lives outside BrowserRouter and
    // cannot call useNavigate; a hard redirect also flushes the stale React
    // state, which is desirable after session expiry.
    setOn401Handler(() => {
      setUser(null)
      setIsFirstRun(false)
      // Avoid a redirect loop if we're already on a public page.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login')
      }
    })
    return () => { setOn401Handler(null) }
  }, [])

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

  const mustChangePassword = user?.must_change_password ?? false

  return (
    <AuthContext.Provider value={{ user, isFirstRun, loading, mustChangePassword, login, logout, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
