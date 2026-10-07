import { db, type Block, type BlockKind } from '../db/schema'
import { parseISO } from './time'

/* ==========================================================================
   Calibração de tempo: mede quanto cada tipo de bloco leva de verdade
   (do "começar" ao "feito") e sugere durações realistas.
   ========================================================================== */

const MIN_SAMPLES = 5

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ')
}

export function actualMinutes(b: Block): number | null {
  if (!b.startedAt || !b.doneAt) return null
  const m = (parseISO(b.doneAt).getTime() - parseISO(b.startedAt).getTime()) / 60000
  return m > 0 && m < 12 * 60 ? Math.round(m) : null
}

export function plannedMinutes(b: Block): number {
  return Math.round((parseISO(b.end).getTime() - parseISO(b.start).getTime()) / 60000)
}

export interface CalibrationRow {
  key: string
  kind: BlockKind
  label: string
  samples: number
  medianActual: number
  medianPlanned: number
  /** fator = real / planejado (1.0 = estimativa certa; 2.0 = leva o dobro) */
  factor: number
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/** Tabela de calibração a partir dos blocos concluídos. */
export async function calibrationTable(): Promise<CalibrationRow[]> {
  const done = await db.blocks.where('status').equals('feito').toArray()
  const groups = new Map<string, { kind: BlockKind; label: string; actual: number[]; planned: number[] }>()
  for (const b of done) {
    const a = actualMinutes(b)
    if (a === null) continue
    const key = b.kind === 'rotina' || b.kind === 'fixo' ? `${b.kind}:${normalizeTitle(b.title)}` : `${b.kind}:${normalizeTitle(b.title)}`
    const g = groups.get(key) ?? { kind: b.kind, label: b.title, actual: [], planned: [] }
    g.actual.push(a)
    g.planned.push(plannedMinutes(b))
    groups.set(key, g)
  }
  const rows: CalibrationRow[] = []
  for (const [key, g] of groups) {
    const ma = median(g.actual)
    const mp = median(g.planned)
    rows.push({ key, kind: g.kind, label: g.label, samples: g.actual.length, medianActual: ma, medianPlanned: mp, factor: mp ? ma / mp : 1 })
  }
  return rows.sort((a, b) => b.samples - a.samples)
}

/** Estimativa calibrada para um título/tipo, se houver amostras suficientes. */
export async function estimateFor(kind: BlockKind, title: string): Promise<number | null> {
  const rows = await calibrationTable()
  const row = rows.find((r) => r.key === `${kind}:${normalizeTitle(title)}`)
  if (!row || row.samples < MIN_SAMPLES) return null
  return Math.round(row.medianActual / 5) * 5
}

/** Linhas calibradas que divergem bastante do planejado (para mostrar "ajustei"). */
export async function calibrationInsights(): Promise<CalibrationRow[]> {
  const rows = await calibrationTable()
  return rows.filter((r) => r.samples >= MIN_SAMPLES && (r.factor >= 1.3 || r.factor <= 0.7))
}

/** Erro médio absoluto de estimativa (minutos) por semana, para ver se está caindo. */
export async function estimateErrorByWeek(): Promise<{ week: string; error: number; samples: number }[]> {
  const done = await db.blocks.where('status').equals('feito').toArray()
  const byWeek = new Map<string, number[]>()
  for (const b of done) {
    const a = actualMinutes(b)
    if (a === null) continue
    const d = parseISO(b.start)
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const key = monday.toISOString().slice(0, 10)
    const arr = byWeek.get(key) ?? []
    arr.push(Math.abs(a - plannedMinutes(b)))
    byWeek.set(key, arr)
  }
  return [...byWeek.entries()]
    .map(([week, errs]) => ({ week, error: Math.round(errs.reduce((n, x) => n + x, 0) / errs.length), samples: errs.length }))
    .sort((a, b) => a.week.localeCompare(b.week))
}
