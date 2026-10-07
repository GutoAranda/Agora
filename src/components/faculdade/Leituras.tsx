import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { db, type Course, type Reading } from '../../db/schema'
import { freeSlots } from '../../lib/schedule'
import { addDays, addMinutes, dayKey, fmtDuration, hhmm, todayKey } from '../../lib/time'
import { useUI } from '../../store/ui'
import { Button, Card, Chip, Empty, Field, Input, Select, Sheet } from '../ui'
import { ProgressBar, confirmAsk } from './shared'

/* ==========================================================================
   Leituras por disciplina: páginas, progresso, tempo restante estimado,
   "+10 páginas" e agendamento no primeiro espaço livre.
   ========================================================================== */

function remainingMinutes(r: Reading, pagesPerHour: number): number {
  const left = Math.max(0, r.pages - r.pagesDone)
  const pph = pagesPerHour > 0 ? pagesPerHour : 20
  return Math.ceil((left / pph) * 60)
}

/** Cria um bloco de estudo no primeiro espaço livre de hoje ou amanhã. Devolve o início ou null. */
async function scheduleReading(r: Reading, minutes: number, pagesPerHour: number, settings: Parameters<typeof freeSlots>[1]): Promise<Date | null> {
  const now = new Date()
  const days = [todayKey(), dayKey(addDays(now, 1))]
  const need = Math.max(15, Math.min(minutes, 60))
  for (let i = 0; i < days.length; i++) {
    const slots = await freeSlots(days[i], settings, 15, i === 0 ? now : undefined)
    const slot = slots.find((s) => s.minutes >= need) ?? slots[0]
    if (!slot) continue
    const len = Math.min(need, slot.minutes)
    const pagesInBlock = Math.max(1, Math.round((len / 60) * (pagesPerHour > 0 ? pagesPerHour : 20)))
    await db.blocks.add({
      title: `Ler: ${r.title}`,
      area: 'faculdade',
      kind: 'estudo',
      start: slot.start.toISOString(),
      end: addMinutes(slot.start, len).toISOString(),
      status: 'planejado',
      firstStep: `Abrir na página ${r.pagesDone + 1}`,
      notes: `leitura:${r.id} · até a página ${Math.min(r.pages, r.pagesDone + pagesInBlock)}`,
      courseId: r.courseId,
      day: days[i],
    })
    return slot.start
  }
  return null
}

function ReadingSheet({ reading, courses, onClose }: { reading: Partial<Reading> | null; courses: Course[]; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  const [title, setTitle] = useState(reading?.title ?? '')
  const [courseId, setCourseId] = useState<number | undefined>(reading?.courseId ?? courses[0]?.id)
  const [pages, setPages] = useState(reading?.pages ?? 30)
  const [pagesDone, setPagesDone] = useState(reading?.pagesDone ?? 0)
  const [dueAt, setDueAt] = useState(reading?.dueAt ? reading.dueAt.slice(0, 10) : '')
  if (!reading) return null
  const isNew = !reading.id
  const valid = title.trim().length > 0 && !!courseId && pages > 0

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Nova leitura' : 'Editar leitura'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return
          const done = Math.min(pages, Math.max(0, pagesDone))
          await db.readings.put({
            ...(reading.id ? { id: reading.id } : {}),
            courseId: courseId!,
            title: title.trim(),
            pages: Math.max(1, Math.round(pages)),
            pagesDone: done,
            dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : undefined,
            done: done >= pages,
          })
          toast(isNew ? 'Leitura adicionada.' : 'Leitura salva.')
          onClose()
        }}
      >
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Capítulo 4 — Termodinâmica" autoFocus={isNew} />
        </Field>
        <Field label="Disciplina">
          <Select value={courseId ?? ''} onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">— escolha —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Páginas">
            <Input type="number" inputMode="numeric" min={1} value={pages} onChange={(e) => setPages(Number(e.target.value))} />
          </Field>
          <Field label="Já lidas">
            <Input type="number" inputMode="numeric" min={0} value={pagesDone} onChange={(e) => setPagesDone(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Para quando" hint="Opcional.">
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            {isNew ? 'Adicionar' : 'Salvar'}
          </Button>
        </div>
        {!isNew && (
          <Button
            type="button"
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (!confirmAsk(`Apagar a leitura "${reading.title}"?`)) return
              await db.readings.delete(reading.id!)
              toast('Leitura apagada.')
              onClose()
            }}
          >
            <Trash2 size={18} /> Apagar leitura
          </Button>
        )}
      </form>
    </Sheet>
  )
}

export function Leituras({ courses }: { courses: Course[] }) {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const readings = useLiveQuery(() => db.readings.toArray(), [], [] as Reading[])
  const [edit, setEdit] = useState<Partial<Reading> | null>(null)
  const [showDone, setShowDone] = useState(false)

  const list = (readings ?? []).filter((r) => showDone || !r.done)
  const groups = courses
    .map((c) => ({ course: c, items: list.filter((r) => r.courseId === c.id) }))
    .filter((g) => g.items.length > 0)
  const orphan = list.filter((r) => !courses.some((c) => c.id === r.courseId))
  const doneCount = (readings ?? []).filter((r) => r.done).length

  async function bump(r: Reading, n: number) {
    const pagesDone = Math.min(r.pages, r.pagesDone + n)
    await db.readings.update(r.id!, { pagesDone, done: pagesDone >= r.pages })
    if (pagesDone >= r.pages) toast('Leitura concluída. Boa.')
  }

  function ReadingRow({ r }: { r: Reading }) {
    const left = remainingMinutes(r, settings.readingPagesPerHour)
    const pct = r.pages > 0 ? (r.pagesDone / r.pages) * 100 : 0
    return (
      <li className="py-3 first:pt-0 last:pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">{r.title}</p>
            <p className="text-xs text-muted tabular">
              {r.pagesDone}/{r.pages} páginas
              {r.done ? ' · concluída' : ` · faltam ${fmtDuration(left)} de leitura`}
            </p>
          </div>
          <button type="button" className="p-2 -mr-2 text-muted shrink-0" aria-label={`Editar ${r.title}`} onClick={() => setEdit(r)}>
            <Pencil size={18} />
          </button>
        </div>
        <div className="mt-2">
          <ProgressBar pct={pct} tone={r.done ? 'ok' : 'accent'} label={`Progresso de ${r.title}`} />
        </div>
        {!r.done && (
          <div className="flex gap-2 mt-2">
            <Button className="flex-1 min-h-10 text-sm" onClick={() => void bump(r, 10)}>
              <Plus size={16} /> 10 páginas
            </Button>
            <Button
              className="flex-1 min-h-10 text-sm"
              onClick={async () => {
                const start = await scheduleReading(r, left, settings.readingPagesPerHour, settings)
                toast(start ? `Leitura marcada ${dayKey(start) === todayKey() ? 'hoje' : 'amanhã'} às ${hhmm(start)}.` : 'Não achei espaço livre hoje nem amanhã.')
              }}
            >
              <CalendarPlus size={16} /> Agendar
            </Button>
          </div>
        )}
      </li>
    )
  }

  return (
    <div>
      {groups.length === 0 && orphan.length === 0 ? (
        <Empty
          title="Nenhuma leitura"
          hint={courses.length ? 'Cadastre capítulos e artigos; eu estimo o tempo e encaixo na agenda.' : 'Primeiro cadastre uma disciplina.'}
          action={
            courses.length ? (
              <Button variant="primary" onClick={() => setEdit({})}>
                <BookOpen size={18} /> Nova leitura
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.course.id} area="faculdade">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wider area-text">{g.course.name}</p>
                <Chip>{g.items.length}</Chip>
              </div>
              <ul className="divide-y divide-line">
                {g.items.map((r) => (
                  <ReadingRow key={r.id} r={r} />
                ))}
              </ul>
            </Card>
          ))}
          {orphan.length > 0 && (
            <Card>
              <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Sem disciplina</p>
              <ul className="divide-y divide-line">
                {orphan.map((r) => (
                  <ReadingRow key={r.id} r={r} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {(groups.length > 0 || orphan.length > 0) && courses.length > 0 && (
          <Button className="flex-1" onClick={() => setEdit({})}>
            <BookOpen size={18} /> Nova leitura
          </Button>
        )}
        {doneCount > 0 && (
          <Button variant="ghost" className="text-sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Esconder concluídas' : `Ver concluídas (${doneCount})`}
          </Button>
        )}
      </div>

      <ReadingSheet key={edit?.id ?? (edit ? 'new' : 'closed')} reading={edit} courses={courses} onClose={() => setEdit(null)} />
    </div>
  )
}
