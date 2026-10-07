import { useEffect, useState } from 'react'
import { Cloud, CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { cloudEnabled } from '../lib/supabase'
import { getSyncState, onSyncState, syncNow, type SyncState } from '../lib/sync'
import { cx } from './ui'

/** Indicador discreto de sincronização (cabeçalhos). */
export function SyncStatus({ className }: { className?: string }) {
  const [s, setS] = useState<{ state: SyncState; detail: string }>(getSyncState())
  useEffect(() => onSyncState((state, detail) => setS({ state, detail: detail ?? '' })), [])
  if (!cloudEnabled) return null
  const map: Record<SyncState, { icon: typeof Cloud; label: string; tone: string }> = {
    local: { icon: CloudOff, label: 'Local', tone: 'text-muted' },
    'signed-out': { icon: CloudOff, label: 'Sem conta', tone: 'text-muted' },
    offline: { icon: WifiOff, label: 'Offline', tone: 'text-muted' },
    idle: { icon: Cloud, label: s.detail ? `Sinc. ${s.detail}` : 'Sincronizado', tone: 'text-ok' },
    syncing: { icon: Loader2, label: 'Sincronizando', tone: 'text-accent' },
    error: { icon: RefreshCw, label: 'Erro ao sincronizar', tone: 'text-warn' },
  }
  const { icon: Icon, label, tone } = map[s.state]
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={s.state === 'error' ? s.detail : 'Sincronizar agora'}
      className={cx('inline-flex items-center gap-1 text-xs font-semibold', tone, className)}
    >
      <Icon size={14} className={s.state === 'syncing' ? 'animate-spin' : ''} /> {label}
    </button>
  )
}
