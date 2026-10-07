import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, ClipboardCheck, Eye, EyeOff } from 'lucide-react'
import { db, type Area, type Block } from '../db/schema'
import { useUI } from '../store/ui'
import { dayLoad, freeSlots, type FreeSlot } from '../lib/schedule'
import { materializeAround } from '../lib/materialize'
import { addDays, dayKey, fmtDay, fromDayKey, todayKey, weekDays, weekStartOf, WEEKDAY_SHORT } from '../lib/time'
import { Button, cx } from '../components/ui'
import { DayStrip, LoadBar, type DayInfo } from '../components/week/DayStrip'
import { DayColumn, HourGutter, awakeMinutes, minOfDay, type Geometry } from '../components/week/Timeline'
import { SlotSheet } from '../components/week/SlotSheet'
import { BlockSheet } from '../components/week/BlockSheet'

/* ==========================================================================
   Tela Semana: a visão de planejamento. No celular, um dia por vez
   (faixa de dias + linha do tempo). Em telas largas, a grade de 7 colunas.
   ========================================================================== */

const MOBILE_PPM = 1.6
const GRID_PPM = 0.9
const GRID_GEOMETRY: Geometry = { fromMin: 6 * 60, toMin: 26 * 60, ppm: GRID_PPM }

function rangeLabel(days: string[]): string {
  const a = fromDayKey(days[0])
  const b = fromDayKey(days[6])
  if (a.getMonth() === b.getMonth()) return `${format(a, 'd')}–${format(b, 'd')} de ${fmtDay(b, 'MMM')}`
  return `${fmtDay(a, "d 'de' MMM")} – ${fmtDay(b, "d 'de' MMM")}`
}

export default function SemanaPage() {
  const settings = useUI((s) => s.settings)
  const now = useUI((s) => s.now)
  const today = todayKey()
  // Dia "ativo": de madrugada, antes de acordar, ainda é a noite de ontem.
  const activeDay = useMemo(() => {
    const { wake } = awakeMinutes(today, settings)
    return minOfDay(now, today) < wake - 30 ? dayKey(addDays(fromDayKey(today), -1)) : today
  }, [today, now, settings])
  const [weekStart, setWeekStart] = useState(() => weekStartOf(fromDayKey(activeDay)))
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const daysKey = days.join(',')
  const [selected, setSelected] = useState(activeDay)
  const [showSkipped, setShowSkipped] = useState(false)
  const [slot, setSlot] = useState<FreeSlot | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Ao trocar de semana, seleciona o dia ativo (se estiver nela) ou a segunda-feira.
  const goWeek = (start: Date) => {
    const ds = weekDays(start)
    setWeekStart(start)
    setSelected(ds.includes(activeDay) ? activeDay : ds[0])
  }

  // Garante que pedras, rotinas e sono existem para a semana exibida.
  useEffect(() => {
    void materializeAround(weekStart, settings)
  }, [weekStart, settings])

  const blocks = useLiveQuery(() => db.blocks.where('day').anyOf(days).toArray(), [daysKey])
  const slots = useLiveQuery(async () => {
    const out: Record<string, FreeSlot[]> = {}
    for (const d of days) out[d] = await freeSlots(d, settings, 20)
    return out
  }, [daysKey, settings])
  const loads = useLiveQuery(async () => {
    const out: Record<string, { busy: number; awake: number }> = {}
    for (const d of days) out[d] = await dayLoad(d, settings)
    return out
  }, [daysKey, settings])

  const byDay = useMemo(() => {
    const m: Record<string, Block[]> = {}
    for (const d of days) m[d] = []
    for (const b of blocks ?? []) (m[b.day] ??= []).push(b)
    return m
  }, [blocks, days])

  const info = useMemo(() => {
    const out: Record<string, DayInfo> = {}
    for (const d of days) {
      const areas = new Set<Area>()
      for (const b of byDay[d] ?? []) if (b.kind !== 'sono' && b.status !== 'pulado') areas.add(b.area)
      const l = loads?.[d]
      out[d] = { areas: (['faculdade', 'trabalho', 'vida'] as Area[]).filter((a) => areas.has(a)), pct: l && l.awake > 0 ? Math.round((l.busy / l.awake) * 100) : 0 }
    }
    return out
  }, [days, byDay, loads])

  const weekPct = useMemo(() => {
    if (!loads) return 0
    let busy = 0
    let awake = 0
    for (const d of days) {
      busy += loads[d]?.busy ?? 0
      awake += loads[d]?.awake ?? 0
    }
    return awake > 0 ? Math.round((busy / awake) * 100) : 0
  }, [loads, days])

  const skippedCount = useMemo(() => (blocks ?? []).filter((b) => b.status === 'pulado').length, [blocks])
  const editing = useMemo(() => (editingId == null ? null : (blocks ?? []).find((b) => b.id === editingId) ?? null), [blocks, editingId])
  useEffect(() => {
    if (editingId != null && blocks && !blocks.some((b) => b.id === editingId)) setEditingId(null)
  }, [blocks, editingId])

  const isCurrentWeek = days.includes(activeDay)
  const isSunday = now.getDay() === 0

  const mobileGeometry = useMemo<Geometry>(() => {
    const { wake, bed } = awakeMinutes(selected, settings)
    return { fromMin: Math.max(0, wake - 30), toMin: bed + 30, ppm: MOBILE_PPM }
  }, [selected, settings])

  const openBlock = (b: Block) => setEditingId(b.id ?? null)
  const columnProps = { settings, now, showSkipped, onBlock: openBlock, onSlot: setSlot }

  return (
    <div>
      <header className="mb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">Semana</h1>
            <p className="text-sm text-muted tabular">{rangeLabel(days)}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="px-2.5" aria-label="Semana anterior" onClick={() => goWeek(addDays(weekStart, -7))}>
              <ChevronLeft size={20} />
            </Button>
            <Button variant={isCurrentWeek ? 'ghost' : 'secondary'} className="px-3 text-sm whitespace-nowrap" onClick={() => goWeek(weekStartOf(fromDayKey(activeDay)))} disabled={isCurrentWeek}>
              Esta semana
            </Button>
            <Button variant="ghost" className="px-2.5" aria-label="Próxima semana" onClick={() => goWeek(addDays(weekStart, 7))}>
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 text-sm">
          <Link
            to="/revisao"
            className={cx('inline-flex items-center gap-1.5 min-h-11 font-semibold underline-offset-2', isSunday ? 'text-accent underline' : 'text-muted hover:text-fg')}
          >
            <ClipboardCheck size={16} aria-hidden="true" /> Revisão da semana
          </Link>
          {skippedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSkipped((v) => !v)}
              aria-pressed={showSkipped}
              className="inline-flex items-center gap-1.5 min-h-11 text-muted hover:text-fg"
            >
              {showSkipped ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              {showSkipped ? 'Esconder pulados' : `Mostrar pulados (${skippedCount})`}
            </button>
          )}
        </div>
      </header>

      {loads && weekPct > settings.maxLoadPct && (
        <div className="mb-3 rounded-xl bg-accent/10 text-fg text-sm px-3 py-2" role="status">
          Semana com <strong className="tabular">{weekPct}%</strong> do tempo útil ocupado. Agenda lotada é agenda abandonada.
        </div>
      )}

      {/* ---- Celular: faixa de dias + um dia por vez ---- */}
      <div className="md:hidden">
        <DayStrip days={days} selected={selected} today={today} info={info} maxLoadPct={settings.maxLoadPct} onSelect={setSelected} />
        <div className="flex items-baseline justify-between mt-3 mb-1">
          <h2 className="text-base font-bold">{fmtDay(fromDayKey(selected), "EEEE, d 'de' MMM")}</h2>
          <span className="text-xs text-muted tabular">{info[selected]?.pct ?? 0}% ocupado</span>
        </div>
        <div className="bg-surface border border-line rounded-2xl py-3 pr-2 overflow-hidden">
          <div className="flex">
            <HourGutter g={mobileGeometry} />
            <DayColumn
              key={selected}
              day={selected}
              blocks={byDay[selected] ?? []}
              slots={slots?.[selected] ?? []}
              g={mobileGeometry}
              className="flex-1"
              {...columnProps}
            />
          </div>
        </div>
      </div>

      {/* ---- Telas largas: grade de 7 colunas ---- */}
      <div className="hidden md:block">
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="min-w-[760px] bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="flex border-b border-line">
              <div className="w-10 shrink-0" aria-hidden="true" />
              {days.map((d) => {
                const date = fromDayKey(d)
                const isToday = d === today
                const inf = info[d]
                return (
                  <div key={d} className={cx('flex-1 min-w-0 px-2 py-2 border-l border-line', isToday && 'bg-accent/5')}>
                    <div className="flex items-baseline gap-1.5">
                      <span className={cx('text-[11px] uppercase tracking-wide font-semibold', isToday ? 'text-accent' : 'text-muted')}>{WEEKDAY_SHORT[date.getDay()]}</span>
                      <span className={cx('text-lg font-extrabold tabular leading-none', isToday && 'text-accent')}>{date.getDate()}</span>
                      <span className="ml-auto text-[11px] text-muted tabular">{inf?.pct ?? 0}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="flex gap-0.5" aria-hidden="true">
                        {(inf?.areas ?? []).map((a) => (
                          <i key={a} className={cx(`area-${a}`, 'area-dot block w-1.5 h-1.5 rounded-full')} />
                        ))}
                      </span>
                      <LoadBar pct={inf?.pct ?? 0} max={settings.maxLoadPct} className="flex-1" />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex py-2 pr-1">
              <HourGutter g={GRID_GEOMETRY} />
              {days.map((d) => (
                <DayColumn
                  key={d}
                  day={d}
                  blocks={byDay[d] ?? []}
                  slots={slots?.[d] ?? []}
                  g={GRID_GEOMETRY}
                  dense
                  className={cx('flex-1 border-l border-line', d === today && 'bg-accent/5')}
                  {...columnProps}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted mt-3">
        Sólido é pedra (fixo); claro é água (tarefa, estudo); tracejado é rotina; listrado é deslocamento. Toque num espaço livre para encaixar algo.
      </p>

      <SlotSheet slot={slot} onClose={() => setSlot(null)} />
      <BlockSheet block={editing} onClose={() => setEditingId(null)} />
    </div>
  )
}

