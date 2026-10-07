import { useRef, type KeyboardEvent } from 'react'
import type { Area } from '../../db/schema'
import { fromDayKey, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../lib/time'
import { cx } from '../ui'

/* ==========================================================================
   Seletor horizontal de dias: 7 fichas com pontos por área e carga do dia.
   ========================================================================== */

export interface DayInfo {
  areas: Area[]
  /** % do tempo útil ocupado (0–100) */
  pct: number
}

export function LoadBar({ pct, max, className }: { pct: number; max: number; className?: string }) {
  return (
    <span className={cx('block h-1 rounded-full bg-line/80 overflow-hidden', className)} aria-hidden="true">
      <i className={cx('block h-full rounded-full', pct > max ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  )
}

export function DayStrip({
  days,
  selected,
  today,
  info,
  maxLoadPct,
  onSelect,
}: {
  days: string[]
  selected: string
  today: string
  info: Record<string, DayInfo | undefined>
  maxLoadPct: number
  onSelect: (day: string) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = days.indexOf(selected)
    let next = -1
    if (e.key === 'ArrowRight') next = Math.min(days.length - 1, i + 1)
    if (e.key === 'ArrowLeft') next = Math.max(0, i - 1)
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = days.length - 1
    if (next >= 0 && next !== i) {
      e.preventDefault()
      onSelect(days[next])
      refs.current[next]?.focus()
    }
  }

  return (
    <div role="tablist" aria-label="Dias da semana" className="grid grid-cols-7 gap-1" onKeyDown={onKey}>
      {days.map((d, i) => {
        const date = fromDayKey(d)
        const wd = date.getDay()
        const on = d === selected
        const isToday = d === today
        const inf = info[d]
        const pct = inf?.pct ?? 0
        return (
          <button
            key={d}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(d)}
            aria-label={`${WEEKDAY_LONG[wd]}, dia ${date.getDate()}${isToday ? ', hoje' : ''}. ${pct}% do tempo útil ocupado.`}
            className={cx(
              'min-w-0 min-h-[60px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              on ? 'bg-accent text-white border-accent' : 'bg-surface border-line text-fg',
              isToday && !on && 'border-accent/70',
            )}
          >
            <span className={cx('text-[10px] uppercase tracking-wide font-semibold', on ? 'text-white/85' : 'text-muted')}>{WEEKDAY_SHORT[wd]}</span>
            <span className={cx('text-base font-extrabold leading-none tabular', isToday && !on && 'text-accent')}>{date.getDate()}</span>
            <span className="flex gap-0.5 h-1.5 items-center" aria-hidden="true">
              {(inf?.areas ?? []).map((a) => (
                <i key={a} className={cx(`area-${a}`, 'block w-1.5 h-1.5 rounded-full', on ? 'bg-white/90' : 'area-dot')} />
              ))}
            </span>
            <LoadBar pct={pct} max={maxLoadPct} className={cx('w-6', on && 'bg-white/30')} />
          </button>
        )
      })}
    </div>
  )
}
