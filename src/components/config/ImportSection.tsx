import { useState } from 'react'
import { CalendarPlus, FileJson, ListTodo } from 'lucide-react'
import { type Area } from '../../db/schema'
import { parseICS, importIcsEvents, type IcsEvent } from '../../lib/ics'
import { importFaltae, importNotionTasks } from '../../lib/importers'
import { useUI } from '../../store/ui'
import { AreaPicker, Button, Card, Label } from '../ui'
import { FileButton } from './FileButton'

/* Importações: calendário .ics, Faltaê (JSON) e Notion (CSV). */

export function IcsImport() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [events, setEvents] = useState<IcsEvent[] | null>(null)
  const [area, setArea] = useState<Area>('faculdade')
  const [busy, setBusy] = useState(false)

  const recurring = events?.filter((e) => e.rrule && (e.rrule.freq === 'WEEKLY' || e.rrule.freq === 'DAILY') && !e.allDay).length ?? 0
  const single = (events?.length ?? 0) - recurring

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">
        Exporte um calendário (Google, Apple, da faculdade) em .ics. Eventos semanais viram regras fixas; os únicos entram nos próximos 60 dias.
      </p>
      {!events ? (
        <FileButton
          accept=".ics,text/calendar"
          onText={(text) => {
            const evs = parseICS(text)
            if (!evs.length) throw new Error('Não achei eventos nesse arquivo.')
            setEvents(evs)
          }}
        >
          <CalendarPlus size={18} /> Escolher arquivo .ics
        </FileButton>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{events.length}</strong> {events.length === 1 ? 'evento' : 'eventos'} ({recurring} semanais, {single} únicos).
          </p>
          <div>
            <Label>Importar para</Label>
            <AreaPicker value={area} onChange={setArea} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setEvents(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const r = await importIcsEvents(events, area, settings)
                  const parts = [
                    r.recurring ? `${r.recurring} ${r.recurring === 1 ? 'regra semanal' : 'regras semanais'}` : '',
                    r.blocks ? `${r.blocks} ${r.blocks === 1 ? 'bloco' : 'blocos'}` : '',
                    r.reminders ? `${r.reminders} ${r.reminders === 1 ? 'lembrete' : 'lembretes'}` : '',
                  ].filter(Boolean)
                  toast(parts.length ? `Importado: ${parts.join(', ')}.` : 'Nada novo para importar (tudo já existia ou está fora dos 60 dias).')
                  setEvents(null)
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Não consegui importar.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Importando…' : 'Importar'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function FaltaeImport({ compact }: { compact?: boolean }) {
  const toast = useUI((s) => s.toast)
  const [result, setResult] = useState<string | null>(null)
  const button = (
    <FileButton
      accept=".json,application/json"
      onText={async (text) => {
        const r = await importFaltae(text)
        const msg = `${r.courses} ${r.courses === 1 ? 'disciplina' : 'disciplinas'}, ${r.recurring} ${r.recurring === 1 ? 'horário' : 'horários'}, ${r.absences} ${r.absences === 1 ? 'falta' : 'faltas'}${r.skipped ? ` (${r.skipped} já existiam)` : ''}.`
        setResult(msg)
        toast(`Faltaê: ${msg}`)
      }}
    >
      <FileJson size={18} /> Importar do Faltaê (JSON)
    </FileButton>
  )
  if (compact) {
    return (
      <div>
        {button}
        {result && <p className="text-xs text-muted mt-2">{result}</p>}
      </div>
    )
  }
  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Um JSON com suas disciplinas, horários e faltas. Disciplinas com o mesmo nome não são duplicadas.</p>
      {button}
      {result && <p className="text-xs text-muted">{result}</p>}
    </Card>
  )
}

export function NotionImport() {
  const toast = useUI((s) => s.toast)
  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">CSV exportado do Notion (colunas Nome, Status e Prazo). As tarefas abertas vão para a entrada, na área trabalho.</p>
      <FileButton
        accept=".csv,text/csv"
        onText={async (text) => {
          const n = await importNotionTasks(text)
          toast(n ? `${n} ${n === 1 ? 'tarefa entrou' : 'tarefas entraram'} na entrada.` : 'Nenhuma tarefa nova (tudo já existia ou estava concluído).')
        }}
      >
        <ListTodo size={18} /> Importar tarefas do Notion (CSV)
      </FileButton>
    </Card>
  )
}
