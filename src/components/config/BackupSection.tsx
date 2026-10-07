import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { exportAll, importAll } from '../../db/schema'
import { todayKey } from '../../lib/time'
import { useUI } from '../../store/ui'
import { Button, Card } from '../ui'
import { FileButton } from './FileButton'

/* Backup: exporta tudo em JSON e importa substituindo. */

export async function downloadBackup(): Promise<void> {
  const json = await exportAll()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `agora-backup-${todayKey()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function BackupSection() {
  const toast = useUI((s) => s.toast)
  const [pending, setPending] = useState<{ text: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Seus dados ficam só neste aparelho. Um backup de vez em quando evita susto.</p>
      <Button
        className="w-full"
        onClick={async () => {
          try {
            await downloadBackup()
            toast('Backup gerado.')
          } catch {
            toast('Não consegui gerar o backup.')
          }
        }}
      >
        <Download size={18} /> Exportar backup
      </Button>
      {!pending ? (
        <FileButton
          accept=".json,application/json"
          onText={(text, file) => {
            const parsed = JSON.parse(text) as { app?: string }
            if (parsed.app !== 'agora') throw new Error('Esse arquivo não é um backup do Agora.')
            setPending({ text, name: file.name })
          }}
        >
          <Upload size={18} /> Importar backup
        </FileButton>
      ) : (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 space-y-2">
          <p className="text-sm">
            Importar <strong>{pending.name}</strong> substitui tudo que está neste aparelho. Quer continuar?
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setPending(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await importAll(pending.text)
                  window.location.reload()
                } catch (err) {
                  setBusy(false)
                  setPending(null)
                  toast(err instanceof Error ? err.message : 'Não consegui importar.')
                }
              }}
            >
              {busy ? 'Importando…' : 'Substituir tudo'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
