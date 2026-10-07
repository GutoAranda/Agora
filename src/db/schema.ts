import Dexie, { type EntityTable } from 'dexie'
import { uuid } from '../lib/uuid'

/* ==========================================================================
   Modelo de dados do Agora.
   Regras gerais:
   - Datas/horas absolutas são strings ISO (new Date().toISOString()).
   - Dias são 'yyyy-MM-dd'. Horários do dia são 'HH:mm'.
   - Área: faculdade | trabalho | vida. Tudo na linha do tempo tem área.
   ========================================================================== */

export type Area = 'faculdade' | 'trabalho' | 'vida'
export const AREAS: Area[] = ['faculdade', 'trabalho', 'vida']
export const AREA_LABEL: Record<Area, string> = {
  faculdade: 'Faculdade',
  trabalho: 'Trabalho',
  vida: 'Vida',
}

/** Tipo de bloco na linha do tempo. 'fixo' é pedra; os demais são água. */
export type BlockKind =
  | 'fixo' // aula, estágio, reunião, consulta
  | 'tarefa' // bloco gerado a partir de uma tarefa
  | 'estudo' // bloco de estudo para prova/trabalho
  | 'rotina' // manhã / noite
  | 'descanso' // lazer programado
  | 'sono'
  | 'deslocamento'

export type BlockStatus = 'planejado' | 'iniciado' | 'feito' | 'pulado'

export interface Block {
  id?: string
  title: string
  area: Area
  kind: BlockKind
  start: string // ISO
  end: string // ISO
  status: BlockStatus
  firstStep?: string
  location?: string
  notes?: string
  taskId?: string
  recurringId?: string
  courseId?: string
  deadlineId?: string
  routineId?: string
  startedAt?: string
  doneAt?: string
  /** 'yyyy-MM-dd' do dia a que o bloco pertence (facilita consultas) */
  day: string
}

export type TaskStatus = 'entrada' | 'planejada' | 'feita' | 'espera' | 'solta'

/** Gatilho "se-então": nenhuma tarefa sai da entrada sem um. */
export interface Trigger {
  type: 'horario' | 'lugar' | 'depois'
  /** horario: ISO datetime. lugar/depois: texto ("quando chegar no trabalho", "depois do almoço"). */
  value: string
}

export interface Subtask {
  title: string
  done: boolean
}

export interface Task {
  id?: string
  title: string
  area?: Area
  status: TaskStatus
  trigger?: Trigger
  firstStep?: string
  estimateMin?: number
  dueAt?: string // ISO
  courseId?: string
  deadlineId?: string
  subtasks: Subtask[]
  notes?: string
  createdAt: string
  doneAt?: string
  /** Quantas vezes já foi reposicionada sem ser feita (sinal para quebrar ou soltar). */
  rescheduleCount: number
}

/** Regra recorrente semanal (aula, estágio, treino). Gera blocos 'fixo'. */
export interface Recurring {
  id?: string
  title: string
  area: Area
  kind: BlockKind
  weekdays: number[] // 0 = domingo ... 6 = sábado
  startTime: string // 'HH:mm'
  endTime: string // 'HH:mm'
  location?: string
  /** Minutos de deslocamento antes e depois (gera blocos 'deslocamento'). */
  travelMin?: number
  courseId?: string
  active: boolean
  /** Intervalo de vigência opcional ('yyyy-MM-dd'). */
  from?: string
  until?: string
}

export interface Course {
  id?: string
  name: string
  code?: string
  professor?: string
  room?: string
  /** Número máximo de faltas permitido no semestre. */
  absenceLimit: number
  semesterEnd?: string // 'yyyy-MM-dd'
  notes?: string
}

export interface Absence {
  id?: string
  courseId: string
  date: string // 'yyyy-MM-dd'
  note?: string
}

export type DeadlineType = 'trabalho' | 'prova' | 'leitura' | 'entrega' | 'outro'

export interface Milestone {
  id: string
  title: string
  dueAt: string // ISO
  done: boolean
  estimateMin: number
}

/** Prazo com marcos intermediários (trabalho da faculdade, prova, entrega do estágio). */
export interface Deadline {
  id?: string
  title: string
  area: Area
  type: DeadlineType
  courseId?: string
  dueAt: string // ISO
  estimateMin: number
  milestones: Milestone[]
  done: boolean
  notes?: string
  createdAt: string
}

export interface Reading {
  id?: string
  courseId: string
  title: string
  pages: number
  pagesDone: number
  dueAt?: string
  done: boolean
}

export interface RoutineStep {
  title: string
  minutes: number
}

export interface Routine {
  id?: string
  name: string
  period: 'manha' | 'noite' | 'outro'
  anchorTime: string // 'HH:mm' em que a rotina começa
  weekdays: number[]
  steps: RoutineStep[]
  active: boolean
}

export interface Habit {
  id?: string
  name: string
  targetPerWeek: number
  active: boolean
}

export interface HabitLog {
  id?: string
  habitId: string
  date: string // 'yyyy-MM-dd'
}

export type ReminderRepeat = 'uma' | 'mensal' | 'anual'

/** Aniversários, contas, consultas: lembrete N dias antes e no dia. */
export interface Reminder {
  id?: string
  title: string
  area: Area
  date: string // 'yyyy-MM-dd' (primeira ocorrência)
  repeat: ReminderRepeat
  noticeDays: number
  /** 'yyyy-MM-dd' da última ocorrência marcada como resolvida. */
  lastDoneOn?: string
  notes?: string
}

export interface Review {
  id?: string
  date: string // 'yyyy-MM-dd'
  type: 'noite' | 'domingo'
  answers: Record<string, string>
  createdAt: string
}

/** Fechamento do expediente: o que ficou pendente e o primeiro passo de amanhã. */
export interface WorkClose {
  id?: string
  date: string // 'yyyy-MM-dd'
  pending: string
  firstStepTomorrow: string
}

/** Item na lista de espera do trabalho (ideias, "quando der tempo"). */
export interface ParkedIdea {
  id?: string
  title: string
  area: Area
  notes?: string
  createdAt: string
}

export interface SleepWindow {
  bed: string // 'HH:mm'
  wake: string // 'HH:mm'
}

export interface Settings {
  id: string // sempre 1
  name: string
  sleepWeekday: SleepWindow
  sleepWeekend: SleepWindow
  bufferMin: number // folga entre blocos
  outsideBufferMin: number // folga antes de sair de casa
  nightReviewTime: string // 'HH:mm'
  sundayReviewTime: string // 'HH:mm'
  maxLoadPct: number // aviso de semana lotada
  readingPagesPerHour: number
  notificationsEnabled: boolean
  onboardingDone: boolean
  /** Quando o dia mínimo foi ativado pela última vez ('yyyy-MM-dd'). */
  minimalDayOn?: string
  lastOpenedAt?: string
  createdAt: string
}

export const DEFAULT_SETTINGS: Settings = {
  id: '1',
  name: '',
  sleepWeekday: { bed: '01:30', wake: '08:00' },
  sleepWeekend: { bed: '02:00', wake: '09:00' },
  bufferMin: 15,
  outsideBufferMin: 30,
  nightReviewTime: '21:00',
  sundayReviewTime: '19:00',
  maxLoadPct: 70,
  readingPagesPerHour: 20,
  notificationsEnabled: false,
  onboardingDone: false,
  createdAt: new Date().toISOString(),
}

/** Lápide: registro apagado localmente, ainda não enviado ao servidor. */
export interface Tombstone {
  id: string
  tbl: string
  at: string // ISO
}

export interface SyncMeta {
  key: 'meta'
  lastPush: string
  lastPull: string
}

/** Tabelas que sincronizam com a nuvem (tudo exceto metadados locais). */
export const SYNCED_TABLES = [
  'settings',
  'blocks',
  'tasks',
  'recurring',
  'courses',
  'absences',
  'deadlines',
  'readings',
  'routines',
  'habits',
  'habitLogs',
  'reminders',
  'reviews',
  'workCloses',
  'parked',
] as const

class AgoraDB extends Dexie {
  tombstones!: EntityTable<Tombstone, 'id'>
  syncMeta!: EntityTable<SyncMeta, 'key'>
  settings!: EntityTable<Settings, 'id'>
  blocks!: EntityTable<Block, 'id'>
  tasks!: EntityTable<Task, 'id'>
  recurring!: EntityTable<Recurring, 'id'>
  courses!: EntityTable<Course, 'id'>
  absences!: EntityTable<Absence, 'id'>
  deadlines!: EntityTable<Deadline, 'id'>
  readings!: EntityTable<Reading, 'id'>
  routines!: EntityTable<Routine, 'id'>
  habits!: EntityTable<Habit, 'id'>
  habitLogs!: EntityTable<HabitLog, 'id'>
  reminders!: EntityTable<Reminder, 'id'>
  reviews!: EntityTable<Review, 'id'>
  workCloses!: EntityTable<WorkClose, 'id'>
  parked!: EntityTable<ParkedIdea, 'id'>

  constructor() {
    super('agora')
    this.version(1).stores({
      settings: 'id',
      blocks: 'id, day, start, status, kind, area, taskId, recurringId, courseId, deadlineId, routineId',
      tasks: 'id, status, area, dueAt, courseId, deadlineId, createdAt',
      recurring: 'id, area, courseId, active',
      courses: 'id, name',
      absences: 'id, courseId, date',
      deadlines: 'id, area, courseId, dueAt, done',
      readings: 'id, courseId, done',
      routines: 'id, period, active',
      habits: 'id, active',
      habitLogs: 'id, habitId, date, [habitId+date]',
      reminders: 'id, area, date',
      reviews: 'id, date, type',
      workCloses: 'id, date',
      parked: 'id, area, createdAt',
      tombstones: 'id, tbl',
      syncMeta: 'key',
    })
  }
}

export const db = new AgoraDB()

/* ==========================================================================
   Hooks de sincronização.
   - creating: garante id universal e updatedAt.
   - updating: atualiza updatedAt.
   - deleting: grava uma lápide (para o servidor apagar também).
   Enquanto dados do servidor estão sendo aplicados, os hooks ficam quietos.
   ========================================================================== */

let remoteApplying = false
let changeListener: (() => void) | null = null

export function setRemoteApplying(v: boolean): void {
  remoteApplying = v
}

export function setChangeListener(fn: (() => void) | null): void {
  changeListener = fn
}

function noteChange(): void {
  if (!remoteApplying && changeListener) changeListener()
}

for (const name of SYNCED_TABLES) {
  const table = db.table(name)
  table.hook('creating', function (_primKey, obj) {
    const o = obj as { id?: string; updatedAt?: string }
    if (!o.id) o.id = uuid()
    if (!remoteApplying || !o.updatedAt) o.updatedAt = new Date().toISOString()
    this.onsuccess = () => noteChange()
    return o.id
  })
  table.hook('updating', function (mods) {
    if (remoteApplying) return undefined
    this.onsuccess = () => noteChange()
    return { ...(mods as Record<string, unknown>), updatedAt: new Date().toISOString() }
  })
  table.hook('deleting', function (primKey) {
    if (remoteApplying) return
    const id = String(primKey)
    void Dexie.ignoreTransaction(() => db.tombstones.put({ id, tbl: name, at: new Date().toISOString() }))
    this.onsuccess = () => noteChange()
  })
}

/** Garante que a linha de configurações existe e a devolve. */
export async function ensureSettings(): Promise<Settings> {
  const s = await db.settings.get('1')
  if (s) return s
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const s = await ensureSettings()
  await db.settings.put({ ...s, ...patch, id: '1' })
}

/** Exporta tudo em JSON (backup). */
export async function exportAll(): Promise<string> {
  const tables = db.tables
  const out: Record<string, unknown[]> = {}
  for (const t of tables) out[t.name] = await t.toArray()
  return JSON.stringify({ app: 'agora', version: 1, exportedAt: new Date().toISOString(), data: out }, null, 2)
}

/** Importa um backup JSON, substituindo tudo. */
export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, unknown[]> }
  if (parsed.app !== 'agora' || !parsed.data) throw new Error('Arquivo não é um backup do Agora.')
  const data = parsed.data
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear()
      const rows = data[t.name]
      if (Array.isArray(rows) && rows.length) await t.bulkPut(rows as never[])
    }
  })
}
