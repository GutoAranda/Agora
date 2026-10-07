import { db, type Absence, type Course, type Deadline, type Recurring, type Task } from '../db/schema'
import { dayKey, todayKey } from './time'
import { suggestMilestones } from './schedule'

/* ==========================================================================
   Importadores tolerantes: Faltaê (JSON) e Notion (CSV).
   Aceitam variações de chave em português e inglês.
   ========================================================================== */

type J = Record<string, unknown>

function isObj(x: unknown): x is J {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function normKey(k: string): string {
  return k
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\s-]/g, '')
}

/** Primeiro valor não vazio entre várias chaves (ignora caixa, acentos, _ e espaços). */
function pick(o: J, ...keys: string[]): unknown {
  const map = new Map<string, string>()
  for (const k of Object.keys(o)) map.set(normKey(k), k)
  for (const k of keys) {
    const real = map.get(normKey(k))
    if (real === undefined) continue
    const v = o[real]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

function str(x: unknown): string | undefined {
  if (typeof x === 'string') return x.trim() || undefined
  if (typeof x === 'number') return String(x)
  return undefined
}

function num(x: unknown): number | undefined {
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'string') {
    const n = parseInt(x, 10)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/** 0-6, 7 → 0, ou nomes: 'seg', 'segunda-feira', 'mon', 'Monday'... */
export function parseWeekday(x: unknown): number | undefined {
  if (typeof x === 'number') {
    if (x >= 0 && x <= 6) return x
    if (x === 7) return 0
    return undefined
  }
  if (typeof x !== 'string') return undefined
  const s = x.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/^\d+$/.test(s)) return parseWeekday(parseInt(s, 10))
  const map: Record<string, number> = {
    dom: 0, sun: 0,
    seg: 1, mon: 1,
    ter: 2, tue: 2,
    qua: 3, wed: 3,
    qui: 4, thu: 4,
    sex: 5, fri: 5,
    sab: 6, sat: 6,
  }
  return map[s.slice(0, 3)]
}

/** '8:00', '08:00', '0800', '8h', '8h30', '08:00:00' → 'HH:mm'. */
export function parseTime(x: unknown): string | undefined {
  const s = str(x)
  if (!s) return undefined
  const m = /^(\d{1,2})[:h.]?(\d{2})?/i.exec(s)
  if (!m) return undefined
  const h = +m[1]
  const mi = m[2] ? +m[2] : 0
  if (h > 23 || mi > 59) return undefined
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/** 'yyyy-MM-dd', ISO, 'dd/MM/yyyy' ou texto em inglês ("October 7, 2026") → Date. */
export function parseLooseDate(x: unknown): Date | undefined {
  const s = str(x)
  if (!s) return undefined
  const first = s.split('→')[0].trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(first)
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0)
    return isNaN(d.getTime()) ? undefined : d
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(first)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    const d = new Date(y, +m[2] - 1, +m[1], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0)
    return isNaN(d.getTime()) ? undefined : d
  }
  const d = new Date(first)
  return isNaN(d.getTime()) ? undefined : d
}

/* ---------- Faltaê ---------- */

export interface FaltaeResult {
  courses: number
  recurring: number
  absences: number
  skipped: number
  deadlines?: number
}

/* ---------- Backup real do Faltaê (controle-faltas) ----------
   Formato: { materias:[{id, nome, totalAulas, limitePct, diaSemana:'seg'..'sáb'|null,
              horario:'18:50'|null, creditos, professor, sala}],
              aulas:[...], faltas:[{id, materiaId, data, qtd, recuperada, abonada}],
              eventos:[{id, tipo:'prova'|'atividade', materiaId, data, titulo, descricao, feita}] }
   A matéria guarda só a hora de início; o fim é estimado pelo padrão da PUC
   (2h30 no primeiro horário da noite, 1h40 no segundo) e pode ser ajustado em Áreas. */

function isFaltaeBackup(x: unknown): x is { materias: J[]; faltas?: unknown; eventos?: unknown } {
  return isObj(x) && Array.isArray((x as J).materias) && ((x as J).materias as unknown[]).every(isObj)
}

function faltaeEndTime(start: string, raw: string | undefined): string {
  // "18:50-21:20", "18:50 às 21:20", "18:50 - 21:20"
  const m = raw?.match(/(\d{1,2}[:h]\d{2})\s*(?:-|–|às|as|a)\s*(\d{1,2}[:h]\d{2})/i)
  if (m) {
    const e = parseTime(m[2])
    if (e) return e
  }
  const [h, mi] = start.split(':').map(Number)
  const startMin = h * 60 + mi
  const dur = startMin >= 21 * 60 ? 100 : 150
  const endMin = (startMin + dur) % (24 * 60)
  return `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
}

async function importFaltaeBackup(data: { materias: J[]; faltas?: unknown; eventos?: unknown }): Promise<FaltaeResult> {
  const existing = await db.courses.toArray()
  const names = new Set(existing.map((c) => normName(c.name)))
  const res: FaltaeResult = { courses: 0, recurring: 0, absences: 0, skipped: 0, deadlines: 0 }
  const idMap = new Map<string, { courseId: string; startTime?: string }>()

  for (const m of data.materias) {
    const name = str(m.nome)
    if (!name) continue
    const faltaeId = str(m.id) ?? name
    if (names.has(normName(name))) {
      // Já existe: ainda mapeia o id para importar faltas/eventos sem duplicar a disciplina.
      const found = existing.find((c) => normName(c.name) === normName(name))
      if (found?.id) idMap.set(faltaeId, { courseId: found.id })
      res.skipped++
      continue
    }
    names.add(normName(name))
    const totalAulas = num(m.totalAulas)
    const limitePct = num(m.limitePct) ?? 25
    const absenceLimit = totalAulas ? Math.max(1, Math.floor((totalAulas * limitePct) / 100)) : 7
    const creditos = num(m.creditos)
    const course: Course = {
      name,
      professor: str(m.professor),
      room: str(m.sala),
      absenceLimit,
      notes: [totalAulas ? `${totalAulas} aulas no semestre` : null, `limite ${limitePct}%`, creditos ? `${creditos} créditos` : null, 'Importado do Faltaê']
        .filter(Boolean)
        .join(' · '),
    }
    const courseId = (await db.courses.add(course)) as string
    res.courses++

    const wd = parseWeekday(m.diaSemana)
    const rawHorario = str(m.horario)
    const start = parseTime(rawHorario?.split(/[-–]|às/)[0])
    if (wd !== undefined && start) {
      const rule: Recurring = {
        title: name,
        area: 'faculdade',
        kind: 'fixo',
        weekdays: [wd],
        startTime: start,
        endTime: faltaeEndTime(start, rawHorario),
        location: str(m.sala),
        travelMin: 0,
        courseId,
        active: true,
      }
      await db.recurring.add(rule)
      res.recurring++
    }
    idMap.set(faltaeId, { courseId, startTime: start })
  }

  // Faltas: uma linha por aula perdida (qtd), ignorando abonadas (não contam no limite).
  const rows: Absence[] = []
  for (const f of toArray(data.faltas)) {
    if (!isObj(f)) continue
    const ref = idMap.get(str(f.materiaId) ?? '')
    const d = parseLooseDate(f.data)
    if (!ref || !d || f.abonada === true) continue
    const qtd = Math.max(1, Math.min(10, num(f.qtd) ?? 1))
    for (let i = 0; i < qtd; i++) rows.push({ courseId: ref.courseId, date: dayKey(d), note: qtd > 1 ? `${qtd} aulas no dia (Faltaê)` : undefined })
  }
  if (rows.length) {
    await db.absences.bulkAdd(rows)
    res.absences = rows.length
  }

  // Eventos: provas e atividades viram prazos (com marcos sugeridos quando ainda estão no futuro).
  const openTitles = new Set((await db.deadlines.toArray()).map((d) => `${normName(d.title)}|${d.dueAt.slice(0, 10)}`))
  for (const e of toArray(data.eventos)) {
    if (!isObj(e)) continue
    const titulo = str(e.titulo)
    const d = parseLooseDate(e.data)
    if (!titulo || !d) continue
    const ref = idMap.get(str(e.materiaId) ?? '')
    const due = new Date(d)
    const [h, mi] = (ref?.startTime ?? '23:59').split(':').map(Number)
    due.setHours(h, mi, 0, 0)
    const key = `${normName(titulo)}|${dayKey(due)}`
    if (openTitles.has(key)) continue
    openTitles.add(key)
    const tipo = str(e.tipo)
    const type: Deadline['type'] = tipo === 'prova' ? 'prova' : tipo === 'trabalho' ? 'trabalho' : 'entrega'
    const estimateMin = type === 'prova' ? 240 : type === 'trabalho' ? 180 : 60
    const done = e.feita === true || due.getTime() < Date.now()
    const base = { title: titulo, type, dueAt: due.toISOString(), estimateMin }
    const deadline: Deadline = {
      ...base,
      area: 'faculdade',
      courseId: ref?.courseId,
      milestones: done ? [] : suggestMilestones(base),
      done,
      notes: str(e.descricao),
      createdAt: new Date().toISOString(),
    }
    await db.deadlines.add(deadline)
    res.deadlines = (res.deadlines ?? 0) + 1
  }
  return res
}

function extractCourses(parsed: unknown, depth = 0): J[] {
  if (Array.isArray(parsed)) return parsed.filter(isObj)
  if (!isObj(parsed) || depth > 2) return []
  const inner = pick(parsed, 'disciplinas', 'courses', 'materias', 'subjects', 'cadeiras', 'data', 'items', 'lista')
  if (inner !== undefined) return extractCourses(inner, depth + 1)
  if (pick(parsed, 'nome', 'name', 'disciplina', 'titulo', 'title') !== undefined) return [parsed]
  return []
}

function toArray(x: unknown): unknown[] {
  if (Array.isArray(x)) return x
  if (x === undefined || x === null) return []
  return [x]
}

/**
 * Importa disciplinas de um JSON do Faltaê (ou parecido).
 * Aceita {disciplinas:[...]} ou um array direto, chaves em pt ou en.
 * Disciplinas com nome já cadastrado são puladas.
 */
export async function importFaltae(text: string): Promise<FaltaeResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Esse arquivo não é um JSON válido.')
  }
  if (isFaltaeBackup(parsed)) return importFaltaeBackup(parsed)
  const list = extractCourses(parsed)
  if (!list.length) throw new Error('Não encontrei disciplinas nesse arquivo.')

  const existing = await db.courses.toArray()
  const names = new Set(existing.map((c) => normName(c.name)))
  const res: FaltaeResult = { courses: 0, recurring: 0, absences: 0, skipped: 0 }
  const today = todayKey()

  for (const raw of list) {
    const name = str(pick(raw, 'nome', 'name', 'disciplina', 'materia', 'titulo', 'title'))
    if (!name || names.has(normName(name))) {
      res.skipped++
      continue
    }
    names.add(normName(name))
    const courseRoom = str(pick(raw, 'sala', 'room', 'local', 'location'))
    const semesterEnd = parseLooseDate(pick(raw, 'fimSemestre', 'semesterEnd', 'termino', 'fim', 'endDate'))
    const course: Course = {
      name,
      code: str(pick(raw, 'codigo', 'code', 'sigla')),
      professor: str(pick(raw, 'professor', 'teacher', 'docente', 'prof')),
      room: courseRoom,
      absenceLimit:
        num(pick(raw, 'limiteFaltas', 'faltasMax', 'maxFaltas', 'limite', 'absenceLimit', 'maxAbsences', 'absencesLimit', 'faltasPermitidas')) ?? 7,
      semesterEnd: semesterEnd ? dayKey(semesterEnd) : undefined,
    }
    const courseId = (await db.courses.add(course)) as string
    res.courses++

    // Horários → agrupa por início/fim/sala para virar uma regra por combinação.
    const groups = new Map<string, Recurring>()
    for (const h of toArray(pick(raw, 'horarios', 'horario', 'schedule', 'schedules', 'aulas', 'times', 'classes', 'slots'))) {
      if (!isObj(h)) continue
      const wd = parseWeekday(pick(h, 'dia', 'diaSemana', 'dia_semana', 'day', 'weekday', 'dayOfWeek'))
      const start = parseTime(pick(h, 'inicio', 'start', 'horaInicio', 'hora_inicio', 'startTime', 'from', 'de'))
      const end = parseTime(pick(h, 'fim', 'end', 'horaFim', 'hora_fim', 'endTime', 'to', 'ate', 'termino'))
      if (wd === undefined || !start || !end) continue
      const room = str(pick(h, 'sala', 'room', 'local', 'location')) ?? courseRoom
      const key = `${start}|${end}|${room ?? ''}`
      const g = groups.get(key)
      if (g) {
        if (!g.weekdays.includes(wd)) g.weekdays.push(wd)
      } else {
        groups.set(key, {
          title: name,
          area: 'faculdade',
          kind: 'fixo',
          weekdays: [wd],
          startTime: start,
          endTime: end,
          location: room,
          travelMin: 0,
          courseId,
          active: true,
          until: course.semesterEnd,
        })
      }
    }
    for (const g of groups.values()) {
      g.weekdays.sort()
      await db.recurring.add(g)
      res.recurring++
    }

    // Faltas: número (sem data → hoje, com nota) ou lista de {data}.
    const faltas = pick(raw, 'faltas', 'absences', 'faltasRegistradas', 'ausencias')
    const rows: Absence[] = []
    if (typeof faltas === 'number' || (typeof faltas === 'string' && /^\d+$/.test(faltas))) {
      const n = Math.max(0, Math.min(60, num(faltas) ?? 0))
      for (let i = 0; i < n; i++) rows.push({ courseId, date: today, note: 'Importado do Faltaê (data não informada)' })
    } else {
      for (const f of toArray(faltas)) {
        const d = isObj(f) ? parseLooseDate(pick(f, 'data', 'date', 'dia', 'day', 'quando')) : parseLooseDate(f)
        if (!d) continue
        const note = isObj(f) ? str(pick(f, 'nota', 'note', 'obs', 'motivo', 'reason')) : undefined
        rows.push({ courseId, date: dayKey(d), note })
      }
    }
    if (rows.length) {
      await db.absences.bulkAdd(rows)
      res.absences += rows.length
    }
  }
  return res
}

/* ---------- Notion (CSV) ---------- */

/** Parser CSV simples com aspas, aspas duplicadas e quebras de linha dentro de campos. */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

function findCol(headers: string[], patterns: RegExp[]): number {
  const hs = headers.map((h) => normName(h))
  for (const p of patterns) {
    const i = hs.findIndex((h) => p.test(h))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Importa um CSV exportado do Notion para a entrada (área trabalho).
 * Pula linhas cujo status indica concluído. Devolve quantas tarefas criou.
 */
export async function importNotionTasks(text: string): Promise<number> {
  const rows = parseCSV(text)
  if (rows.length < 2) throw new Error('O CSV precisa de um cabeçalho e pelo menos uma linha.')
  const headers = rows[0]
  let nameCol = findCol(headers, [/^(name|nome|titulo|title|tarefa|task)$/, /nome|name|titulo|title|tarefa|task/])
  if (nameCol < 0) nameCol = 0
  const statusCol = findCol(headers, [/^(status|estado|situacao)$/, /status|estado|situacao/])
  const dueCol = findCol(headers, [/^(due|duedate|prazo|data|date|deadline|vencimento|entrega)$/, /due|prazo|deadline|venc|entrega|data|date/])

  const existing = await db.tasks.toArray()
  const open = new Set(existing.filter((t) => t.status !== 'feita').map((t) => normName(t.title)))
  const now = new Date().toISOString()
  const toAdd: Task[] = []
  for (const r of rows.slice(1)) {
    const title = (r[nameCol] ?? '').trim()
    if (!title) continue
    const status = statusCol >= 0 ? (r[statusCol] ?? '') : ''
    if (/done|conclu|feit|finaliz|complet|cancel|arquiv/i.test(status)) continue
    if (open.has(normName(title))) continue
    open.add(normName(title))
    const due = dueCol >= 0 ? parseLooseDate(r[dueCol]) : undefined
    toAdd.push({
      title,
      area: 'trabalho',
      status: 'entrada',
      dueAt: due ? due.toISOString() : undefined,
      subtasks: [],
      notes: status ? `Status no Notion: ${status.trim()}` : undefined,
      createdAt: now,
      rescheduleCount: 0,
    })
  }
  if (toAdd.length) await db.tasks.bulkAdd(toAdd)
  return toAdd.length
}

/** Lê um arquivo como texto (funciona no Safari do iPhone). */
export function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result ?? ''))
    fr.onerror = () => reject(fr.error ?? new Error('Não consegui ler o arquivo.'))
    fr.readAsText(file)
  })
}
