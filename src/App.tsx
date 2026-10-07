import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, ensureSettings, sweepPast } from './db/schema'
import { useUI } from './store/ui'
import { todayKey, addMinutes, atTime } from './lib/time'
import { notify } from './lib/notify'
import { startSync } from './lib/sync'
import { tick as pomodoroTick, syncDuration } from './tools/pomodoro/engine'
import { Nav } from './components/Nav'
import { Toasts } from './components/Toasts'
import AgoraPage from './pages/Agora'
import HojePage from './pages/Hoje'
import AjustesPage from './pages/Ajustes'
import ContaPage from './pages/Conta'
import FocoPage from './tools/pomodoro/FocoPage'

const fired = new Set<string>()

function Shell() {
  const settings = useUI((s) => s.settings)
  const setSettings = useUI((s) => s.setSettings)
  const tick = useUI((s) => s.tick)
  const toast = useUI((s) => s.toast)
  const location = useLocation()
  const live = useLiveQuery(() => db.settings.get('1'))

  // Ajustes + coisas de dias passados vão para "algum dia".
  useEffect(() => {
    void (async () => {
      setSettings(await ensureSettings())
      const n = await sweepPast(todayKey())
      if (n) toast(`${n} ${n === 1 ? 'coisa de antes foi' : 'coisas de antes foram'} para "Algum dia".`)
    })()
  }, [setSettings, toast])

  useEffect(() => {
    if (live) setSettings({ ...DEFAULT_SETTINGS, ...live })
  }, [live, setSettings])

  useEffect(() => {
    syncDuration(settings)
  }, [settings])

  // Relógio: tela (30 s), pomodoro (0,5 s) e avisos de compromisso.
  useEffect(() => {
    const slow = window.setInterval(() => {
      tick()
      void remindCommitments()
    }, 30000)
    const fast = window.setInterval(() => void pomodoroTick(useUI.getState().settings), 500)
    return () => {
      window.clearInterval(slow)
      window.clearInterval(fast)
    }
  }, [tick])

  useEffect(() => {
    let stop: (() => void) | null = null
    void startSync().then((s) => {
      stop = s
    })
    return () => stop?.()
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-full">
      <main className="max-w-md mx-auto px-4 pt-4 safe-bottom">
        <Routes>
          <Route path="/" element={<AgoraPage />} />
          <Route path="/hoje" element={<HojePage />} />
          <Route path="/foco" element={<FocoPage />} />
          <Route path="/ajustes" element={<AjustesPage />} />
          <Route path="/conta" element={<ContaPage />} />
          <Route path="*" element={<AgoraPage />} />
        </Routes>
      </main>
      <Nav />
      <Toasts />
    </div>
  )
}

/** Aviso na hora de sair e 5 min antes de compromissos de hoje (com o app aberto). */
async function remindCommitments() {
  const day = todayKey()
  const now = Date.now()
  const items = await db.items.toArray()
  const wd = new Date().getDay()
  for (const i of items) {
    if (!i.time) continue
    const applies = i.repeat?.length ? i.repeat.includes(wd) : i.day === day
    if (!applies) continue
    const start = atTime(day, i.time)
    const leave = i.travelTo ? addMinutes(start, -i.travelTo) : null
    const checks: [Date, string, string][] = [[addMinutes(start, -5), `Em 5 min: ${i.title}`, i.firstStep ? `Comece por: ${i.firstStep}` : 'Vai fechando o que está fazendo.']]
    if (leave) checks.push([leave, `Hora de sair: ${i.title}`, i.travelHow ? `${i.travelTo} min de ${i.travelHow}` : `${i.travelTo} min de trajeto`])
    for (const [at, title, body] of checks) {
      const key = `${i.id}:${day}:${at.getTime()}`
      const diff = now - at.getTime()
      if (diff >= 0 && diff < 60000 && !fired.has(key)) {
        fired.add(key)
        await notify(title, body, key)
      }
    }
  }
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Shell />
    </BrowserRouter>
  )
}
