import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'

/* Componentes básicos. Tudo mobile-first, alvo de toque ≥ 44px. */

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-11 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
  const v: Record<Variant, string> = {
    primary: 'bg-accent text-white',
    secondary: 'bg-surface border border-line text-fg',
    ghost: 'bg-transparent text-muted hover:text-fg',
    danger: 'bg-warn/10 text-warn border border-warn/30',
  }
  return <button className={cx(base, v[variant], className)} {...props} />
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('bg-surface border border-line rounded-2xl p-4', className)}>
      {children}
    </div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">{children}</span>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full min-h-11 rounded-xl border border-line bg-bg px-3 text-[15px] focus:outline focus:outline-2 focus:outline-accent'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'py-2 min-h-20', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, props.className)} />
}

export function Chip({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'accent' }) {
  const t = {
    muted: 'bg-line/60 text-muted',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    accent: 'bg-accent/15 text-accent',
  }[tone]
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', t)}>{children}</span>
}

/** Painel deslizante de baixo para cima (edição, formulários). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/40" aria-label="Fechar" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[92%] overflow-y-auto rounded-t-3xl bg-surface border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-muted" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="font-display font-bold text-lg">{title}</p>
      {hint && <p className="text-muted text-sm mt-1 max-w-xs mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Marcador de dia da semana (seg..dom) para formulários de recorrência. */
export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const names = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="flex gap-1.5" role="group" aria-label="Dias da semana">
      {order.map((d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cx('w-10 h-10 rounded-full text-sm font-bold border', on ? 'bg-accent text-white border-accent' : 'border-line text-muted')}
          >
            {names[d]}
          </button>
        )
      })}
    </div>
  )
}
