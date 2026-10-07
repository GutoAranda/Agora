import { useUI } from '../store/ui'

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  const dismiss = useUI((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] z-50 flex flex-col gap-2 w-[min(92vw,420px)]" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="text-left bg-fg text-bg rounded-xl px-4 py-3 text-sm font-semibold shadow-lg"
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
