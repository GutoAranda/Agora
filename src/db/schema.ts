import Dexie, { type EntityTable } from 'dexie'

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
  id?: number
  title: string
  area: Area
  kind: BlockKind
  start: string // ISO
  end: string // ISO
  status: BlockStatus
  firstStep?: string
  location?: string
  notes?: string
  taskId?: number
  recurringId?: number
  courseId?: number
  deadlineId?: number
  routineId?: number
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
  id?: number
  title: string
  area?: Area
  status: TaskStatus
  trigger?: Trigger
  firstStep?: string
  estimateMin?: number
  dueAt?: string // ISO
  courseId?: number
  deadlineId?: number
  subtasks: Subtask[]
  notes?: string
  createdAt: string
  doneAt?: string
  /** Quantas vezes já foi reposicionada sem ser feita (sinal para quebrar ou soltar). */
  rescheduleCount: number
}

/** Regra recorrente semanal (aula, estágio, treino). Gera blocos 'fixo'. */
export interface Recurring {
  id?: number
  title: string
  area: Area
  kind: BlockKind
  weekdays: number[] // 0 = domingo ... 6 = sábado
  startTime: string // 'HH:mm'
  endTime: string // 'HH:mm'
  location?: string
  /** Minutos de deslocamento antes e depois (gera blocos 'deslocamento'). */
  travelMin?: number
  courseId?: number
  active: boolean
  /** Intervalo de vigência opcional ('yyyy-MM-dd'). */
  from?: string
  until?: string
}

export interface Course {
  id?: number
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
  id?: number
  courseId: number
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
  id?: number
  title: string
  area: Area
  type: DeadlineType
  courseId?: number
  dueAt: string // ISO
  estimateMin: number
  milestones: Milestone[]
  done: boolean
  notes?: string
  createdAt: string
}

export interface Reading {
  id?: number
  courseId: number
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
  id?: number
  name: string
  period: 'manha' | 'noite' | 'outro'
  anchorTime: string // 'HH:mm' em que a rotina começa
  weekdays: number[]
  steps: RoutineStep[]
  active: boolean
}

export interface Habit {
  id?: number
  name: string
  targetPerWeek: number
  active: boolean
}

export interface HabitLog {
  id?: number
  habitId: number
  date: string // 'yyyy-MM-dd'
}

export type ReminderRepeat = 'uma' | 'mensal' | 'anual'

/** Aniversários, contas, consultas: lembrete N dias antes e no dia. */
export interface Reminder {
  id?: number
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
  id?: number
  date: string // 'yyyy-MM-dd'
  type: 'noite' | 'domingo'
  answers: Record<string, string>
  createdAt: string
}

/** Fechamento do expediente: o que ficou pendente e o primeiro passo de amanhã. */
export interface WorkClose {
  id?: number
  date: string // 'yyyy-MM-dd'
  pending: string
  firstStepTomorrow: string
}

/** Item na lista de espera do trabalho (ideias, "quando der tempo"). */
export interface ParkedIdea {
  id?: number
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
  id: number // sempre 1
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
  id: 1,
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

class AgoraDB extends Dexie {
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
      blocks: '++id, day, start, status, kind, area, taskId, recurringId, courseId, deadlineId, routineId',
      tasks: '++id, status, area, dueAt, courseId, deadlineId, createdAt',
      recurring: '++id, area, courseId, active',
      courses: '++id, name',
      absences: '++id, courseId, date',
      deadlines: '++id, area, courseId, dueAt, done',
      readings: '++id, courseId, done',
      routines: '++id, period, active',
      habits: '++id, active',
      habitLogs: '++id, habitId, date, [habitId+date]',
      reminders: '++id, area, date',
      reviews: '++id, date, type',
      workCloses: '++id, date',
      parked: '++id, area, createdAt',
    })
  }
}

export const db = new AgoraDB()

/** Garante que a linha de configurações existe e a devolve. */
export async function ensureSettings(): Promise<Settings> {
  const s = await db.settings.get(1)
  if (s) return s
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const s = await ensureSettings()
  await db.settings.put({ ...s, ...patch, id: 1 })
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
