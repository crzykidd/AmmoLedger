import { createContext, useCallback, useContext, useState } from 'react'

interface MobileNavContextType {
  open: boolean
  openNav: () => void
  closeNav: () => void
  toggleNav: () => void
}

const MobileNavContext = createContext<MobileNavContextType | null>(null)

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const openNav = useCallback(() => setOpen(true), [])
  const closeNav = useCallback(() => setOpen(false), [])
  const toggleNav = useCallback(() => setOpen((p) => !p), [])
  return (
    <MobileNavContext.Provider value={{ open, openNav, closeNav, toggleNav }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext)
  if (!ctx) throw new Error('useMobileNav must be used inside MobileNavProvider')
  return ctx
}
