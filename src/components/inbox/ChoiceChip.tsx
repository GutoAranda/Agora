import type { ReactNode } from 'react'
import { cx } from '../ui'

/** Chip clicável (sugestões rápidas em formulários). */
export function ChoiceChip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex items-center rounded-full border px-3 min-h-9 text-sm font-semibold transition active:scale-[0.98]',
        active ? 'bg-accent/15 text-accent border-accent/40' : 'border-line text-muted hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  )
}
