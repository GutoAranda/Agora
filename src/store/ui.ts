import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings } from '../db/schema'

interface Toast {
  id: number
  text: string
}

interface UIState {
  settings: Settings
  setSettings: (s: Settings) => void
  now: Date
  tick: () => void
  toasts: Toast[]
  toast: (text: string) => void
  dismissToast: (id: number) => void
}

let toastId = 0

export const useUI = create<UIState>((set) => ({
  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => set({ settings }),
  now: new Date(),
  tick: () => set({ now: new Date() }),
  toasts: [],
  toast: (text) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
