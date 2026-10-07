import { supabase } from './supabase'
import { requestPermission } from './notify'

/* ==========================================================================
   Avisos com o app fechado (Web Push via Supabase).
   O app agenda um aviso no servidor quando o pomodoro começa e cancela
   quando pausa. A função agora-push entrega no segundo exato.
   ========================================================================== */

const FN_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') + '/functions/v1/agora-push'
const ON_KEY = 'agora.push.on'

export function pushSupported(): boolean {
  return !!supabase && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushEnabled(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === '1'
  } catch {
    return false
  }
}

function setEnabled(v: boolean) {
  try {
    if (v) localStorage.setItem(ON_KEY, '1')
    else localStorage.removeItem(ON_KEY)
  } catch {
    /* modo privado */
  }
}

/** Chave pública que o servidor serve. Vazia = servidor ainda não configurado. */
export async function serverPublicKey(): Promise<string> {
  if (!supabase) return ''
  try {
    const r = await fetch(FN_URL, { method: 'GET' })
    if (!r.ok) return ''
    const j = (await r.json()) as { publicKey?: string }
    return j.publicKey ?? ''
  } catch {
    return ''
  }
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Liga os avisos neste aparelho. Precisa ser chamado a partir de um toque. */
export async function enablePush(): Promise<{ ok: boolean; motivo?: string }> {
  if (!pushSupported()) return { ok: false, motivo: 'Este navegador não aceita avisos. No iPhone, abra pelo ícone da Tela de Início.' }
  if (!(await requestPermission())) return { ok: false, motivo: 'Avisos bloqueados. Libere em Ajustes do iPhone → Notificações → Agora.' }
  const key = await serverPublicKey()
  if (!key) return { ok: false, motivo: 'O servidor de avisos ainda não está configurado.' }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  const want = b64urlToBytes(key)
  // Se a chave do servidor mudou, refaz a inscrição.
  if (sub) {
    const have = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
    if (!have || have.length !== want.length || have.some((b, i) => b !== want[i])) {
      await sub.unsubscribe()
      sub = null
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want })
  setEnabled(true)
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  setEnabled(false)
  const sub = await currentSubscription()
  await sub?.unsubscribe()
}

/** Agenda (ou reagenda) um aviso. Silencioso se os avisos estiverem desligados. */
export async function schedulePush(tag: string, sendAt: Date, title: string, body: string, url?: string): Promise<boolean> {
  if (!supabase || !pushEnabled()) return false
  try {
    const sub = await currentSubscription()
    if (!sub) return false
    const { error } = await supabase.rpc('schedule_push', {
      sub: sub.toJSON(),
      p_tag: tag,
      p_title: title,
      p_body: body,
      p_send_at: sendAt.toISOString(),
      p_url: url ?? null,
    })
    return !error
  } catch {
    return false
  }
}

export async function cancelPush(tag: string): Promise<void> {
  if (!supabase || !pushEnabled()) return
  try {
    const sub = await currentSubscription()
    if (sub) await supabase.rpc('cancel_push', { p_endpoint: sub.endpoint, p_tag: tag })
  } catch {
    /* sem rede: o aviso pode chegar; não é grave */
  }
}

/* ---------- Configuração: gerar chaves no próprio aparelho ---------- */

function bytesToB64url(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const x of u) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Gera um par de chaves VAPID (P-256) e um segredo para o agendador. Tudo no aparelho. */
export async function generateServerSecrets(): Promise<{ publicKey: string; privateKey: string; cronSecret: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pub = await crypto.subtle.exportKey('raw', pair.publicKey)
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const rand = crypto.getRandomValues(new Uint8Array(24))
  return { publicKey: bytesToB64url(pub), privateKey: jwk.d ?? '', cronSecret: bytesToB64url(rand) }
}

export const PUSH_FUNCTION_URL = FN_URL
