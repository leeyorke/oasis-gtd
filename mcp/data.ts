/**
 * Read-only queries against the Oasis GTD database.
 *
 * Every function here maps to a GTD concept exposed through the MCP tools and
 * resources. Rows are returned verbatim (snake_case, exactly as stored in
 * SQLite) so agents see the same column names the app uses.
 */
import type { DatabaseSync } from 'node:sqlite'
import { queryAll, queryOne, tableRowCounts } from './db.ts'
import type { DbInfo } from './db.ts'

// ─── Shared vocabularies (mirrors the CHECK constraints in the app schema) ───
//
// Note: 'archive' predates the current CHECK constraint (the app has an Archive
// view and writes status='archive'), so it is accepted alongside the five
// canonical statuses. Tasks with status done/archive are both "closed".

export const TASK_STATUSES = ['inbox', 'next', 'waiting', 'someday', 'done', 'archive'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Statuses that count as closed for pending/attention metrics. */
const CLOSED_STATUS_SQL = "('done', 'archive')"

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_ORDERS = ['created_at', 'updated_at', 'due_date', 'priority', 'title'] as const
export type TaskOrder = (typeof TASK_ORDERS)[number]

export const PROJECT_STATUSES = ['active', 'on-hold'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const SOMEDAY_HORIZONS = ['soon', '1month', '3months', '1year', 'someday'] as const
export type SomedayHorizon = (typeof SOMEDAY_HORIZONS)[number]

export const RESOURCE_TYPES = ['document', 'link', 'spreadsheet', 'image', 'collection'] as const
export type ResourceType = (typeof RESOURCE_TYPES)[number]

export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 500

// ─── Row shapes ──────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string
  title: string
  notes: string | null
  context: string | null
  due_date: string | null
  project_id: string | null
  status: TaskStatus
  waiting_for: string | null
  priority: TaskPriority | null
  created_at: string
  updated_at: string
  project_title: string | null
}

export interface ProjectRow {
  id: string
  title: string
  description: string | null
  outcome: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
  open_task_count: number
  task_count: number
}

export interface WaitingRow {
  id: string
  title: string
  waiting_for: string
  since: string
  project_id: string | null
  notes: string | null
  created_at: string
  project_title: string | null
}

export interface SomedayRow {
  id: string
  title: string
  notes: string | null
  horizon: SomedayHorizon
  category: string
  created_at: string
  updated_at: string | null
}

export interface NoteRow {
  id: string
  content: string
  tags: string[] | null
  weather: string | null
  created_at: string
  updated_at: string
}

export interface HabitRow {
  id: string
  title: string
  description: string | null
  frequency: 'daily' | 'weekly'
  time_of_day: string | null
  color: string | null
  target: number
  is_quantitative: number
  is_archived: number
  created_at: string
  updated_at: string
  today_count: number
  total_sessions: number
}

export interface HabitRecordRow {
  id: string
  habit_id: string
  record_date: string
  completed: number
  count: number
  notes: string | null
  created_at: string
}

export interface ConversationRow {
  id: string
  title: string
  provider_id: string | null
  model: string | null
  created_at: string
  updated_at: string
  message_count: number
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export interface ResourceRow {
  id: string
  title: string
  type: ResourceType
  description: string | null
  file_size: string | null
  url: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface ReviewRow {
  id: string
  category: string
  title: string
  completed: number
  review_date: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT)
}

function parseStringArray(value: unknown): string[] | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null
  } catch {
    return null
  }
}

const TASK_ORDER_SQL: Record<TaskOrder, string> = {
  created_at: 't.created_at ASC',
  updated_at: 't.updated_at DESC',
  due_date: 'CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ASC',
  priority:
    "CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END ASC, t.created_at ASC",
  title: 't.title ASC'
}

const TASK_COLUMNS = `
  t.id, t.title, t.notes, t.context, t.due_date, t.project_id, t.status,
  t.waiting_for, t.priority, t.created_at, t.updated_at, p.title AS project_title
`

// ─── Overview ────────────────────────────────────────────────────────────────

export interface OverviewData {
  database: DbInfo
  generated_at: string
  counts: {
    tasks: Record<TaskStatus, number> & { total: number; by_status: Record<string, number> }
    projects: Record<ProjectStatus, number> & { total: number }
    waiting_items: number
    someday_items: number
    notes: number
    habits: { active: number; archived: number }
    conversations: number
    messages: number
    resources: number
    review: { completed: number; total: number }
  }
  attention: {
    overdue_tasks: number
    due_today_tasks: number
    inbox_tasks: number
    next_actions_without_context: number
    stale_waiting_items: number
    review_completion_rate: number
  }
  recent_activity: {
    tasks_updated_last_7_days: number
    conversations_updated_last_7_days: number
    habit_sessions_last_7_days: number
  }
  contexts: string[] | null
  app_name: string | null
}

export function getOverview(db: DatabaseSync, info: DbInfo): OverviewData {
  const taskTotal = queryOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM tasks')?.n ?? 0
  const statusRows = queryAll<{ status: string; n: number }>(
    db,
    'SELECT status, COUNT(*) AS n FROM tasks GROUP BY status'
  )
  const byStatus: Record<string, number> = {}
  for (const row of statusRows) byStatus[row.status] = row.n
  const taskCount = (status: TaskStatus): number => byStatus[status] ?? 0

  const projectCounts = queryOne<{ total: number; active: number; on_hold: number }>(
    db,
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'on-hold' THEN 1 ELSE 0 END) AS on_hold
     FROM projects`
  )
  const scalar = (sql: string, params: unknown[] = []): number =>
    queryOne<{ n: number }>(db, sql, params)?.n ?? 0

  const waitingItems = scalar('SELECT COUNT(*) AS n FROM waiting_items')
  const somedayItems = scalar('SELECT COUNT(*) AS n FROM someday_items')
  const notes = scalar('SELECT COUNT(*) AS n FROM notes')
  const habitsActive = scalar('SELECT COUNT(*) AS n FROM habits WHERE is_archived = 0')
  const habitsArchived = scalar('SELECT COUNT(*) AS n FROM habits WHERE is_archived = 1')
  const conversations = scalar('SELECT COUNT(*) AS n FROM chat_conversations')
  const messages = scalar('SELECT COUNT(*) AS n FROM chat_messages')
  const resources = scalar('SELECT COUNT(*) AS n FROM resources')
  const reviewCompleted = scalar('SELECT COUNT(*) AS n FROM review_checklist WHERE completed = 1')
  const reviewTotal = scalar('SELECT COUNT(*) AS n FROM review_checklist')

  const contextsRow = queryOne<{ value: string | null }>(
    db,
    "SELECT value FROM app_settings WHERE key = 'contexts'"
  )
  const appNameRow = queryOne<{ value: string | null }>(
    db,
    "SELECT value FROM app_settings WHERE key = 'app_name'"
  )

  return {
    database: info,
    generated_at: new Date().toISOString(),
    counts: {
      tasks: {
        total: taskTotal,
        inbox: taskCount('inbox'),
        next: taskCount('next'),
        waiting: taskCount('waiting'),
        someday: taskCount('someday'),
        done: taskCount('done'),
        archive: taskCount('archive'),
        by_status: byStatus
      },
      projects: {
        total: projectCounts?.total ?? 0,
        active: projectCounts?.active ?? 0,
        'on-hold': projectCounts?.on_hold ?? 0
      },
      waiting_items: waitingItems,
      someday_items: somedayItems,
      notes,
      habits: { active: habitsActive, archived: habitsArchived },
      conversations,
      messages,
      resources,
      review: { completed: reviewCompleted, total: reviewTotal }
    },
    attention: {
      overdue_tasks: scalar(
        `SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ${CLOSED_STATUS_SQL} AND due_date IS NOT NULL AND date(due_date) < date('now')`
      ),
      due_today_tasks: scalar(
        `SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ${CLOSED_STATUS_SQL} AND due_date IS NOT NULL AND date(due_date) = date('now')`
      ),
      inbox_tasks: taskCount('inbox'),
      next_actions_without_context: scalar(
        "SELECT COUNT(*) AS n FROM tasks WHERE status = 'next' AND (context IS NULL OR context = '')"
      ),
      stale_waiting_items: scalar(
        "SELECT COUNT(*) AS n FROM waiting_items WHERE date(since) < date('now', '-7 days')"
      ),
      review_completion_rate:
        reviewTotal === 0 ? 0 : Math.round((reviewCompleted / reviewTotal) * 1000) / 10
    },
    recent_activity: {
      tasks_updated_last_7_days: scalar(
        "SELECT COUNT(*) AS n FROM tasks WHERE date(updated_at) >= date('now', '-7 days')"
      ),
      conversations_updated_last_7_days: scalar(
        "SELECT COUNT(*) AS n FROM chat_conversations WHERE date(updated_at) >= date('now', '-7 days')"
      ),
      habit_sessions_last_7_days: scalar(
        "SELECT COALESCE(SUM(count), 0) AS n FROM habit_records WHERE record_date >= date('now', '-7 days')"
      )
    },
    contexts: parseStringArray(contextsRow?.value ?? null),
    app_name: appNameRow?.value ?? null
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface TaskFilters {
  status?: TaskStatus
  project_id?: string
  priority?: TaskPriority
  context?: string
  query?: string
  due_before?: string
  exclude_done?: boolean
  order?: TaskOrder
  limit?: number
  offset?: number
}

export interface TaskPage {
  filters: TaskFilters
  returned: number
  total_matching: number
  tasks: TaskRow[]
}

export function listTasks(db: DatabaseSync, filters: TaskFilters = {}): TaskPage {
  const where: string[] = []
  const params: unknown[] = []

  if (filters.status) {
    where.push('t.status = ?')
    params.push(filters.status)
  }
  if (filters.project_id) {
    where.push('t.project_id = ?')
    params.push(filters.project_id)
  }
  if (filters.priority) {
    where.push('t.priority = ?')
    params.push(filters.priority)
  }
  if (filters.context) {
    where.push('t.context = ?')
    params.push(filters.context)
  }
  if (filters.query && filters.query.trim() !== '') {
    const like = `%${filters.query.trim()}%`
    where.push('(t.title LIKE ? OR t.notes LIKE ? OR t.waiting_for LIKE ?)')
    params.push(like, like, like)
  }
  if (filters.due_before) {
    where.push('t.due_date IS NOT NULL AND date(t.due_date) <= date(?)')
    params.push(filters.due_before)
  }
  if (filters.exclude_done && !filters.status) {
    where.push(`t.status NOT IN ${CLOSED_STATUS_SQL}`)
  }

  const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''
  const totalRow = queryOne<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM tasks t LEFT JOIN projects p ON p.id = t.project_id${whereSql}`,
    params
  )

  const limit = clampLimit(filters.limit)
  const offset = Math.max(Math.trunc(filters.offset ?? 0), 0)
  const order = TASK_ORDER_SQL[filters.order ?? 'created_at']
  const tasks = queryAll<TaskRow>(
    db,
    `SELECT ${TASK_COLUMNS} FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id${whereSql}
     ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )
  return {
    filters,
    returned: tasks.length,
    total_matching: totalRow?.n ?? 0,
    tasks
  }
}

export function getTask(db: DatabaseSync, id: string): TaskRow | undefined {
  return queryOne<TaskRow>(
    db,
    `SELECT ${TASK_COLUMNS} FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
    [id]
  )
}

// ─── Projects ────────────────────────────────────────────────────────────────

const PROJECT_COLUMNS = `
  p.id, p.title, p.description, p.outcome, p.status, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'done') AS open_task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
`

export function listProjects(db: DatabaseSync, status?: ProjectStatus): ProjectRow[] {
  if (status) {
    return queryAll<ProjectRow>(
      db,
      `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.status = ? ORDER BY p.created_at ASC`,
      [status]
    )
  }
  return queryAll<ProjectRow>(
    db,
    `SELECT ${PROJECT_COLUMNS} FROM projects p
     ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END, p.created_at ASC`
  )
}

export function getProject(
  db: DatabaseSync,
  id: string
): { project: ProjectRow; tasks: TaskRow[]; waiting_items: WaitingRow[] } | undefined {
  const project = queryOne<ProjectRow>(
    db,
    `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`,
    [id]
  )
  if (!project) return undefined
  const tasks = queryAll<TaskRow>(
    db,
    `SELECT ${TASK_COLUMNS} FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.project_id = ?
     ORDER BY CASE t.status WHEN 'done' THEN 1 WHEN 'archive' THEN 2 ELSE 0 END, t.created_at ASC`,
    [id]
  )
  const waiting_items = queryAll<WaitingRow>(
    db,
    `SELECT w.id, w.title, w.waiting_for, w.since, w.project_id, w.notes, w.created_at,
            p2.title AS project_title
     FROM waiting_items w
     LEFT JOIN projects p2 ON p2.id = w.project_id
     WHERE w.project_id = ? ORDER BY w.since ASC`,
    [id]
  )
  return { project, tasks, waiting_items }
}

// ─── Waiting items ───────────────────────────────────────────────────────────

export function listWaitingItems(db: DatabaseSync, projectId?: string): WaitingRow[] {
  if (projectId) {
    return queryAll<WaitingRow>(
      db,
      `SELECT w.*, p.title AS project_title FROM waiting_items w
       LEFT JOIN projects p ON p.id = w.project_id
       WHERE w.project_id = ? ORDER BY w.since ASC`,
      [projectId]
    )
  }
  return queryAll<WaitingRow>(
    db,
    `SELECT w.*, p.title AS project_title FROM waiting_items w
     LEFT JOIN projects p ON p.id = w.project_id ORDER BY w.since ASC`
  )
}

// ─── Someday items ───────────────────────────────────────────────────────────

const HORIZON_ORDER = `CASE horizon
  WHEN 'soon' THEN 0 WHEN '1month' THEN 1 WHEN '3months' THEN 2
  WHEN '1year' THEN 3 ELSE 4 END`

export function listSomedayItems(db: DatabaseSync, horizon?: SomedayHorizon, category?: string): SomedayRow[] {
  const where: string[] = []
  const params: unknown[] = []
  if (horizon) {
    where.push('horizon = ?')
    params.push(horizon)
  }
  if (category && category.trim() !== '') {
    where.push('category = ?')
    params.push(category.trim())
  }
  const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''
  return queryAll<SomedayRow>(
    db,
    `SELECT * FROM someday_items${whereSql} ORDER BY ${HORIZON_ORDER}, created_at ASC`,
    params
  )
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function listNotes(db: DatabaseSync, tag?: string, limit?: number): NoteRow[] {
  const rows = queryAll<Omit<NoteRow, 'tags'> & { tags: string | null }>(
    db,
    'SELECT * FROM notes ORDER BY created_at DESC LIMIT ?',
    [clampLimit(limit)]
  )
  const mapped = rows.map((row) => ({ ...row, tags: parseStringArray(row.tags) }))
  if (tag && tag.trim() !== '') {
    const needle = tag.trim().toLowerCase()
    return mapped.filter((row) => row.tags?.some((t) => t.toLowerCase() === needle))
  }
  return mapped
}

export function searchNotes(db: DatabaseSync, query: string, limit?: number): NoteRow[] {
  const like = `%${query.trim()}%`
  const rows = queryAll<Omit<NoteRow, 'tags'> & { tags: string | null }>(
    db,
    'SELECT * FROM notes WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?',
    [like, like, clampLimit(limit)]
  )
  return rows.map((row) => ({ ...row, tags: parseStringArray(row.tags) }))
}

// ─── Habits ──────────────────────────────────────────────────────────────────

export function listHabits(db: DatabaseSync, includeArchived = false): HabitRow[] {
  const where = includeArchived ? '' : ' WHERE h.is_archived = 0'
  return queryAll<HabitRow>(
    db,
    `SELECT h.id, h.title, h.description, h.frequency, h.time_of_day, h.color,
            h.target, h.is_quantitative, h.is_archived, h.created_at, h.updated_at,
            (SELECT COALESCE(SUM(r.count), 0) FROM habit_records r
              WHERE r.habit_id = h.id AND r.record_date = date('now')) AS today_count,
            (SELECT COALESCE(SUM(r.count), 0) FROM habit_records r
              WHERE r.habit_id = h.id) AS total_sessions
     FROM habits h${where} ORDER BY h.created_at ASC`
  )
}

export interface HabitDetail {
  habit: HabitRow | undefined
  recent_records: HabitRecordRow[]
}

export function getHabit(db: DatabaseSync, id: string, days = 30): HabitDetail | undefined {
  const habit = queryOne<HabitRow>(
    db,
    `SELECT h.id, h.title, h.description, h.frequency, h.time_of_day, h.color,
            h.target, h.is_quantitative, h.is_archived, h.created_at, h.updated_at,
            (SELECT COALESCE(SUM(r.count), 0) FROM habit_records r
              WHERE r.habit_id = h.id AND r.record_date = date('now')) AS today_count,
            (SELECT COALESCE(SUM(r.count), 0) FROM habit_records r
              WHERE r.habit_id = h.id) AS total_sessions
     FROM habits h WHERE h.id = ?`,
    [id]
  )
  if (!habit) return undefined
  const window = Math.min(Math.max(Math.trunc(days), 1), 365)
  const recent_records = queryAll<HabitRecordRow>(
    db,
    `SELECT * FROM habit_records
     WHERE habit_id = ? AND record_date >= date('now', ?)
     ORDER BY record_date DESC`,
    [id, `-${window} days`]
  )
  return { habit, recent_records }
}

// ─── Conversations ───────────────────────────────────────────────────────────

export function listConversations(db: DatabaseSync, limit?: number): ConversationRow[] {
  return queryAll<ConversationRow>(
    db,
    `SELECT c.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
     FROM chat_conversations c ORDER BY c.updated_at DESC LIMIT ?`,
    [clampLimit(limit)]
  )
}

export function getConversation(
  db: DatabaseSync,
  id: string,
  limit?: number
): { conversation: ConversationRow; messages: MessageRow[] } | undefined {
  const conversation = queryOne<ConversationRow>(
    db,
    `SELECT c.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
     FROM chat_conversations c WHERE c.id = ?`,
    [id]
  )
  if (!conversation) return undefined
  const messages = queryAll<MessageRow>(
    db,
    'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?',
    [id, clampLimit(limit)]
  )
  return { conversation, messages }
}

// ─── Resources ───────────────────────────────────────────────────────────────

export function listResources(db: DatabaseSync, type?: ResourceType, limit?: number): ResourceRow[] {
  const where = type ? ' WHERE type = ?' : ''
  const params = type ? [type] : []
  const rows = queryAll<Omit<ResourceRow, 'tags'> & { tags: string | null }>(
    db,
    `SELECT * FROM resources${where} ORDER BY updated_at DESC LIMIT ?`,
    [...params, clampLimit(limit)]
  )
  return rows.map((row) => ({ ...row, tags: parseStringArray(row.tags) }))
}

// ─── Review checklist ────────────────────────────────────────────────────────

export function getReviewChecklist(db: DatabaseSync, includeCompleted = true): ReviewRow[] {
  const where = includeCompleted ? '' : ' WHERE completed = 0'
  return queryAll<ReviewRow>(
    db,
    `SELECT * FROM review_checklist${where} ORDER BY rowid ASC`
  )
}

// ─── Database info ───────────────────────────────────────────────────────────

export interface DbInfoData {
  database: DbInfo
  row_counts: Record<string, number>
}

export function getDbInfoData(db: DatabaseSync, info: DbInfo): DbInfoData {
  return { database: info, row_counts: tableRowCounts(db) }
}

// ─── Full export ─────────────────────────────────────────────────────────────

export interface FullExport {
  exported_at: string
  database: DbInfo
  tasks: TaskRow[]
  projects: ProjectRow[]
  waiting_items: WaitingRow[]
  someday_items: SomedayRow[]
  notes: NoteRow[]
  habits: HabitRow[]
  resources: ResourceRow[]
  review_checklist: ReviewRow[]
  conversations: ConversationRow[]
  messages?: MessageRow[]
}

export function exportAll(db: DatabaseSync, info: DbInfo, includeMessages = false): FullExport {
  const messageRows = includeMessages
    ? queryAll<MessageRow>(db, 'SELECT * FROM chat_messages ORDER BY created_at ASC')
    : undefined
  return {
    exported_at: new Date().toISOString(),
    database: info,
    tasks: queryAll<TaskRow>(
      db,
      `SELECT ${TASK_COLUMNS} FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id ORDER BY t.created_at ASC`
    ),
    projects: listProjects(db),
    waiting_items: listWaitingItems(db),
    someday_items: listSomedayItems(db),
    notes: listNotes(db),
    habits: listHabits(db, true),
    resources: listResources(db),
    review_checklist: getReviewChecklist(db),
    conversations: listConversations(db, 200),
    ...(messageRows ? { messages: messageRows } : {})
  }
}
