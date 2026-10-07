import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, BellOff, Check, Plus, Trash2 } from 'lucide-react'
import { db, ensureSettings, updateSettings, type Habit, type Recurring, type Routine, type SleepWindow } from '../db/schema'
import { useUI } from '../store/ui'
import { dropFutureSleep, materializeAround } from '../lib/materialize'
import { canNotify, requestPermission } from '../lib/notify'
import { todayKey, WEEKDAY_SHORT } from '../lib/time'
import { Button, Field, Input, Label, WeekdayPicker, cx } from '../components/ui'
import { ChipGroup, MultiChips, Toggle } from '../components/config/Chips'
import { CourseForm, removeCourseWithRules } from '../components/config/CourseForm'
import { SleepFields } from '../components/config/SleepFields'
import { FaltaeImport } from '../components/config/ImportSection'

/* ==========================================================================
   Primeiro dia: 6 passos curtos. Cada passo cabe numa tela de celular.
   Pular é permitido a partir do passo 3. Nada aqui gera culpa.
   ========================================================================== */

const TOTAL = 6
const HABIT_OPTIONS = ['Treino', 'Leitura', 'Água', 'Caminhada', 'Meditar']
const TRAVEL = [0, 15, 30, 45, 60].map((v) => ({ value: v, label: v === 0 ? 'Sem' : `${v} min` }))

interface WorkDraft {
  weekdays: number[]
  start: string
  end: string
  location: string
  travelMin: number
}

export default function Onboarding() {
  const setSettings = useUI((s) => s.setSettings)
  const toast = useUI((s) => s.toast)
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)

  // Passo 1
  const [name, setName] = useState('')
  // Passo 2
  const [sleep, setSleep] = useState<{ weekday: SleepWindow; weekend: SleepWindow }>({
    weekday: { bed: '01:30', wake: '08:00' },
    weekend: { bed: '02:00', wake: '09:00' },
  })
  // Passo 3
  const courses = useLiveQuery(() => db.courses.toArray(), [])
  // Passo 4
  const [work, setWork] = useState<WorkDraft>({ weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '15:00', location: '', travelMin: 30 })
  const [workRuleId, setWorkRuleId] = useState<string | null>(null)
  // Passo 5
  const [morning, setMorning] = useState(true)
  const [night, setNight] = useState(true)
  const [habits, setHabits] = useState<string[]>([])
  const [customHabit, setCustomHabit] = useState('')
  // Passo 6
  const [notif, setNotif] = useState<boolean>(() => canNotify())

  const next = () => setStep((s) => Math.min(TOTAL, s + 1))
  const back = () => setStep((s) => Math.max(1, s - 1))

  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  /* ----- persistência de cada passo ----- */

  const saveName = () => run(async () => {
    await updateSettings({ name: name.trim() })
    next()
  })

  const saveSleep = () => run(async () => {
    await updateSettings({ sleepWeekday: sleep.weekday, sleepWeekend: sleep.weekend })
    next()
  })

  const saveWork = () => run(async () => {
    const valid = work.weekdays.length > 0 && work.start < work.end
    if (valid) {
      const rule: Recurring = {
        title: 'Estágio',
        area: 'trabalho',
        kind: 'fixo',
        weekdays: [...work.weekdays].sort(),
        startTime: work.start,
        endTime: work.end,
        location: work.location.trim() || undefined,
        travelMin: work.travelMin,
        active: true,
      }
      if (workRuleId) await db.recurring.put({ ...rule, id: workRuleId })
      else setWorkRuleId((await db.recurring.add(rule)) as string)
    }
    next()
  })

  const saveRoutines = () => run(async () => {
    const s = await ensureSettings()
    const existing = await db.routines.toArray()
    const hasRoutine = (n: string) => existing.some((r) => r.name === n)
    if (morning && !hasRoutine('Manhã')) {
      const r: Routine = {
        name: 'Manhã',
        period: 'manha',
        anchorTime: s.sleepWeekday.wake,
        weekdays: [1, 2, 3, 4, 5],
        steps: [
          { title: 'Banho', minutes: 15 },
          { title: 'Café', minutes: 10 },
          { title: 'Arrumar', minutes: 10 },
          { title: 'Sair', minutes: 5 },
        ],
        active: true,
      }
      await db.routines.add(r)
    }
    if (night && !hasRoutine('Noite')) {
      const r: Routine = {
        name: 'Noite',
        period: 'noite',
        anchorTime: s.nightReviewTime || '21:00',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        steps: [
          { title: 'Fechar o dia', minutes: 2 },
          { title: 'Preparar amanhã', minutes: 10 },
          { title: 'Higiene', minutes: 10 },
          { title: 'Tela off', minutes: 5 },
        ],
        active: true,
      }
      await db.routines.add(r)
    }
    const existingHabits = await db.habits.toArray()
    for (const h of habits) {
      if (existingHabits.some((x) => x.name.toLowerCase() === h.toLowerCase())) continue
      const row: Habit = { name: h, targetPerWeek: 5, active: true }
      await db.habits.add(row)
    }
    next()
  })

  const finish = () => run(async () => {
    await updateSettings({ onboardingDone: true })
    const s = await ensureSettings()
    await dropFutureSleep(todayKey())
    await materializeAround(new Date(), s)
    setSettings(s)
  })

  const addCustomHabit = () => {
    const h = customHabit.trim()
    if (!h || habits.length >= 3 || habits.some((x) => x.toLowerCase() === h.toLowerCase())) return
    setHabits([...habits, h])
    setCustomHabit('')
  }

  /* ----- telas ----- */

  const titles: Record<number, string> = {
    1: 'Como quer ser chamado?',
    2: 'Sono',
    3: 'Faculdade',
    4: 'Trabalho',
    5: 'Rotinas e hábitos',
    6: 'Notificações e instalação',
  }

  let body: ReactNode
  let primary: { label: string; onClick: () => void; disabled?: boolean }

  switch (step) {
    case 1:
      body = (
        <div className="space-y-5">
          <p className="text-muted leading-relaxed">
            Faculdade, trabalho e vida em uma linha do tempo.
            <br />
            Compromissos fixos são pedra, o resto é água.
            <br />
            Você só precisa olhar o que vem agora.
          </p>
          <Field label="Seu nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como quer ser chamado" autoComplete="given-name" autoFocus />
          </Field>
        </div>
      )
      primary = { label: 'Continuar', onClick: saveName }
      break

    case 2:
      body = (
        <div className="space-y-4">
          <p className="text-muted">A hora de verdade, não a ideal. Dá para ajustar depois.</p>
          <SleepFields weekday={sleep.weekday} weekend={sleep.weekend} onChange={setSleep} />
        </div>
      )
      primary = { label: 'Continuar', onClick: saveSleep }
      break

    case 3:
      body = (
        <div className="space-y-4">
          <p className="text-muted">Suas aulas são pedra na linha do tempo. Adicione uma de cada vez.</p>
          {courses && courses.length > 0 && (
            <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
              {courses.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <CourseRuleLine courseId={c.id!} />
                  </div>
                  <button
                    type="button"
                    className="p-2 -mr-1 text-muted"
                    aria-label={`Remover ${c.name}`}
                    onClick={() => void removeCourseWithRules(c.id!)}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <CourseForm onAdded={() => toast('Disciplina adicionada. Quer adicionar outra?')} />
          <div className="pt-1">
            <FaltaeImport compact />
          </div>
        </div>
      )
      primary = { label: courses?.length ? 'Continuar' : 'Continuar sem aulas', onClick: next }
      break

    case 4: {
      const valid = work.weekdays.length > 0 && work.start < work.end
      body = (
        <div className="space-y-4">
          <p className="text-muted">Horário do estágio. O deslocamento entra como bloco antes e depois.</p>
          <div>
            <Label>Dias</Label>
            <WeekdayPicker value={work.weekdays} onChange={(weekdays) => setWork({ ...work, weekdays })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entra">
              <Input type="time" value={work.start} onChange={(e) => setWork({ ...work, start: e.target.value || work.start })} />
            </Field>
            <Field label="Sai">
              <Input type="time" value={work.end} onChange={(e) => setWork({ ...work, end: e.target.value || work.end })} />
            </Field>
          </div>
          <Field label="Onde">
            <Input value={work.location} onChange={(e) => setWork({ ...work, location: e.target.value })} placeholder="Ex.: escritório, home office" autoComplete="off" />
          </Field>
          <div>
            <Label>Deslocamento (cada trecho)</Label>
            <ChipGroup options={TRAVEL} value={work.travelMin} onChange={(travelMin) => setWork({ ...work, travelMin })} ariaLabel="Deslocamento" />
          </div>
        </div>
      )
      primary = { label: 'Continuar', onClick: saveWork, disabled: !valid }
      break
    }

    case 5:
      body = (
        <div className="space-y-5">
          <p className="text-muted">Rotinas prontas para começar. Você edita os passos depois, em Vida.</p>
          <div className="rounded-2xl border border-line bg-surface px-4 divide-y divide-line">
            <Toggle on={morning} onChange={setMorning} label="Manhã" hint="Banho, café, arrumar, sair · seg a sex, na hora de acordar" />
            <Toggle on={night} onChange={setNight} label="Noite" hint="Fechar o dia, preparar amanhã, higiene, tela off · todo dia" />
          </div>
          <div>
            <Label>Até 3 hábitos</Label>
            <MultiChips
              options={[...HABIT_OPTIONS, ...habits.filter((h) => !HABIT_OPTIONS.includes(h))]}
              value={habits}
              onChange={setHabits}
              max={3}
              ariaLabel="Hábitos"
            />
            {habits.length < 3 && (
              <div className="flex gap-2 mt-3">
                <Input
                  value={customHabit}
                  onChange={(e) => setCustomHabit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomHabit()
                    }
                  }}
                  placeholder="Outro hábito"
                  autoComplete="off"
                />
                <Button type="button" onClick={addCustomHabit} disabled={!customHabit.trim()} aria-label="Adicionar hábito">
                  <Plus size={18} />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted mt-2">Meta inicial: 5 vezes por semana. Ajuste depois.</p>
          </div>
        </div>
      )
      primary = { label: 'Continuar', onClick: saveRoutines }
      break

    default:
      body = (
        <div className="space-y-5">
          <p className="text-muted">Avisos só quando tem uma ação: 10 minutos antes, 2 minutos antes e na hora.</p>
          <Button
            variant={notif ? 'secondary' : 'primary'}
            className="w-full"
            disabled={notif || busy}
            onClick={() =>
              run(async () => {
                const ok = await requestPermission()
                await updateSettings({ notificationsEnabled: ok })
                setNotif(ok)
                toast(ok ? 'Notificações ativadas.' : 'Sem permissão por enquanto. Dá para tentar de novo em Configurações.')
              })
            }
          >
            {notif ? (
              <>
                <Check size={18} /> Notificações ativas
              </>
            ) : (
              <>
                <Bell size={18} /> Ativar notificações
              </>
            )}
          </Button>
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm space-y-2">
            <p className="font-bold flex items-center gap-2">
              <BellOff size={16} className="text-muted" /> No iPhone
            </p>
            <p className="text-muted">
              Safari → Compartilhar → <strong className="text-fg">Adicionar à Tela de Início</strong>. Depois disso as notificações funcionam.
            </p>
            <p className="text-muted">Abra o app pelo ícone na tela de início, não pelo Safari.</p>
          </div>
        </div>
      )
      primary = { label: 'Começar', onClick: finish }
      break
  }

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs text-muted mb-2 tabular">
          <span>
            Passo {step} de {TOTAL}
          </span>
          {step >= 3 && (
            <button type="button" className="min-h-8 px-2 font-semibold text-muted" onClick={next} disabled={busy}>
              Pular
            </button>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-line overflow-hidden" aria-hidden="true">
          <i className="block h-full rounded-full bg-accent transition-all" style={{ width: `${(step / TOTAL) * 100}%` }} />
        </div>
      </div>

      <h1 className={cx('font-extrabold leading-tight mb-3', step === 1 ? 'text-3xl' : 'text-2xl')}>{titles[step]}</h1>

      <div className="flex-1">{body}</div>

      <div className="flex gap-2 mt-6">
        {step > 1 && (
          <Button type="button" onClick={back} disabled={busy}>
            Voltar
          </Button>
        )}
        <Button type="button" variant="primary" className="flex-1" onClick={primary.onClick} disabled={busy || primary.disabled}>
          {busy ? 'Salvando…' : primary.label}
        </Button>
      </div>
    </div>
  )
}

/** Linha "seg, qua · 19:00–20:40" de uma disciplina (a partir da regra recorrente). */
function CourseRuleLine({ courseId }: { courseId: string }) {
  const rule = useLiveQuery(() => db.recurring.where('courseId').equals(courseId).first(), [courseId])
  if (!rule) return <p className="text-xs text-muted">Sem horário</p>
  return (
    <p className="text-xs text-muted tabular">
      {rule.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')} · {rule.startTime}–{rule.endTime}
      {rule.location ? ` · ${rule.location}` : ''}
    </p>
  )
}
