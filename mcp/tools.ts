/**
 * MCP tools exposing the Oasis GTD database to agents.
 *
 * The read tools (get_*, list_*, search_*, export_*) only ever run SELECT
 * statements and advertise readOnlyHint. The write tools (create_*, update_*,
 * delete_*, capture_item, check_in_habit) are allowed to change the user's GTD
 * data — they are registered only when the server runs in write mode, and they
 * advertise readOnlyHint:false / destructiveHint so a well-behaved client can
 * warn the user before something is removed.
 */
import type { DatabaseSync } from './sqlite.ts'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { DbInfo, WritePolicy } from './db.ts'
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PROJECT_STATUSES,
  RESOURCE_TYPES,
  SOMEDAY_HORIZONS,
  TASK_ORDERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  exportAll,
  getConversation,
  getDbInfoData,
  getFocusSummary,
  getHabit,
  getOverview,
  getProject,
  getReviewChecklist,
  getTask,
  listConversations,
  listFocusSessions,
  listHabits,
  listNotes,
  listProjects,
  listResources,
  listSomedayItems,
  listTasks,
  listWaitingItems,
  searchNotes
} from './data.ts'
import {
  CAPTURE_TARGETS,
  PROJECT_WRITABLE_STATUSES,
  WRITABLE_TASK_STATUSES,
  WRITABLE_TASK_STATUSES_ALL,
  captureItem,
  checkInHabit,
  createNote,
  createProject,
  createSomedayItem,
  createTask,
  createWaitingItem,
  deleteNote,
  deleteProject,
  deleteSomedayItem,
  deleteTask,
  deleteWaitingItem,
  updateNote,
  updateProject,
  updateSomedayItem,
  updateTask
} from './write.ts'

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}

/** Creates data — not read-only, but not destructive either. */
const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
}

/** Removes data — clients should confirm with the user first. */
const DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function guard<T>(fn: () => T): T | CallToolResult {
  try {
    return fn()
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .default(DEFAULT_LIMIT)
  .describe(`Page size (1–${MAX_LIMIT}, default ${DEFAULT_LIMIT})`)

const offsetSchema = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe('Rows to skip (for pagination)')

const idSchema = z.string().min(1).describe('UUID of the record, as returned by list_* tools')

export function registerTools(
  server: McpServer,
  db: DatabaseSync,
  info: DbInfo,
  writePolicy: WritePolicy
): void {
  // ── Orientation ────────────────────────────────────────────────────────────

  server.registerTool(
    'get_overview',
    {
      title: 'GTD Overview',
      description:
        'Snapshot of the whole GTD system: task counts per status (inbox/next/waiting/someday/done), ' +
        'project, waiting-for, someday, notes, habits, conversations and resource counts, plus attention ' +
        'items (overdue tasks, due-today tasks, inbox size, next actions without @context, waiting items ' +
        'stale for over a week), recent activity and the configured @context list. Start here to orient.',
      inputSchema: {},
      annotations: READ_ONLY_ANNOTATIONS
    },
    async () => ok(getOverview(db, info))
  )

  server.registerTool(
    'get_db_info',
    {
      title: 'Database Info',
      description:
        'Which database file is being served (path, dev vs packaged profile, open mode ' +
        '(read-only / read-write), schema version, size) and the row count of every table. ' +
        'Useful for debugging agent setups.',
      inputSchema: {},
      annotations: READ_ONLY_ANNOTATIONS
    },
    async () => ok(getDbInfoData(db, info))
  )

  // ── Tasks ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_tasks',
    {
      title: 'List Tasks',
      description:
        'List GTD tasks with optional filters. Status values follow the app model: inbox (unprocessed ' +
        'captures), next (next action), waiting (delegated/blocked), someday, done, archive (closed and ' +
        'hidden). Results include the project title when the task belongs to a project.',
      inputSchema: {
        status: z.enum(TASK_STATUSES).optional().describe('Filter by task status'),
        project_id: z.string().optional().describe('Only tasks of this project UUID'),
        priority: z.enum(TASK_PRIORITIES).optional().describe('Filter by priority'),
        context: z
          .string()
          .optional()
          .describe("Filter by @context, e.g. '@Computer' or '@Office'"),
        query: z
          .string()
          .optional()
          .describe('Keyword matched against title, notes and waiting_for'),
        due_before: z
          .string()
          .optional()
          .describe('ISO date (YYYY-MM-DD); only tasks due on or before this date'),
        exclude_done: z
          .boolean()
          .optional()
          .describe('When true (and no status filter), hides done and archived tasks'),
        order: z
          .enum(TASK_ORDERS)
          .optional()
          .describe('Sort order (default created_at)'),
        limit: limitSchema,
        offset: offsetSchema
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (args) => ok(listTasks(db, args))
  )

  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description: 'Fetch a single task by its UUID. Use list_tasks or search_tasks to find ids.',
      inputSchema: { id: idSchema },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ id }) => guard(() => {
      const task = getTask(db, id)
      return task ? ok(task) : fail(`No task with id ${id}`)
    })
  )

  server.registerTool(
    'search_tasks',
    {
      title: 'Search Tasks',
      description:
        'Full-text-ish keyword search across task titles, notes and waiting_for names. ' +
        'Use this to find tasks when you only remember a fragment.',
      inputSchema: {
        query: z.string().min(1).describe('Keyword to search for'),
        status: z.enum(TASK_STATUSES).optional().describe('Optionally restrict to one status'),
        limit: limitSchema
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, status, limit }) => {
      const result = listTasks(db, { query, status, limit })
      if (result.tasks.length === 0) return fail(`No tasks matching "${query}"`)
      return ok(result)
    }
  )

  // ── Projects ───────────────────────────────────────────────────────────────

  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description:
        'List projects with open and total task counts. status=active means the project is being ' +
        'worked on; on-hold means paused.',
      inputSchema: {
        status: z.enum(PROJECT_STATUSES).optional().describe('Filter by project status')
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ status }) => ok({ projects: listProjects(db, status) })
  )

  server.registerTool(
    'get_project',
    {
      title: 'Get Project',
      description:
        'Fetch one project by UUID together with its tasks (open first) and its waiting-for items.',
      inputSchema: { id: idSchema },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ id }) => guard(() => {
      const project = getProject(db, id)
      return project ? ok(project) : fail(`No project with id ${id}`)
    })
  )

  // ── Waiting for ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_waiting_items',
    {
      title: 'List Waiting-For Items',
      description:
        'List delegated/blocked items the user is waiting on, oldest first (these are the items to ' +
        'chase). Includes the project title when linked to a project.',
      inputSchema: { project_id: z.string().optional().describe('Only items of this project UUID') },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ project_id }) => ok({ waiting_items: listWaitingItems(db, project_id) })
  )

  // ── Someday / maybe ────────────────────────────────────────────────────────

  server.registerTool(
    'list_someday_items',
    {
      title: 'List Someday/Maybe Items',
      description:
        'List future ideas by time horizon: soon, 1month, 3months, 1year, someday.',
      inputSchema: {
        horizon: z.enum(SOMEDAY_HORIZONS).optional().describe('Filter by time horizon'),
        category: z.string().optional().describe('Filter by category')
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ horizon, category }) => ok({ someday_items: listSomedayItems(db, horizon, category) })
  )

  // ── Notes ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_notes',
    {
      title: 'List Notes',
      description: 'List quick notes/thoughts, newest first. Tags are parsed into arrays.',
      inputSchema: {
        tag: z.string().optional().describe('Only notes carrying this exact tag'),
        limit: limitSchema
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ tag, limit }) => ok({ notes: listNotes(db, tag, limit) })
  )

  server.registerTool(
    'search_notes',
    {
      title: 'Search Notes',
      description: 'Keyword search across note contents and tags.',
      inputSchema: {
        query: z.string().min(1).describe('Keyword to search for'),
        limit: limitSchema
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, limit }) => ok({ notes: searchNotes(db, query, limit) })
  )

  // ── Habits ─────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_habits',
    {
      title: 'List Habits',
      description:
        'List habits with today\'s check-in count and all-time sessions. is_quantitative=1 means the ' +
        'habit counts occurrences per day (target is the daily goal); 0 means a simple yes/no habit.',
      inputSchema: {
        include_archived: z.boolean().optional().describe('Include archived habits (default false)')
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ include_archived }) => ok({ habits: listHabits(db, include_archived ?? false) })
  )

  server.registerTool(
    'get_habit',
    {
      title: 'Get Habit',
      description: 'Fetch one habit with its check-in records for the last N days (1–365, default 30).',
      inputSchema: {
        id: idSchema,
        days: z.number().int().min(1).max(365).default(30).describe('Days of history to include')
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ id, days }) => guard(() => {
      const habit = getHabit(db, id, days)
      return habit ? ok(habit) : fail(`No habit with id ${id}`)
    })
  )

  // ── AI chat history ────────────────────────────────────────────────────────

  server.registerTool(
    'list_conversations',
    {
      title: 'List Conversations',
      description:
        'List AI chat conversations (most recently updated first) with message counts and the model used.',
      inputSchema: { limit: limitSchema },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ limit }) => ok({ conversations: listConversations(db, limit) })
  )

  server.registerTool(
    'get_conversation',
    {
      title: 'Get Conversation',
      description:
        'Fetch a conversation by UUID with its messages in chronological order. This is the user\'s own ' +
        'chat history with the in-app AI assistant.',
      inputSchema: {
        id: idSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(200)
          .describe('Maximum number of messages to return')
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ id, limit }) => guard(() => {
      const conversation = getConversation(db, id, limit)
      return conversation ? ok(conversation) : fail(`No conversation with id ${id}`)
    })
  )

  // ── Resources ──────────────────────────────────────────────────────────────

  server.registerTool(
    'list_resources',
    {
      title: 'List Resources',
      description:
        'List the user\'s reference material (documents, links, spreadsheets, images, collections), ' +
        'most recently updated first.',
      inputSchema: {
        type: z.enum(RESOURCE_TYPES).optional().describe('Filter by resource type'),
        limit: limitSchema
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ type, limit }) => ok({ resources: listResources(db, type, limit) })
  )

  // ── Pomodoro focus ─────────────────────────────────────────────────────────

  server.registerTool(
    'list_focus_sessions',
    {
      title: 'List Focus Sessions',
      description:
        'Pomodoro focus sessions with the task they were run against, how long the user actually focused ' +
        '(focused_seconds, in seconds — partial sessions included) and whether the pomodoro completed. ' +
        'Also returns per-day totals for the same window.',
      inputSchema: {
        days: z.number().int().min(1).max(365).default(30).describe('Days of history to include'),
        limit: limitSchema
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ days, limit }) => ok({
      sessions: listFocusSessions(db, days, limit),
      summary: getFocusSummary(db, days)
    })
  )

  // ── Weekly review ──────────────────────────────────────────────────────────

  server.registerTool(
    'get_review_checklist',
    {
      title: 'Get Review Checklist',
      description:
        'The weekly review checklist with completion state. completed=1 means the item was done in the ' +
        'current review cycle, and review_date is when it was last ticked.',
      inputSchema: {
        include_completed: z
          .boolean()
          .optional()
          .describe('Include completed items (default true)'),
        category: z.string().optional().describe('Only items in this category')
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ include_completed, category }) => {
      const items = getReviewChecklist(db, include_completed ?? true)
      const filtered =
        category && category.trim() !== ''
          ? items.filter((item) => item.category === category.trim())
          : items
      return ok({
        review_checklist: filtered,
        completed: filtered.filter((item) => item.completed === 1).length,
        total: filtered.length
      })
    }
  )

  // ── Bulk export ────────────────────────────────────────────────────────────

  server.registerTool(
    'export_gtd_data',
    {
      title: 'Export GTD Data',
      description:
        'Export the whole GTD dataset as JSON: tasks, projects, waiting items, someday items, notes, ' +
        'habits, resources, review checklist and conversations. Set include_messages=true to also ' +
        'include all AI chat message bodies.',
      inputSchema: {
        include_messages: z
          .boolean()
          .optional()
          .describe('Also export all chat message bodies (default false)')
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ include_messages }) => ok(exportAll(db, info, include_messages ?? false))
  )

  // ── Write tools ────────────────────────────────────────────────────────────
  //
  // These change the user's data. They stay registered even when the server
  // runs read-only, so an agent that tries to capture something gets a precise
  // explanation ("writes are disabled …") instead of an "unknown tool" error.

  /** Runs a write and turns validation problems into readable tool errors. */
  const write = <T>(action: () => T): CallToolResult => {
    if (!writePolicy.enabled) {
      return fail(
        writePolicy.reason ?? 'Write operations are disabled for this server. Enable writes to use it.'
      )
    }
    try {
      return ok(action())
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  const projectRefSchema = {
    project_id: z
      .string()
      .optional()
      .describe('Project UUID (from list_projects) the item belongs to'),
    project: z
      .string()
      .optional()
      .describe('Project title instead of the id — matched case-insensitively')
  }

  // ── Notes (随想) ───────────────────────────────────────────────────────────

  server.registerTool(
    'create_note',
    {
      title: 'Create Note (随想)',
      description:
        'Create a quick note / thought in the 随想 view. Notes are free-form captures; use ' +
        'capture_item with target="note" as a one-shot alternative.',
      inputSchema: {
        content: z.string().min(1).describe('The note text'),
        tags: z.array(z.string()).optional().describe('Tags, e.g. ["idea","work"]'),
        weather: z
          .string()
          .optional()
          .describe('Optional weather label the app shows next to the note (晴朗/多云/小雨/大风)')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async ({ content, tags, weather }) =>
      write(() => {
        const record = createNote(db, { content, tags, weather })
        return { action: 'create', entity: 'note', id: record.id, record }
      })
  )

  server.registerTool(
    'update_note',
    {
      title: 'Update Note (随想)',
      description: 'Change the text, tags or weather of an existing note. Only the given fields are changed.',
      inputSchema: {
        id: idSchema,
        content: z.string().min(1).optional().describe('New note text'),
        tags: z.array(z.string()).optional().describe('Replacement tag list'),
        weather: z.string().optional().describe('Replacement weather label')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async ({ id, content, tags, weather }) =>
      write(() => {
        const record = updateNote(db, id, { content, tags, weather })
        return { action: 'update', entity: 'note', id: record.id, record }
      })
  )

  server.registerTool(
    'delete_note',
    {
      title: 'Delete Note (随想)',
      description: 'Delete a note permanently. The deleted note is returned so the agent can report it.',
      inputSchema: { id: idSchema },
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    async ({ id }) =>
      write(() => {
        const record = deleteNote(db, id)
        return { action: 'delete', entity: 'note', id: record.id, record }
      })
  )

  // ── Tasks ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'create_task',
    {
      title: 'Create Task',
      description:
        'Create a GTD task in one of the app\'s task buckets: inbox (unprocessed capture), next ' +
        '(next action), waiting (delegated/blocked), someday or done. A waiting task needs ' +
        'waiting_for; a task can be linked to a project by id or by title.',
      inputSchema: {
        title: z.string().min(1).describe('What needs to be done'),
        status: z
          .enum(WRITABLE_TASK_STATUSES)
          .optional()
          .describe('Task bucket (default: inbox)'),
        notes: z.string().optional().describe('Longer description / details'),
        context: z.string().optional().describe('@context, e.g. "@Computer"'),
        due_date: z.string().optional().describe('Due date (YYYY-MM-DD)'),
        ...projectRefSchema,
        waiting_for: z
          .string()
          .optional()
          .describe('For status "waiting": who the item is waiting on'),
        priority: z.enum(TASK_PRIORITIES).optional().describe('Task priority')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async (args) =>
      write(() => {
        const record = createTask(db, {
          title: args.title,
          status: args.status,
          notes: args.notes ?? null,
          context: args.context ?? null,
          due_date: args.due_date ?? null,
          project_id: args.project_id ?? null,
          project: args.project ?? null,
          waiting_for: args.waiting_for ?? null,
          priority: args.priority ?? null
        })
        return { action: 'create', entity: 'task', id: record.id, record }
      })
  )

  server.registerTool(
    'update_task',
    {
      title: 'Update Task',
      description:
        'Change an existing task — title, notes, @context, due date, project, status, ' +
        'waiting_for or priority. Only the fields you pass are changed. status="done" closes a ' +
        'task, status="archive" files it away. Pass an empty project/project_id to detach the ' +
        'task from its project.',
      inputSchema: {
        id: idSchema,
        title: z.string().min(1).optional().describe('New title'),
        notes: z.string().optional().describe('New notes'),
        context: z.string().optional().describe('New @context'),
        due_date: z.string().optional().describe('New due date (YYYY-MM-DD)'),
        ...projectRefSchema,
        status: z.enum(WRITABLE_TASK_STATUSES_ALL).optional().describe('New task status'),
        waiting_for: z.string().optional().describe('New waiting_for person'),
        priority: z.enum(TASK_PRIORITIES).optional().describe('New priority')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async (args) =>
      write(() => {
        const record = updateTask(db, args.id, {
          title: args.title,
          notes: args.notes,
          context: args.context,
          due_date: args.due_date,
          project_id: args.project_id,
          project: args.project,
          status: args.status,
          waiting_for: args.waiting_for,
          priority: args.priority
        })
        return { action: 'update', entity: 'task', id: record.id, record }
      })
  )

  server.registerTool(
    'delete_task',
    {
      title: 'Delete Task',
      description: 'Delete a task permanently. The deleted task is returned so the agent can report it.',
      inputSchema: { id: idSchema },
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    async ({ id }) =>
      write(() => {
        const record = deleteTask(db, id)
        return { action: 'delete', entity: 'task', id: record.id, record }
      })
  )

  // ── Projects ───────────────────────────────────────────────────────────────

  server.registerTool(
    'create_project',
    {
      title: 'Create Project',
      description:
        'Create a project — an outcome the user is working towards. The description is the ' +
        'project intent, the outcome is the definition of done.',
      inputSchema: {
        title: z.string().min(1).describe('Project title'),
        description: z.string().optional().describe('What this project is about'),
        outcome: z.string().optional().describe('What "done" looks like'),
        status: z.enum(PROJECT_WRITABLE_STATUSES).optional().describe('active (default) or on-hold')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async ({ title, description, outcome, status }) =>
      write(() => {
        const record = createProject(db, { title, description, outcome, status })
        return { action: 'create', entity: 'project', id: record.id, record }
      })
  )

  server.registerTool(
    'update_project',
    {
      title: 'Update Project',
      description: 'Change a project\'s title, description, outcome or status.',
      inputSchema: {
        id: idSchema,
        title: z.string().min(1).optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        outcome: z.string().optional().describe('New outcome'),
        status: z.enum(PROJECT_WRITABLE_STATUSES).optional().describe('New status')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async (args) =>
      write(() => {
        const record = updateProject(db, args.id, {
          title: args.title,
          description: args.description,
          outcome: args.outcome,
          status: args.status
        })
        return { action: 'update', entity: 'project', id: record.id, record }
      })
  )

  server.registerTool(
    'delete_project',
    {
      title: 'Delete Project',
      description:
        'Delete a project. Its tasks and waiting-for items are kept and detached (project_id = null).',
      inputSchema: { id: idSchema },
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    async ({ id }) =>
      write(() => {
        const record = deleteProject(db, id)
        return { action: 'delete', entity: 'project', id: record.id, record }
      })
  )

  // ── Waiting-for ────────────────────────────────────────────────────────────

  server.registerTool(
    'create_waiting_item',
    {
      title: 'Create Waiting-For Item',
      description:
        'Record something the user delegated and is now waiting on (waiting_for = the person). ' +
        '"since" is the day the delegation started.',
      inputSchema: {
        title: z.string().min(1).describe('What the user is waiting for'),
        waiting_for: z.string().min(1).describe('Who the user is waiting on'),
        since: z.string().optional().describe('Delegation date (YYYY-MM-DD, default: today)'),
        notes: z.string().optional().describe('Extra context'),
        ...projectRefSchema
      },
      annotations: WRITE_ANNOTATIONS
    },
    async (args) =>
      write(() => {
        const record = createWaitingItem(db, {
          title: args.title,
          waiting_for: args.waiting_for,
          since: args.since ?? null,
          notes: args.notes ?? null,
          project_id: args.project_id ?? null,
          project: args.project ?? null
        })
        return { action: 'create', entity: 'waiting_item', id: record.id, record }
      })
  )

  server.registerTool(
    'delete_waiting_item',
    {
      title: 'Delete Waiting-For Item',
      description: 'Delete a waiting-for item permanently.',
      inputSchema: { id: idSchema },
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    async ({ id }) =>
      write(() => {
        const record = deleteWaitingItem(db, id)
        return { action: 'delete', entity: 'waiting_item', id: record.id, record }
      })
  )

  // ── Someday / maybe ────────────────────────────────────────────────────────

  server.registerTool(
    'create_someday_item',
    {
      title: 'Create Someday/Maybe Item',
      description:
        'Park a future idea in the Someday/Maybe view — a thing to do someday, ordered by horizon ' +
        '(soon, 1month, 3months, 1year, someday).',
      inputSchema: {
        title: z.string().min(1).describe('The idea'),
        notes: z.string().optional().describe('Extra context'),
        horizon: z.enum(SOMEDAY_HORIZONS).optional().describe('Time horizon (default: someday)'),
        category: z.string().optional().describe('Free-form category, e.g. "travel"')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async ({ title, notes, horizon, category }) =>
      write(() => {
        const record = createSomedayItem(db, { title, notes, horizon, category })
        return { action: 'create', entity: 'someday_item', id: record.id, record }
      })
  )

  server.registerTool(
    'update_someday_item',
    {
      title: 'Update Someday/Maybe Item',
      description: 'Change a someday/maybe item — title, notes, horizon or category.',
      inputSchema: {
        id: idSchema,
        title: z.string().min(1).optional().describe('New title'),
        notes: z.string().optional().describe('New notes'),
        horizon: z.enum(SOMEDAY_HORIZONS).optional().describe('New horizon'),
        category: z.string().optional().describe('New category')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async (args) =>
      write(() => {
        const record = updateSomedayItem(db, args.id, {
          title: args.title,
          notes: args.notes,
          horizon: args.horizon,
          category: args.category
        })
        return { action: 'update', entity: 'someday_item', id: record.id, record }
      })
  )

  server.registerTool(
    'delete_someday_item',
    {
      title: 'Delete Someday/Maybe Item',
      description: 'Delete a someday/maybe item permanently.',
      inputSchema: { id: idSchema },
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    async ({ id }) =>
      write(() => {
        const record = deleteSomedayItem(db, id)
        return { action: 'delete', entity: 'someday_item', id: record.id, record }
      })
  )

  // ── Habits (打卡) ───────────────────────────────────────────────────────────

  server.registerTool(
    'check_in_habit',
    {
      title: 'Check In Habit (习惯打卡)',
      description:
        'Mark a habit as done for one day — the app\'s 打卡 action. For a simple habit ' +
        '(is_quantitative=0) this ticks the day (completed=1). For a counted habit ' +
        '(is_quantitative=1) this adds exactly ONE count to the day (count + 1), capped at the ' +
        'habit\'s target — once the target is reached another call changes nothing. "date" ' +
        'defaults to today (local time) and accepts YYYY-MM-DD to backfill a missed day. ' +
        'Use list_habits / get_habit to find ids.',
      inputSchema: {
        id: idSchema,
        date: z.string().optional().describe('Day to check in for (YYYY-MM-DD, default: today)'),
        notes: z.string().optional().describe('Optional note stored on the day\'s record')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async ({ id, date, notes }) =>
      write(() => {
        const result = checkInHabit(db, id, { date, notes })
        return {
          action: 'check_in',
          entity: 'habit',
          id,
          effect: result.effect,
          count: result.count,
          target: result.target,
          completed_today: result.completed_today,
          record: result.record,
          habit: result.habit,
          message: result.message
        }
      })
  )

  // ── One-shot capture ───────────────────────────────────────────────────────

  server.registerTool(
    'capture_item',
    {
      title: 'Capture Item (随想 or GTD bucket)',
      description:
        'Capture one thought into the right place — the single tool to reach for when the user ' +
        'says "记一下 …". target decides where it lands: "note" → 随想 (notes table); ' +
        '"inbox"/"next"/"waiting"/"someday" → a task in that GTD bucket; "project" → a new ' +
        'project; "waiting_item" → a delegated item (needs waiting_for); "someday_item" → a ' +
        'someday/maybe idea (needs horizon).',
      inputSchema: {
        content: z.string().min(1).describe('The thought to capture'),
        target: z.enum(CAPTURE_TARGETS).describe('Where the thought should land'),
        tags: z.array(z.string()).optional().describe('Tags (target="note")'),
        weather: z.string().optional().describe('Weather label (target="note")'),
        context: z.string().optional().describe('@context (task targets)'),
        due_date: z.string().optional().describe('Due date / delegation date (YYYY-MM-DD)'),
        priority: z.enum(TASK_PRIORITIES).optional().describe('Priority (task targets)'),
        ...projectRefSchema,
        waiting_for: z
          .string()
          .optional()
          .describe('Who the user is waiting on (target="waiting" / "waiting_item")'),
        since: z
          .string()
          .optional()
          .describe('Delegation date (YYYY-MM-DD, target="waiting_item")'),
        notes: z.string().optional().describe('Extra context'),
        horizon: z.enum(SOMEDAY_HORIZONS).optional().describe('Horizon (target="someday_item")'),
        category: z.string().optional().describe('Category (target="someday_item")')
      },
      annotations: WRITE_ANNOTATIONS
    },
    async (args) =>
      write(() => {
        const result = captureItem(db, {
          content: args.content,
          target: args.target,
          tags: args.tags,
          weather: args.weather,
          context: args.context,
          due_date: args.due_date,
          priority: args.priority,
          project_id: args.project_id,
          project: args.project,
          waiting_for: args.waiting_for,
          notes: args.notes,
          horizon: args.horizon,
          category: args.category,
          since: args.since
        })
        return {
          action: 'capture',
          target: result.target,
          bucket: result.bucket,
          id: result.record.id,
          record: result.record,
          warnings: result.warnings
        }
      })
  )
}
