import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type AccentColor = 'amber' | 'ranger-green' | 'steel-blue' | 'carbon-gray'

interface ThemeContextType {
  theme: Theme
  accentColor: AccentColor
  setTheme: (t: Theme) => void
  setAccentColor: (a: AccentColor) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const STORAGE_THEME = 'ammologger_theme'
const STORAGE_ACCENT = 'ammologger_accent'

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_THEME) as Theme | null) ?? 'system',
  )
  const [accentColor, setAccentState] = useState<AccentColor>(
    () => (localStorage.getItem(STORAGE_ACCENT) as AccentColor | null) ?? 'amber',
  )

  useEffect(() => {
    const resolved = resolveTheme(theme)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    localStorage.setItem(STORAGE_THEME, theme)

    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(STORAGE_ACCENT, accentColor)
  }, [accentColor])

  return (
    <ThemeContext.Provider
      value={{ theme, accentColor, setTheme: setThemeState, setAccentColor: setAccentState }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
