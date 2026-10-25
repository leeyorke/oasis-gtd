/**
 * Write operations for the Oasis GTD MCP server.
 *
 * The server used to be strictly read-only. This module adds the write half:
 * creating, updating and deleting the GTD records an agent legitimately needs
 * to touch — 随想 (notes), tasks, projects, waiting-for items, someday/maybe
 * ideas — plus the habit 打卡 (check-in) action.
 *
 * Safety rules enforced here:
 *   - every statement is parameterised; no user-supplied value is ever
 *     concatenated into SQL
 *   - UPDATEs only touch whitelisted columns (the same lists the desktop app
 *     uses in src/main/db/database.ts)
 *   - status / priority / horizon values are validated against the app's own
 *     CHECK constraints before the statement runs
 *   - multi-step changes run inside one transaction (see `transact`), so a
 *     failed step never leaves half a change behind
 *   - ai_providers (API keys) and app_settings (configuration) are NOT writable
 *     from here — they stay out of reach of every agent
 */
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from './sqlite.ts'
import { queryAll, queryOne, runStatement, transact } from './db.ts'
import type { HabitRecordRow, HabitRow, NoteRow, ProjectRow, SomedayRow, TaskRow, WaitingRow } from './data.ts'
import { SOMEDAY_HORIZONS, TASK_PRIORITIES, localDateString } from './data.ts'

// ─── Errors ──────────────────────────────────────────────────────────────────

/** A validation or lookup problem that is safe to show to the agent. */
export class WriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WriteError'
  }
}

// ─── Vocabularies (mirroring the app's CHECK constraints) ────────────────────

/** Statuses a task may be created with ('archive' is only reachable by update). */
export const WRITABLE_TASK_STATUSES = ['inbox', 'next', 'waiting', 'someday', 'done'] as const
export type WritableTaskStatus = (typeof WRITABLE_TASK_STATUSES)[number]

/** Statuses a task may be updated to — the app archives tasks this way. */
export const WRITABLE_TASK_STATUSES_ALL = [
  'inbox',
  'next',
  'waiting',
  'someday',
  'done',
  'archive'
] as const
export type WritableTaskStatusAll = (typeof WRITABLE_TASK_STATUSES_ALL)[number]

export const PROJECT_WRITABLE_STATUSES = ['active', 'on-hold'] as const
export type WritableProjectStatus = (typeof PROJECT_WRITABLE_STATUSES)[number]

/** Buckets `capture_item` can route a thought to. */
export const CAPTURE_TARGETS = [
  'note',
  'inbox',
  'next',
  'waiting',
  'someday',
  'project',
  'waiting_item',
  'someday_item'
] as const
export type CaptureTarget = (typeof CAPTURE_TARGETS)[number]

// ─── Small helpers ───────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return randomUUID()
}

function requireText(value: string | undefined | null, field: string): string {
  const text = (value ?? '').trim()
  if (text === '') throw new WriteError(`"${field}" must not be empty`)
  return text
}

function optionalText(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/** Normalises a date input to the app's `YYYY-MM-DD` storage format. */
export function normalizeDate(value: string | undefined | null, field: string): string | null {
  const text = optionalText(value)
  if (text === null) return null
  const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(text)
  if (isoDate) {
    const parsed = new Date(`${isoDate[1]}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) {
      throw new WriteError(`"${field}" is not a valid date: ${text}`)
    }
    return isoDate[1]
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw new WriteError(
      `"${field}" must be an ISO date (YYYY-MM-DD) or timestamp, got: ${text}`
    )
  }
  return parsed.toISOString().slice(0, 10)
}

function normalizeTags(tags: string[] | undefined | null): string[] | null {
  if (!tags) return null
  const cleaned = tags.map((tag) => String(tag).trim()).filter((tag) => tag !== '')
  return cleaned.length > 0 ? cleaned : null
}

/** The @context list configured in the app (empty when the app never set it). */
export function configuredContexts(db: DatabaseSync): string[] {
  const row = queryOne<{ value: string | null }>(
    db,
    "SELECT value FROM app_settings WHERE key = 'contexts'"
  )
  if (!row?.value) return []
  try {
    const parsed: unknown = JSON.parse(row.value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

/**
 * Resolves a project reference: an exact id, or a title (exact match first,
 * then a unique partial match). Returns null when no reference was given.
 */
export function resolveProjectId(
  db: DatabaseSync,
  projectId?: string | null,
  projectTitle?: string | null
): string | null {
  const id = optionalText(projectId)
  if (id !== null) {
    const row = queryOne<{ id: string }>(db, 'SELECT id FROM projects WHERE id = ?', [id])
    if (!row) throw new WriteError(`No project with id ${id}. Use list_projects to find valid ids.`)
    return row.id
  }
  const title = optionalText(projectTitle)
  if (title === null) return null

  const exact = queryOne<{ id: string }>(
    db,
    'SELECT id FROM projects WHERE lower(title) = lower(?)',
    [title]
  )
  if (exact) return exact.id

  const partial = queryAll<{ id: string; title: string }>(
    db,
    'SELECT id, title FROM projects WHERE lower(title) LIKE lower(?) ORDER BY length(title) ASC',
    [`%${title}%`]
  )
  if (partial.length === 1) return partial[0].id
  if (partial.length > 1) {
    throw new WriteError(
      `Project title "${title}" is ambiguous: ${partial.map((row) => `"${row.title}"`).join(', ')}. ` +
        'Pass project_id instead.'
    )
  }
  throw new WriteError(
    `No project matching "${title}". Use list_projects to see the available titles, ` +
      'or pass project_id.'
  )
}

/** Warns when a @context is not part of the app's configured list. */
function contextWarning(db: DatabaseSync, context: string | null): string[] {
  if (context === null) return []
  const known = configuredContexts(db)
  if (known.length === 0) return []
  const normalized = context.startsWith('@') ? context : `@${context}`
  if (known.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) return []
  return [
    `"${context}" is not one of the app's configured @contexts (${known.join(', ')}). ` +
      'It was stored as given.'
  ]
}

// ─── Notes (随想) ────────────────────────────────────────────────────────────

export interface CreateNoteInput {
  content: string
  tags?: string[] | null
  weather?: string | null
}

export interface UpdateNoteInput {
  content?: string | null
  tags?: string[] | null
  weather?: string | null
}

/** Reads one note row (tags parsed into an array, exactly like list_notes). */
export function getNote(db: DatabaseSync, id: string): NoteRow | undefined {
  const row = queryOne<Omit<NoteRow, 'tags'> & { tags: string | null }>(
    db,
    'SELECT * FROM notes WHERE id = ?',
    [id]
  )
  if (!row) return undefined
  return { ...row, tags: parseTags(row.tags) }
}

function parseTags(value: string | null): string[] | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null
  } catch {
    return null
  }
}

export function createNote(db: DatabaseSync, input: CreateNoteInput): NoteRow {
  const content = requireText(input.content, 'content')
  const id = newId()
  const stamp = nowIso()
  const tags = normalizeTags(input.tags)
  transact(db, () => {
    runStatement(
      db,
      'INSERT INTO notes (id, content, tags, weather, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, content, tags ? JSON.stringify(tags) : null, optionalText(input.weather), stamp, stamp]
    )
  })
  const row = getNote(db, id)
  if (!row) throw new WriteError('Note was created but could not be read back')
  return row
}

export function updateNote(db: DatabaseSync, id: string, input: UpdateNoteInput): NoteRow {
  const existing = getNote(db, id)
  if (!existing) throw new WriteError(`No note with id ${id}`)

  const fields: string[] = []
  const params: unknown[] = []
  if (input.content !== undefined) {
    fields.push('content = ?')
    params.push(requireText(input.content, 'content'))
  }
  if (input.tags !== undefined) {
    const tags = normalizeTags(input.tags)
    fields.push('tags = ?')
    params.push(tags ? JSON.stringify(tags) : null)
  }
  if (input.weather !== undefined) {
    fields.push('weather = ?')
    params.push(optionalText(input.weather))
  }
  if (fields.length === 0) {
    throw new WriteError('Nothing to update — pass content, tags and/or weather')
  }
  const stamp = nowIso()
  transact(db, () => {
    runStatement(db, `UPDATE notes SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`, [
      ...params,
      stamp,
      id
    ])
  })
  const row = getNote(db, id)
  if (!row) throw new WriteError(`No note with id ${id}`)
  return row
}

export function deleteNote(db: DatabaseSync, id: string): NoteRow {
  const existing = getNote(db, id)
  if (!existing) throw new WriteError(`No note with id ${id}`)
  transact(db, () => {
    runStatement(db, 'DELETE FROM notes WHERE id = ?', [id])
  })
  return existing
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string
  notes?: string | null
  context?: string | null
  due_date?: string | null
  project_id?: string | null
  project?: string | null
  status?: WritableTaskStatus
  waiting_for?: string | null
  priority?: string | null
}

export interface UpdateTaskInput {
  title?: string | null
  notes?: string | null
  context?: string | null
  due_date?: string | null
  project_id?: string | null
  project?: string | null
  status?: WritableTaskStatusAll
  waiting_for?: string | null
  priority?: string | null
}

function validatePriority(priority: string | undefined | null): string | null {
  const text = optionalText(priority)
  if (text === null) return null
  const normalized = text.toLowerCase()
  if (!(TASK_PRIORITIES as readonly string[]).includes(normalized)) {
    throw new WriteError(
      `"${text}" is not a valid priority — expected one of: ${TASK_PRIORITIES.join(', ')}`
    )
  }
  return normalized
}

export function createTask(db: DatabaseSync, input: CreateTaskInput): TaskRow {
  const title = requireText(input.title, 'title')
  const status = input.status ?? 'inbox'
  if (!(WRITABLE_TASK_STATUSES as readonly string[]).includes(status)) {
    throw new WriteError(
      `"${status}" is not a status a task can be created with — expected one of: ` +
        WRITABLE_TASK_STATUSES.join(', ')
    )
  }
  const priority = validatePriority(input.priority)
  const projectId = resolveProjectId(db, input.project_id, input.project)
  const dueDate = normalizeDate(input.due_date, 'due_date')
  const context = optionalText(input.context)
  const waitingFor = optionalText(input.waiting_for)
  if (status === 'waiting' && waitingFor === null) {
    throw new WriteError('A task with status "waiting" needs waiting_for (who is it waiting on?)')
  }

  const id = newId()
  const stamp = nowIso()
  transact(db, () => {
    runStatement(
      db,
      `INSERT INTO tasks
         (id, title, notes, context, due_date, project_id, status, waiting_for, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        optionalText(input.notes),
        context,
        dueDate,
        projectId,
        status,
        waitingFor,
        priority,
        stamp,
        stamp
      ]
    )
  })
  const row = getTaskRow(db, id)
  if (!row) throw new WriteError('Task was created but could not be read back')
  return row
}

export function updateTask(db: DatabaseSync, id: string, input: UpdateTaskInput): TaskRow {
  const existing = getTaskRow(db, id)
  if (!existing) throw new WriteError(`No task with id ${id}`)

  const fields: string[] = []
  const params: unknown[] = []

  if (input.title !== undefined) {
    fields.push('title = ?')
    params.push(requireText(input.title, 'title'))
  }
  if (input.notes !== undefined) {
    fields.push('notes = ?')
    params.push(optionalText(input.notes))
  }
  if (input.context !== undefined) {
    fields.push('context = ?')
    params.push(optionalText(input.context))
  }
  if (input.due_date !== undefined) {
    fields.push('due_date = ?')
    params.push(normalizeDate(input.due_date, 'due_date'))
  }
  if (input.project_id !== undefined || input.project !== undefined) {
    fields.push('project_id = ?')
    params.push(resolveProjectId(db, input.project_id, input.project))
  }
  if (input.status !== undefined) {
    const status = String(input.status)
    if (!(WRITABLE_TASK_STATUSES_ALL as readonly string[]).includes(status)) {
      throw new WriteError(
        `"${status}" is not a valid task status — expected one of: ` +
          WRITABLE_TASK_STATUSES_ALL.join(', ')
      )
    }
    fields.push('status = ?')
    params.push(status)
  }
  if (input.waiting_for !== undefined) {
    fields.push('waiting_for = ?')
    params.push(optionalText(input.waiting_for))
  }
  if (input.priority !== undefined) {
    const priority = validatePriority(input.priority)
    fields.push('priority = ?')
    params.push(priority)
  }
  if (fields.length === 0) {
    throw new WriteError(
      'Nothing to update — pass at least one of title, notes, context, due_date, ' +
        'project, status, waiting_for, priority'
    )
  }

  const stamp = nowIso()
  transact(db, () => {
    runStatement(db, `UPDATE tasks SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`, [
      ...params,
      stamp,
      id
    ])
  })
  const row = getTaskRow(db, id)
  if (!row) throw new WriteError(`No task with id ${id}`)
  return row
}

export function deleteTask(db: DatabaseSync, id: string): TaskRow {
  const existing = getTaskRow(db, id)
  if (!existing) throw new WriteError(`No task with id ${id}`)
  transact(db, () => {
    runStatement(db, 'DELETE FROM tasks WHERE id = ?', [id])
  })
  return existing
}

/** One task with the title of its project — same shape list_tasks returns. */
export function getTaskRow(db: DatabaseSync, id: string): TaskRow | undefined {
  return queryOne<TaskRow>(
    db,
    `SELECT t.id, t.title, t.notes, t.context, t.due_date, t.project_id, t.status,
            t.waiting_for, t.priority, t.created_at, t.updated_at, p.title AS project_title
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.id = ?`,
    [id]
  )
}

// ─── Projects ────────────────────────────────────────────────────────────────

export interface CreateProjectInput {
  title: string
  description?: string | null
  outcome?: string | null
  status?: WritableProjectStatus
}

export interface UpdateProjectInput {
  title?: string | null
  description?: string | null
  outcome?: string | null
  status?: WritableProjectStatus
}

const PROJECT_COLUMNS = `
  p.id, p.title, p.description, p.outcome, p.status, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'done') AS open_task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
`

export function getProjectRow(db: DatabaseSync, id: string): ProjectRow | undefined {
  return queryOne<ProjectRow>(db, `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`, [id])
}

export function createProject(db: DatabaseSync, input: CreateProjectInput): ProjectRow {
  const title = requireText(input.title, 'title')
  const status = input.status ?? 'active'
  if (!(PROJECT_WRITABLE_STATUSES as readonly string[]).includes(status)) {
    throw new WriteError(
      `"${status}" is not a valid project status — expected one of: ` +
        PROJECT_WRITABLE_STATUSES.join(', ')
    )
  }
  const id = newId()
  const stamp = nowIso()
  transact(db, () => {
    runStatement(
      db,
      `INSERT INTO projects (id, title, description, outcome, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, optionalText(input.description), optionalText(input.outcome), status, stamp, stamp]
    )
  })
  const row = getProjectRow(db, id)
  if (!row) throw new WriteError('Project was created but could not be read back')
  return row
}

export function updateProject(
  db: DatabaseSync,
  id: string,
  input: UpdateProjectInput
): ProjectRow {
  const existing = getProjectRow(db, id)
  if (!existing) throw new WriteError(`No project with id ${id}`)

  const fields: string[] = []
  const params: unknown[] = []
  if (input.title !== undefined) {
    fields.push('title = ?')
    params.push(requireText(input.title, 'title'))
  }
  if (input.description !== undefined) {
    fields.push('description = ?')
    params.push(optionalText(input.description))
  }
  if (input.outcome !== undefined) {
    fields.push('outcome = ?')
    params.push(optionalText(input.outcome))
  }
  if (input.status !== undefined) {
    if (!(PROJECT_WRITABLE_STATUSES as readonly string[]).includes(input.status)) {
      throw new WriteError(
        `"${input.status}" is not a valid project status — expected one of: ` +
          PROJECT_WRITABLE_STATUSES.join(', ')
      )
    }
    fields.push('status = ?')
    params.push(input.status)
  }
  if (fields.length === 0) {
    throw new WriteError('Nothing to update — pass title, description, outcome and/or status')
  }
  const stamp = nowIso()
  transact(db, () => {
    runStatement(
      db,
      `UPDATE projects SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`,
      [...params, stamp, id]
    )
  })
  const row = getProjectRow(db, id)
  if (!row) throw new WriteError(`No project with id ${id}`)
  return row
}

/**
 * Deletes a project. The app's schema detaches its tasks and waiting items
 * (ON DELETE SET NULL); older databases have no such foreign key, so the
 * detach is done explicitly here to avoid orphaned rows.
 */
export function deleteProject(db: DatabaseSync, id: string): ProjectRow {
  const existing = getProjectRow(db, id)
  if (!existing) throw new WriteError(`No project with id ${id}`)
  transact(db, () => {
    runStatement(db, 'UPDATE tasks SET project_id = NULL WHERE project_id = ?', [id])
    runStatement(db, 'UPDATE waiting_items SET project_id = NULL WHERE project_id = ?', [id])
    runStatement(db, 'DELETE FROM projects WHERE id = ?', [id])
  })
  return existing
}

// ─── Waiting-for items ───────────────────────────────────────────────────────

export interface CreateWaitingItemInput {
  title: string
  waiting_for: string
  since?: string | null
  project_id?: string | null
  project?: string | null
  notes?: string | null
}

export function getWaitingRow(db: DatabaseSync, id: string): WaitingRow | undefined {
  return queryOne<WaitingRow>(
    db,
    `SELECT w.id, w.title, w.waiting_for, w.since, w.project_id, w.notes, w.created_at,
            p.title AS project_title
     FROM waiting_items w LEFT JOIN projects p ON p.id = w.project_id
     WHERE w.id = ?`,
    [id]
  )
}

export function createWaitingItem(
  db: DatabaseSync,
  input: CreateWaitingItemInput
): WaitingRow {
  const title = requireText(input.title, 'title')
  const waitingFor = requireText(input.waiting_for, 'waiting_for')
  const since = normalizeDate(input.since, 'since') ?? nowIso().slice(0, 10)
  const projectId = resolveProjectId(db, input.project_id, input.project)
  const id = newId()
  const stamp = nowIso()
  transact(db, () => {
    runStatement(
      db,
      `INSERT INTO waiting_items (id, title, waiting_for, since, project_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, waitingFor, since, projectId, optionalText(input.notes), stamp]
    )
  })
  const row = getWaitingRow(db, id)
  if (!row) throw new WriteError('Waiting item was created but could not be read back')
  return row
}

export function deleteWaitingItem(db: DatabaseSync, id: string): WaitingRow {
  const existing = getWaitingRow(db, id)
  if (!existing) throw new WriteError(`No waiting item with id ${id}`)
  transact(db, () => {
    runStatement(db, 'DELETE FROM waiting_items WHERE id = ?', [id])
  })
  return existing
}

// ─── Someday / maybe items ───────────────────────────────────────────────────

export interface CreateSomedayItemInput {
  title: string
  notes?: string | null
  horizon?: string | null
  category?: string | null
}

export interface UpdateSomedayItemInput {
  title?: string | null
  notes?: string | null
  horizon?: string | null
  category?: string | null
}

export function getSomedayRow(db: DatabaseSync, id: string): SomedayRow | undefined {
  return queryOne<SomedayRow>(db, 'SELECT * FROM someday_items WHERE id = ?', [id])
}

function validateHorizon(horizon: string | undefined | null): string | null {
  const text = optionalText(horizon)
  if (text === null) return null
  const normalized = text.toLowerCase()
  if (!(SOMEDAY_HORIZONS as readonly string[]).includes(normalized)) {
    throw new WriteError(
      `"${text}" is not a valid horizon — expected one of: ${SOMEDAY_HORIZONS.join(', ')}`
    )
  }
  return normalized
}

export function createSomedayItem(
  db: DatabaseSync,
  input: CreateSomedayItemInput
): SomedayRow {
  const title = requireText(input.title, 'title')
  const horizon = validateHorizon(input.horizon) ?? 'someday'
  const id = newId()
  const stamp = nowIso()
  transact(db, () => {
    runStatement(
      db,
      `INSERT INTO someday_items (id, title, notes, horizon, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, optionalText(input.notes), horizon, optionalText(input.category) ?? '', stamp, stamp]
    )
  })
  const row = getSomedayRow(db, id)
  if (!row) throw new WriteError('Someday item was created but could not be read back')
  return row
}

export function updateSomedayItem(
  db: DatabaseSync,
  id: string,
  input: UpdateSomedayItemInput
): SomedayRow {
  const existing = getSomedayRow(db, id)
  if (!existing) throw new WriteError(`No someday item with id ${id}`)

  const fields: string[] = []
  const params: unknown[] = []
  if (input.title !== undefined) {
    fields.push('title = ?')
    params.push(requireText(input.title, 'title'))
  }
  if (input.notes !== undefined) {
    fields.push('notes = ?')
    params.push(optionalText(input.notes))
  }
  if (input.horizon !== undefined) {
    fields.push('horizon = ?')
    params.push(validateHorizon(input.horizon) ?? 'someday')
  }
  if (input.category !== undefined) {
    fields.push('category = ?')
    params.push(optionalText(input.category) ?? '')
  }
  if (fields.length === 0) {
    throw new WriteError('Nothing to update — pass title, notes, horizon and/or category')
  }
  const stamp = nowIso()
  transact(db, () => {
    runStatement(
      db,
      `UPDATE someday_items SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`,
      [...params, stamp, id]
    )
  })
  const row = getSomedayRow(db, id)
  if (!row) throw new WriteError(`No someday item with id ${id}`)
  return row
}

export function deleteSomedayItem(db: DatabaseSync, id: string): SomedayRow {
  const existing = getSomedayRow(db, id)
  if (!existing) throw new WriteError(`No someday item with id ${id}`)
  transact(db, () => {
    runStatement(db, 'DELETE FROM someday_items WHERE id = ?', [id])
  })
  return existing
}

// ─── Habit check-in (打卡) ─────────────────────────────────────────────────────

export interface CheckInHabitInput {
  /** Day to check in for (YYYY-MM-DD or any ISO date/timestamp). Defaults to today, local time. */
  date?: string | null
  /** Optional note stored on the day's record. */
  notes?: string | null
}

/** What a check-in actually did. */
export type CheckInEffect =
  /** A simple habit: the day is now ticked (completed = 1). */
  | 'ticked'
  /** A counted habit: one more count was added to the day. */
  | 'counted'
  /** The day was already complete — nothing changed. */
  | 'already-complete'

export interface CheckInHabitResult {
  /** The habit after the change, in the same shape list_habits returns. */
  habit: HabitRow
  /** The day's record after the change. */
  record: HabitRecordRow
  /** What this call did. */
  effect: CheckInEffect
  /** The day's count after the change. */
  count: number
  /** The habit's daily goal (1 for a simple yes/no habit). */
  target: number
  /** Whether the day now counts as complete (count >= target). */
  completed_today: boolean
  /** One-line summary the agent can relay to the user. */
  message: string
}

/** One habit with its derived counters — same shape list_habits returns. */
export function getHabitRow(db: DatabaseSync, id: string): HabitRow | undefined {
  return queryOne<HabitRow>(
    db,
    `SELECT h.id, h.title, h.description, h.frequency, h.time_of_day, h.color,
             h.target, h.is_quantitative, h.is_archived, h.created_at, h.updated_at,
             (SELECT COALESCE(SUM(r.count), 0) FROM habit_records r
               WHERE r.habit_id = h.id AND r.record_date = ?) AS today_count,
             (SELECT COALESCE(SUM(r.count), 0) FROM habit_records r
               WHERE r.habit_id = h.id) AS total_sessions
      FROM habits h WHERE h.id = ?`,
    [localDateString(), id]
  )
}

function getHabitRecord(
  db: DatabaseSync,
  habitId: string,
  recordDate: string
): HabitRecordRow | undefined {
  return queryOne<HabitRecordRow>(
    db,
    'SELECT * FROM habit_records WHERE habit_id = ? AND record_date = ?',
    [habitId, recordDate]
  )
}

/** Inserts the day's first record (completed = 1, one count). */
function insertHabitRecord(
  db: DatabaseSync,
  habitId: string,
  recordDate: string,
  notes: string | null
): void {
  runStatement(
    db,
    `INSERT INTO habit_records (id, habit_id, record_date, completed, count, notes, created_at)
     VALUES (?, ?, ?, 1, 1, ?, ?)`,
    [newId(), habitId, recordDate, notes, nowIso()]
  )
}

/**
 * Marks a habit as done for one day — the app's 打卡 action.
 *
 * The semantics follow the desktop app (and the Pomodoro auto-completion rules):
 *   - a simple habit (is_quantitative = 0) is ticked for the day (completed = 1);
 *   - a counted habit (is_quantitative = 1) gets exactly ONE count added to the
 *     day, capped at the habit's `target` — the counter never runs past it, and
 *     calling this again once the target is reached changes nothing.
 *
 * `date` defaults to today in local time (the app stores YYYY-MM-DD local dates,
 * see getLocalDateString in src/main/ipc/handlers.ts) and accepts any ISO date or
 * timestamp so a missed day can be backfilled.
 */
export function checkInHabit(
  db: DatabaseSync,
  id: string,
  input: CheckInHabitInput = {}
): CheckInHabitResult {
  const habit = getHabitRow(db, id)
  if (!habit) {
    throw new WriteError(`No habit with id ${id}. Use list_habits to find valid ids.`)
  }
  const target = habit.target >= 1 ? Math.trunc(habit.target) : 1
  const quantitative = habit.is_quantitative === 1
  const recordDate = normalizeDate(input.date, 'date') ?? localDateString()
  const notes = optionalText(input.notes)
  const existing = getHabitRecord(db, id, recordDate)

  let effect: CheckInEffect
  if (quantitative) {
    const current = existing ? Math.max(0, Math.trunc(existing.count) || 0) : 0
    if (current >= target) {
      effect = 'already-complete'
    } else {
      transact(db, () => {
        if (existing) {
          runStatement(db, 'UPDATE habit_records SET count = ?, notes = ? WHERE id = ?', [
            current + 1,
            notes ?? existing.notes,
            existing.id
          ])
        } else {
          insertHabitRecord(db, id, recordDate, notes)
        }
      })
      effect = 'counted'
    }
  } else if (existing && existing.completed === 1) {
    effect = 'already-complete'
  } else {
    transact(db, () => {
      if (existing) {
        runStatement(db, 'UPDATE habit_records SET completed = 1, notes = ? WHERE id = ?', [
          notes ?? existing.notes,
          existing.id
        ])
      } else {
        insertHabitRecord(db, id, recordDate, notes)
      }
    })
    effect = 'ticked'
  }

  const record = getHabitRecord(db, id, recordDate)
  if (!record) throw new WriteError('Check-in was recorded but could not be read back')
  const fresh = getHabitRow(db, id)
  if (!fresh) throw new WriteError(`No habit with id ${id}`)

  const count = Math.max(0, Math.trunc(record.count) || 0)
  const completedToday = quantitative ? count >= target : record.completed === 1
  const day = recordDate === localDateString() ? 'today' : recordDate
  const message =
    effect === 'already-complete'
      ? `"${habit.title}" is already complete for ${day} (${count}/${target}) — nothing changed.`
      : effect === 'counted'
        ? `"${habit.title}": ${count}/${target} counts for ${day}.`
        : `"${habit.title}" is ticked for ${day}.`

  return { habit: fresh, record, effect, count, target, completed_today: completedToday, message }
}

// ─── One-shot capture (随想 → GTD bucket) ─────────────────────────────────────

export interface CaptureInput {
  content: string
  target: CaptureTarget
  tags?: string[] | null
  weather?: string | null
  context?: string | null
  due_date?: string | null
  priority?: string | null
  project?: string | null
  project_id?: string | null
  waiting_for?: string | null
  notes?: string | null
  horizon?: string | null
  category?: string | null
  /** Delegation date for the "waiting_item" bucket (YYYY-MM-DD). */
  since?: string | null
}

export interface CaptureResult {
  target: CaptureTarget
  /** Which table the thought landed in. */
  bucket: 'notes' | 'tasks' | 'projects' | 'waiting_items' | 'someday_items'
  /** The created row, in the same shape the read tools return. */
  record: NoteRow | TaskRow | ProjectRow | WaitingRow | SomedayRow
  warnings: string[]
}

/**
 * Routes one captured thought into the right bucket.
 *
 * This is the tool agents reach for when the user says "记一下 …" — the target
 * decides whether it becomes a 随想 (note) or a GTD item (inbox / next /
 * waiting / someday task, a project, a waiting-for or a someday/maybe idea).
 */
export function captureItem(db: DatabaseSync, input: CaptureInput): CaptureResult {
  const content = requireText(input.content, 'content')
  const target = input.target
  if (!(CAPTURE_TARGETS as readonly string[]).includes(target)) {
    throw new WriteError(
      `"${target}" is not a capture target — expected one of: ${CAPTURE_TARGETS.join(', ')}`
    )
  }

  switch (target) {
    case 'note': {
      const record = createNote(db, {
        content,
        tags: input.tags ?? null,
        weather: input.weather ?? null
      })
      return { target, bucket: 'notes', record, warnings: [] }
    }
    case 'inbox':
    case 'next':
    case 'waiting':
    case 'someday': {
      const warnings: string[] = []
      const waitingFor =
        target === 'waiting' ? (optionalText(input.waiting_for) ?? undefined) : undefined
      if (target === 'waiting' && !waitingFor) {
        throw new WriteError(
          'Capturing into "waiting" needs waiting_for — the name of the person you are waiting on.'
        )
      }
      const record = createTask(db, {
        title: content,
        notes: input.notes ?? null,
        context: input.context ?? null,
        due_date: input.due_date ?? null,
        project_id: input.project_id ?? null,
        project: input.project ?? null,
        status: target,
        waiting_for: waitingFor ?? null,
        priority: input.priority ?? null
      })
      warnings.push(...contextWarning(db, record.context))
      return { target, bucket: 'tasks', record, warnings }
    }
    case 'project': {
      const record = createProject(db, {
        title: content,
        description: input.notes ?? null,
        status: 'active'
      })
      return { target, bucket: 'projects', record, warnings: [] }
    }
    case 'waiting_item': {
      const record = createWaitingItem(db, {
        title: content,
        waiting_for: requireText(input.waiting_for, 'waiting_for'),
        since: input.since ?? null,
        project_id: input.project_id ?? null,
        project: input.project ?? null,
        notes: input.notes ?? null
      })
      return { target, bucket: 'waiting_items', record, warnings: [] }
    }
    case 'someday_item': {
      const record = createSomedayItem(db, {
        title: content,
        notes: input.notes ?? null,
        horizon: input.horizon ?? null,
        category: input.category ?? null
      })
      return { target, bucket: 'someday_items', record, warnings: [] }
    }
    default:
      throw new WriteError(`Unsupported capture target: ${target}`)
  }
}
