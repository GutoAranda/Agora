/* Notificações simples. No iPhone só funcionam com o app instalado na Tela de Início
   e, sem servidor de push, só disparam com o app aberto. */

const ICON = import.meta.env.BASE_URL + 'icon-192.png'

export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

export async function notify(title: string, body: string, tag: string): Promise<void> {
  if (!canNotify()) return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, { body, tag, icon: ICON, badge: ICON })
    else new Notification(title, { body, tag, icon: ICON })
  } catch {
    /* sem suporte */
  }
}

/** Bipe curto via Web Audio (não precisa de arquivo de som). */
let ctx: AudioContext | null = null
export function primeAudio(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* sem áudio */
  }
}

export function chime(): void {
  try {
    ctx ??= new AudioContext()
    const notes = [660, 880, 990]
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx!.currentTime + i * 0.22
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      o.connect(g).connect(ctx!.destination)
      o.start(t)
      o.stop(t + 0.4)
    })
    navigator.vibrate?.([200, 100, 200])
  } catch {
    /* sem áudio */
  }
}
