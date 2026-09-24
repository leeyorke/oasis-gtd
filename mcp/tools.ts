/**
 * MCP tools exposing the Oasis GTD database to agents.
 *
 * Every tool is strictly read-only: the handlers only ever run SELECT
 * statements (see db.ts) and the tool metadata advertises readOnlyHint so
 * well-behaved clients know the data cannot be modified.
 */
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { DbInfo } from './db.ts'
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
  getHabit,
  getOverview,
  getProject,
  getReviewChecklist,
  getTask,
  listConversations,
  listHabits,
  listNotes,
  listProjects,
  listResources,
  listSomedayItems,
  listTasks,
  listWaitingItems,
  searchNotes
} from './data.ts'

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
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

export function registerTools(server: McpServer, db: DatabaseSync, info: DbInfo): void {
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
        'Which database file is being served (path, dev vs packaged profile, read-only mode, schema ' +
        'version, size) and the row count of every table. Useful for debugging agent setups.',
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
}
