import { Button, cx } from '../ui'

/** Linha de opções exclusivas (estimativa, duração, meta). Alvo de toque ≥ 44px. */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  className,
  label,
}: {
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
  className?: string
  label?: string
}) {
  return (
    <div className={cx('flex flex-wrap gap-2', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <Button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          variant={value === o.value ? 'primary' : 'secondary'}
          className="flex-1 min-w-[60px] px-3"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

export const ESTIMATE_OPTIONS = [
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
  { value: 240, label: '4h' },
  { value: 480, label: '8h' },
]

/** Confirmação inline (nunca window.confirm). */
export function InlineConfirm({
  text,
  onYes,
  onNo,
  yesLabel = 'Sim, remover',
}: {
  text: string
  onYes: () => void
  onNo: () => void
  yesLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{text}</span>
      <Button variant="danger" className="min-h-9 px-3 text-sm" onClick={onYes}>
        {yesLabel}
      </Button>
      <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={onNo}>
        Deixa
      </Button>
    </div>
  )
}
