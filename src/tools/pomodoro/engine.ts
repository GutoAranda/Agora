import { db, type Settings } from '../../db/schema'
import { chime, notify, primeAudio, requestPermission } from '../../lib/notify'
import { todayKey } from '../../lib/time'
import { cancelPush, pushEnabled, schedulePush } from '../../lib/push'
import { usePomodoro, remainingNow, type Phase } from './store'

/* Motor do pomodoro: ações e o "tique" que detecta o fim da fase. */

function minutesFor(phase: Phase, s: Settings): number {
  return phase === 'foco' ? s.focusMin : phase === 'pausa' ? s.breakMin : s.longBreakMin
}

const TAG = 'pomodoro'
const FOCO_URL = import.meta.env.BASE_URL + 'foco'

/** Agenda no servidor o aviso de fim da fase (chega mesmo com o app fechado). */
function scheduleEnd(phase: Phase, endsAt: number, title?: string) {
  const t = phase === 'foco' ? 'Foco concluído' : 'Pausa acabou'
  const b = phase === 'foco' ? (title ? `“${title}”: hora de uma pausa curta.` : 'Hora de uma pausa curta.') : 'Pronto para mais um foco?'
  void schedulePush(TAG, new Date(endsAt), t, b, FOCO_URL)
}

let wakeLock: { release: () => Promise<void> } | null = null
async function keepAwake(on: boolean) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen')
    } else if (!on && wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  } catch {
    wakeLock = null
  }
}

/** Escolhe no que focar (opcional). */
export function chooseTarget(itemId?: string, title?: string) {
  usePomodoro.getState().set({ itemId, title })
}

/** Ajusta a duração quando o cronômetro está parado (ex.: mudou nos ajustes). */
let appliedKey = ''
export function syncDuration(s: Settings) {
  const key = `${s.focusMin}|${s.breakMin}|${s.longBreakMin}`
  if (key === appliedKey) return
  const first = appliedKey === ''
  appliedKey = key
  const st = usePomodoro.getState()
  // Na abertura do app, respeita uma escolha rápida (15/45) feita antes.
  if (first && st.status === 'parado' && st.totalMs !== st.remainingMs) return
  if (st.status !== 'parado') return
  const ms = minutesFor(st.phase, s) * 60000
  if (st.totalMs !== ms) st.set({ totalMs: ms, remainingMs: ms })
}

export function setFocusLength(min: number) {
  const st = usePomodoro.getState()
  if (st.status === 'rodando') return
  st.set({ phase: 'foco', status: 'parado', totalMs: min * 60000, remainingMs: min * 60000, endsAt: null })
}

export function start() {
  primeAudio()
  void requestPermission()
  const st = usePomodoro.getState()
  const remaining = st.status === 'terminou' ? st.totalMs : st.remainingMs
  const endsAt = Date.now() + remaining
  scheduleEnd(st.phase, endsAt, st.title)
  st.set({
    status: 'rodando',
    endsAt,
    startedAt: st.status === 'pausado' && st.startedAt ? st.startedAt : new Date().toISOString(),
  })
  void keepAwake(true)
}

export function pause() {
  const st = usePomodoro.getState()
  if (st.status !== 'rodando') return
  st.set({ status: 'pausado', remainingMs: remainingNow(st), endsAt: null })
  void cancelPush(TAG)
  void keepAwake(false)
}

export function reset(s: Settings) {
  const st = usePomodoro.getState()
  const ms = minutesFor(st.phase, s) * 60000
  st.set({ status: 'parado', totalMs: ms, remainingMs: ms, endsAt: null, startedAt: null })
  void keepAwake(false)
  void cancelPush(TAG)
}

/** Vai para a próxima fase (foco → pausa → foco), parada, pronta para começar. */
export function next(s: Settings) {
  const st = usePomodoro.getState()
  let phase: Phase
  if (st.phase === 'foco') phase = st.round > 0 && st.round % s.roundsUntilLong === 0 ? 'pausaLonga' : 'pausa'
  else phase = 'foco'
  const ms = minutesFor(phase, s) * 60000
  const wasRunning = st.status === 'rodando'
  st.set({ phase, status: 'parado', totalMs: ms, remainingMs: ms, endsAt: null, startedAt: null, round: phase === 'pausaLonga' ? 0 : st.round })
  void keepAwake(false)
  if (wasRunning) void cancelPush(TAG)
}

/** Chamado a cada meio segundo pelo App. */
export async function tick(s: Settings) {
  const st = usePomodoro.getState()
  if (st.status !== 'rodando' || remainingNow(st) > 0) return
  const wasFocus = st.phase === 'foco'
  st.set({ status: 'terminou', remainingMs: 0, endsAt: null, round: wasFocus ? st.round + 1 : st.round })
  void keepAwake(false)
  if (s.sound) chime()
  if (wasFocus) {
    await db.focus.add({
      day: todayKey(),
      startedAt: st.startedAt ?? new Date(Date.now() - st.totalMs).toISOString(),
      minutes: Math.round(st.totalMs / 60000),
      itemId: st.itemId,
      title: st.title,
    })
    if (!pushEnabled()) void notify('Foco concluído', 'Hora de uma pausa curta.', TAG)
  } else {
    if (!pushEnabled()) void notify('Pausa acabou', 'Pronto para mais um foco?', TAG)
  }
}
