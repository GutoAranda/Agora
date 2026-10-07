import type { CSSProperties } from 'react'
import { Moon } from 'lucide-react'
import type { Block, Settings } from '../../db/schema'
import { awakeWindow, type FreeSlot } from '../../lib/schedule'
import { fmtDuration, fromDayKey, hhmm, parseISO } from '../../lib/time'
import { cx } from '../ui'
import { BlockItem } from './BlockItem'

/* ==========================================================================
   Geometria da linha do tempo: tudo em minutos desde 00:00 do dia da coluna
   (pode passar de 1440 para a madrugada seguinte), convertido em px.
   ========================================================================== */

export interface Geometry {
  fromMin: number
  toMin: number
  /** pixels por minuto */
  ppm: number
}

export function minOfDay(iso: string | Date, day: string): number {
  const t = typeof iso === 'string' ? parseISO(iso).getTime() : iso.getTime()
  return (t - fromDayKey(day).getTime()) / 60000
}

export function yOf(min: number, g: Geometry): number {
  return (min - g.fromMin) * g.ppm
}

export function totalHeight(g: Geometry): number {
  return (g.toMin - g.fromMin) * g.ppm
}

/** Janela útil do dia em minutos relativos ao dia (acordar, dormir). */
export function awakeMinutes(day: string, s: Settings): { wake: number; bed: number } {
  const win = awakeWindow(day, s)
  const base = fromDayKey(day).getTime()
  return { wake: (win.start - base) / 60000, bed: (win.end - base) / 60000 }
}

function hoursIn(g: Geometry): number[] {
  const out: number[] = []
  for (let h = Math.ceil(g.fromMin / 60); h * 60 <= g.toMin; h++) out.push(h)
  return out
}

function hourLabel(h: number): string {
  return `${String(h % 24).padStart(2, '0')}h`
}

/** Faixa de rótulos de hora, alinhada com as colunas. */
export function HourGutter({ g, className }: { g: Geometry; className?: string }) {
  return (
    <div className={cx('relative shrink-0 w-10 select-none', className)} style={{ height: totalHeight(g) }} aria-hidden="true">
      {hoursIn(g).map((h) => (
        <span
          key={h}
          className="absolute right-1.5 -translate-y-1/2 text-[11px] text-muted tabular"
          style={{ top: yOf(h * 60, g) }}
        >
          {hourLabel(h)}
        </span>
      ))}
    </div>
  )
}

/* ---- Faixas (lanes) para blocos que se sobrepõem --------------------------- */

interface Placed {
  block: Block
  startMin: number
  endMin: number
  lane: number
  lanes: number
}

function layoutLanes(blocks: Block[], day: string): Placed[] {
  const items = blocks
    .map((block) => ({ block, startMin: minOfDay(block.start, day), endMin: minOfDay(block.end, day), lane: 0, lanes: 1 }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  let cluster: Placed[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }
  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush()
    let lane = laneEnds.findIndex((e) => e <= it.startMin)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = it.endMin
    it.lane = lane
    clusterEnd = Math.max(clusterEnd, it.endMin)
    cluster.push(it)
  }
  flush()
  return items
}

/* ---- Coluna de um dia ------------------------------------------------------ */

export interface DayColumnProps {
  day: string
  blocks: Block[]
  slots: FreeSlot[]
  settings: Settings
  g: Geometry
  now: Date
  showSkipped: boolean
  dense?: boolean
  hourLines?: boolean
  onBlock: (b: Block) => void
  onSlot: (s: FreeSlot) => void
  className?: string
}

export function DayColumn({ day, blocks, slots, settings, g, now, showSkipped, dense, hourLines = true, onBlock, onSlot, className }: DayColumnProps) {
  const H = totalHeight(g)
  const { wake, bed } = awakeMinutes(day, settings)
  const nowMin = minOfDay(now, day)
  const nowVisible = nowMin >= g.fromMin && nowMin <= g.toMin
  const visible = blocks.filter((b) => b.kind !== 'sono' && (showSkipped || b.status !== 'pulado'))
  const placed = layoutLanes(visible, day)

  const band = (from: number, to: number, key: string) => {
    const top = yOf(Math.max(from, g.fromMin), g)
    const h = yOf(Math.min(to, g.toMin), g) - top
    if (h <= 0) return null
    return (
      <div
        key={key}
        className="absolute inset-x-0 bg-line/40 text-muted flex items-start justify-center pt-1"
        style={{ top, height: h, backgroundImage: 'repeating-linear-gradient(0deg, rgb(var(--line) / 0.35) 0 2px, transparent 2px 8px)' }}
        aria-hidden="true"
      >
        {h >= 22 && (
          <span className="inline-flex items-center gap-1 text-[11px]">
            <Moon size={11} /> {dense ? '' : 'dormir'}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={cx('relative min-w-0', className)} style={{ height: H }}>
      {hourLines &&
        hoursIn(g).map((h) => (
          <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: yOf(h * 60, g) }} aria-hidden="true" />
        ))}

      {band(g.fromMin, wake, 'sono-manha')}
      {band(bed, g.toMin, 'sono-noite')}

      {slots.map((s) => {
        const top = yOf(minOfDay(s.start, day), g)
        const h = yOf(minOfDay(s.end, day), g) - top
        if (h <= 0) return null
        return (
          <button
            key={s.start.toISOString()}
            type="button"
            onClick={() => onSlot(s)}
            aria-label={`Espaço livre de ${hhmm(s.start)} às ${hhmm(s.end)}, ${fmtDuration(s.minutes)}. Toque para encaixar algo.`}
            className={cx(
              'absolute inset-x-0.5 rounded-lg border border-dashed border-line text-muted hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition',
              dense ? 'text-[10px]' : 'text-xs',
            )}
            style={{ top: top + 1, height: Math.max(h - 2, 16) }}
          >
            <span className="block px-1 truncate leading-tight">
              {dense ? `livre · ${fmtDuration(s.minutes)}` : `espaço livre · ${fmtDuration(s.minutes)}`}
            </span>
          </button>
        )
      })}

      {placed.map((p) => {
        const top = yOf(Math.max(p.startMin, g.fromMin), g)
        const bottom = yOf(Math.min(p.endMin, g.toMin), g)
        if (bottom <= top) return null
        const h = Math.max(bottom - top, 24)
        const w = 100 / p.lanes
        const style: CSSProperties = {
          top,
          height: h,
          left: `calc(${p.lane * w}% + 2px)`,
          width: `calc(${w}% - 4px)`,
        }
        return <BlockItem key={p.block.id} block={p.block} style={style} height={h} dense={dense} onClick={onBlock} />
      })}

      {nowVisible && (
        <div className="absolute inset-x-0 z-20 pointer-events-none" style={{ top: yOf(nowMin, g) }} aria-label={`Agora: ${hhmm(now)}`} role="img">
          <div className="h-0.5 bg-accent" />
          <span className="absolute -left-1 -top-[5px] w-3 h-3 rounded-full bg-accent" />
        </div>
      )}
    </div>
  )
}
