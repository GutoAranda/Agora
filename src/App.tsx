import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureSettings, updateSettings } from './db/schema'
import { useUI } from './store/ui'
import { materializeAround } from './lib/materialize'
import { startNotificationLoop } from './lib/notify'
import { sweepUnfinished } from './lib/schedule'
import { todayKey, dayKey, addDays } from './lib/time'
import { Nav } from './components/Nav'
import { Toasts } from './components/Toasts'
import AgoraPage from './pages/Agora'
import SemanaPage from './pages/Semana'
import EntradaPage from './pages/Entrada'
import AreasPage from './pages/Areas'
import FaculdadePage from './pages/Faculdade'
import TrabalhoPage from './pages/Trabalho'
import VidaPage from './pages/Vida'
import RevisaoPage from './pages/Revisao'
import ConfigPage from './pages/Config'
import Onboarding from './pages/Onboarding'
import ContaPage from './pages/Conta'
import { startSync } from './lib/sync'

function Shell() {
  const settings = useUI((s) => s.settings)
  const setSettings = useUI((s) => s.setSettings)
  const tick = useUI((s) => s.tick)
  const location = useLocation()
  const live = useLiveQuery(() => db.settings.get('1'))
  const inboxCount = useLiveQuery(() => db.tasks.where('status').equals('entrada').count(), [], 0)

  // Carrega configurações e materializa a semana atual + próxima.
  useEffect(() => {
    void (async () => {
      const s = await ensureSettings()
      setSettings(s)
      await materializeAround(new Date(), s)
      // Varre dias anteriores: tarefas não feitas voltam para a entrada.
      const last = s.lastOpenedAt ? dayKey(s.lastOpenedAt) : null
      const today = todayKey()
      if (last && last < today) {
        let d = last
        while (d < today) {
          await sweepUnfinished(d)
          d = dayKey(addDays(new Date(d + 'T12:00:00'), 1))
        }
      }
      await updateSettings({ lastOpenedAt: new Date().toISOString() })
    })()
  }, [setSettings])

  useEffect(() => {
    if (live) setSettings(live)
  }, [live, setSettings])

  // Relógio global (1x por 30 s) e notificações.
  useEffect(() => {
    const id = window.setInterval(tick, 30000)
    const stop = startNotificationLoop()
    return () => {
      window.clearInterval(id)
      stop()
    }
  }, [tick])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  // Sincronização com a nuvem (se configurada).
  useEffect(() => {
    let stop: (() => void) | null = null
    void startSync().then((s) => {
      stop = s
    })
    return () => stop?.()
  }, [])

  if (!settings.onboardingDone) return <Onboarding />

  return (
    <div className="min-h-full">
      <main className="max-w-3xl mx-auto px-4 pt-4 safe-bottom">
        <Routes>
          <Route path="/" element={<AgoraPage />} />
          <Route path="/semana" element={<SemanaPage />} />
          <Route path="/entrada" element={<EntradaPage />} />
          <Route path="/areas" element={<AreasPage />} />
          <Route path="/areas/faculdade" element={<FaculdadePage />} />
          <Route path="/areas/trabalho" element={<TrabalhoPage />} />
          <Route path="/areas/vida" element={<VidaPage />} />
          <Route path="/revisao" element={<RevisaoPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/conta" element={<ContaPage />} />
          <Route path="*" element={<AgoraPage />} />
        </Routes>
      </main>
      <Nav inboxCount={inboxCount ?? 0} />
      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
