import { create } from 'zustand'

/* ==========================================================================
   Pomodoro. O estado vive no aparelho (localStorage), não sincroniza:
   cada aparelho tem o seu cronômetro. O tempo é calculado por horário de
   término, então fechar e reabrir o app não perde a contagem.
   ========================================================================== */

export type Phase = 'foco' | 'pausa' | 'pausaLonga'
export type Status = 'parado' | 'rodando' | 'pausado' | 'terminou'

export interface PomodoroState {
  phase: Phase
  status: Status
  /** Duração total da fase atual (ms). */
  totalMs: number
  /** Restante quando pausado/parado (ms). */
  remainingMs: number
  /** Horário de término quando rodando (epoch ms). */
  endsAt: number | null
  startedAt: string | null
  /** Focos completos desde a última pausa longa. */
  round: number
  itemId?: string
  title?: string
}

const KEY = 'agora.pomodoro'

function load(): PomodoroState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PomodoroState) : null
  } catch {
    return null
  }
}

function save(s: PomodoroState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* modo privado */
  }
}

const initial: PomodoroState = {
  phase: 'foco',
  status: 'parado',
  totalMs: 25 * 60000,
  remainingMs: 25 * 60000,
  endsAt: null,
  startedAt: null,
  round: 0,
}

interface Actions {
  set: (patch: Partial<PomodoroState>) => void
}

export const usePomodoro = create<PomodoroState & Actions>((set, get) => ({
  ...(load() ?? initial),
  set: (patch) => {
    set(patch)
    const { set: _omit, ...rest } = { ...get() }
    void _omit
    save(rest)
  },
}))

export function remainingNow(s: PomodoroState, now = Date.now()): number {
  if (s.status === 'rodando' && s.endsAt) return Math.max(0, s.endsAt - now)
  return s.remainingMs
}

export function fmtClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const PHASE_LABEL: Record<Phase, string> = {
  foco: 'Foco',
  pausa: 'Pausa',
  pausaLonga: 'Pausa longa',
}
