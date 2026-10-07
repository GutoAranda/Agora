import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { db } from '../../db/schema'
import { Button, Card, Field, Input } from '../ui'

/* Zona de risco: apagar tudo, com confirmação digitada. */

const WORD = 'APAGAR'

export function DangerZone() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Card className="border-warn/30 space-y-3">
      <p className="text-sm text-muted">Apaga tudo deste aparelho: aulas, tarefas, rotinas, histórico. Não tem volta. Faça um backup antes.</p>
      {!open ? (
        <Button variant="danger" className="w-full" onClick={() => setOpen(true)}>
          <Trash2 size={18} /> Apagar todos os dados
        </Button>
      ) : (
        <div className="space-y-3">
          <Field label={`Digite ${WORD} para confirmar`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder={WORD} />
          </Field>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setTyped('')
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={typed !== WORD || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await db.delete()
                  try {
                    window.localStorage.clear()
                  } catch {
                    /* sem localStorage */
                  }
                } finally {
                  window.location.reload()
                }
              }}
            >
              {busy ? 'Apagando…' : 'Apagar de vez'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
