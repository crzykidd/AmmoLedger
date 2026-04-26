import { useState, useEffect } from 'react'

export interface ToastItem {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

// Module-level singleton — toast() can be called from any mutation handler
// without needing a hook at the call site.
const _listeners = new Set<(toasts: ToastItem[]) => void>()
let _toasts: ToastItem[] = []

function _notify() {
  const snapshot = [..._toasts]
  _listeners.forEach((l) => l(snapshot))
}

export function toast(opts: Omit<ToastItem, 'id'>) {
  const id = Math.random().toString(36).slice(2, 9)
  _toasts = [..._toasts, { ...opts, id }]
  _notify()
  setTimeout(
    () => {
      _toasts = _toasts.filter((t) => t.id !== id)
      _notify()
    },
    opts.variant === 'destructive' ? 5000 : 3000,
  )
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>(_toasts)

  useEffect(() => {
    _listeners.add(setToasts)
    return () => {
      _listeners.delete(setToasts)
    }
  }, [])

  return { toasts }
}
