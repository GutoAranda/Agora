import { cx } from '../ui'

/* Seletores em formato de chip: um valor, ou vários com limite. */

export interface ChipOption<T> {
  value: T
  label: string
}

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ChipOption<T>[]
  value: T | undefined
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-11 px-4 rounded-full border text-sm font-semibold transition active:scale-[0.97]',
              on ? 'bg-accent text-white border-accent' : 'bg-surface border-line text-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function MultiChips({
  options,
  value,
  onChange,
  max,
  ariaLabel,
}: {
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  max?: number
  ariaLabel?: string
}) {
  const full = max !== undefined && value.length >= max
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={!on && full}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cx(
              'min-h-11 px-4 rounded-full border text-sm font-semibold transition active:scale-[0.97] disabled:opacity-40',
              on ? 'bg-accent text-white border-accent' : 'bg-surface border-line text-muted',
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

/** Interruptor simples com rótulo e descrição. */
export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="w-full flex items-center justify-between gap-3 text-left min-h-11 py-1"
    >
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cx('relative shrink-0 w-12 h-7 rounded-full transition', on ? 'bg-accent' : 'bg-line')}
      >
        <span className={cx('absolute top-1 w-5 h-5 rounded-full bg-white shadow transition', on ? 'left-6' : 'left-1')} />
      </span>
    </button>
  )
}
