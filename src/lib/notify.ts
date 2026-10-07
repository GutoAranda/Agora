import { db } from '../db/schema'
import { parseISO, todayKey } from './time'

/* ==========================================================================
   Notificações: só as que trazem uma ação. Escalada de transição:
   10 min antes (discreta), 2 min antes, na hora.
   Funciona enquanto o app está aberto ou instalado (web push sem servidor
   não existe; usamos timers + Notification API + badge).
   ========================================================================== */

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const r = await Notification.requestPermission()
  return r === 'granted'
}

export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

async function show(title: string, body: string, tag: string): Promise<void> {
  if (!canNotify()) return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', renotify: true } as NotificationOptions)
      return
    }
    new Notification(title, { body, tag, icon: '/icon-192.png' })
  } catch {
    /* ambiente sem suporte */
  }
}

const fired = new Set<string>()

/** Roda a cada minuto enquanto o app está aberto. */
export async function tickNotifications(): Promise<void> {
  if (!canNotify()) return
  const now = Date.now()
  const blocks = (await db.blocks.where('day').equals(todayKey()).toArray()).filter(
    (b) => b.status === 'planejado' && b.kind !== 'sono',
  )
  for (const b of blocks) {
    const start = parseISO(b.start).getTime()
    const diffMin = Math.round((start - now) / 60000)
    const key = (n: number) => `${b.id}:${n}`
    if (diffMin === 10 && !fired.has(key(10))) {
      fired.add(key(10))
      await show(`Em 10 min: ${b.title}`, b.firstStep ? `Primeiro passo: ${b.firstStep}` : 'Vai chegando ao fim do que está fazendo.', key(10))
    } else if (diffMin === 2 && !fired.has(key(2))) {
      fired.add(key(2))
      await show(`Em 2 min: ${b.title}`, 'Hora de trocar. Salve onde parou.', key(2))
    } else if (diffMin === 0 && !fired.has(key(0))) {
      fired.add(key(0))
      await show(`Agora: ${b.title}`, b.firstStep ? `Comece por: ${b.firstStep}` : 'Toque em Começar.', key(0))
    }
  }
}

export function startNotificationLoop(): () => void {
  void tickNotifications()
  const id = window.setInterval(() => void tickNotifications(), 30000)
  return () => window.clearInterval(id)
}
