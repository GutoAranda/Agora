import { cx } from '../ui'

/* Pequenos helpers visuais compartilhados pelas seções da Faculdade. */

export type Tone = 'muted' | 'ok' | 'warn' | 'accent' | 'area'

export function ProgressBar({ pct, tone = 'accent', label }: { pct: number; tone?: Tone; label?: string }) {
  const w = Math.min(100, Math.max(0, pct))
  const fill = {
    muted: 'bg-muted/50',
    ok: 'bg-ok',
    warn: 'bg-warn',
    accent: 'bg-accent',
    area: 'area-dot',
  }[tone]
  return (
    <div
      className="h-2 rounded-full bg-line overflow-hidden"
      role="progressbar"
      aria-valuenow={Math.round(w)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <i className={cx('block h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${w}%` }} />
    </div>
  )
}

export const ESTIMATE_CHIPS = [60, 120, 240, 480, 960]

/** 'yyyy-MM-ddTHH:mm' local para inputs datetime-local. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}

export function confirmAsk(text: string): boolean {
  return typeof window !== 'undefined' ? window.confirm(text) : false
}
