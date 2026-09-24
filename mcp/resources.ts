/**
 * MCP resources exposing the Oasis GTD database as readable URIs.
 *
 * Static resources (gtd://overview, gtd://tasks, …) are listed directly;
 * templated resources (gtd://tasks/{status}, gtd://projects/{id}, …) enumerate
 * their concrete instances through the template `list` callback so clients can
 * discover them.
 */
import type { DatabaseSync } from 'node:sqlite'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import {
  TASK_STATUSES,
  getConversation,
  getOverview,
  getProject,
  getReviewChecklist,
  listConversations,
  listHabits,
  listNotes,
  listProjects,
  listResources,
  listSomedayItems,
  listTasks,
  listWaitingItems
} from './data.ts'
import type { DbInfo } from './db.ts'

function jsonResource(uri: string, data: unknown): ReadResourceResult {
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }]
  }
}

function plainResource(uri: string, text: string): ReadResourceResult {
  return { contents: [{ uri, mimeType: 'text/plain', text }] }
}

export function registerResources(server: McpServer, db: DatabaseSync, info: DbInfo): void {
  // ── Static resources ───────────────────────────────────────────────────────

  server.registerResource(
    'gtd-overview',
    'gtd://overview',
    {
      title: 'GTD Overview',
      description:
        'Live overview of the GTD system: counts per task status, projects, waiting-for, someday, ' +
        'habits, conversations, attention items (overdue, due today, inbox, stale waiting) and database info.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, getOverview(db, info))
  )

  server.registerResource(
    'gtd-tasks',
    'gtd://tasks',
    {
      title: 'Tasks',
      description: 'Open GTD tasks (inbox, next, waiting, someday) with project titles.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, listTasks(db, { exclude_done: true, limit: 200 }))
  )

  server.registerResource(
    'gtd-projects',
    'gtd://projects',
    {
      title: 'Projects',
      description: 'All projects with open/total task counts; active projects first.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { projects: listProjects(db) })
  )

  server.registerResource(
    'gtd-waiting-items',
    'gtd://waiting-items',
    {
      title: 'Waiting-For Items',
      description: 'Delegated/blocked items the user is waiting on, oldest first.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { waiting_items: listWaitingItems(db) })
  )

  server.registerResource(
    'gtd-someday-items',
    'gtd://someday-items',
    {
      title: 'Someday/Maybe Items',
      description: 'Future ideas grouped by time horizon (soon → someday).',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { someday_items: listSomedayItems(db) })
  )

  server.registerResource(
    'gtd-notes',
    'gtd://notes',
    {
      title: 'Notes',
      description: 'Quick notes/thoughts, newest first.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { notes: listNotes(db) })
  )

  server.registerResource(
    'gtd-habits',
    'gtd://habits',
    {
      title: 'Habits',
      description: 'Active habits with today\'s check-in counts and all-time sessions.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { habits: listHabits(db) })
  )

  server.registerResource(
    'gtd-resources',
    'gtd://resources',
    {
      title: 'Reference Resources',
      description: 'Reference material (documents, links, spreadsheets, images, collections).',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { resources: listResources(db) })
  )

  server.registerResource(
    'gtd-conversations',
    'gtd://conversations',
    {
      title: 'AI Conversations',
      description: 'AI chat conversation list with message counts (most recent first).',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { conversations: listConversations(db) })
  )

  server.registerResource(
    'gtd-review-checklist',
    'gtd://review-checklist',
    {
      title: 'Weekly Review Checklist',
      description: 'Weekly review checklist items with completion state.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, { review_checklist: getReviewChecklist(db) })
  )

  // ── Templated resources ────────────────────────────────────────────────────

  server.registerResource(
    'gtd-tasks-by-status',
    new ResourceTemplate('gtd://tasks/{status}', {
      list: async () => ({
        resources: TASK_STATUSES.map((status) => ({
          uri: `gtd://tasks/${status}`,
          name: `Tasks — ${status}`,
          description: `Tasks with status "${status}"`,
          mimeType: 'application/json'
        }))
      }),
      complete: {
        status: async (value) => TASK_STATUSES.filter((status) => status.startsWith(value))
      }
    }),
    {
      title: 'Tasks by Status',
      description: 'Tasks filtered to one status: inbox, next, waiting, someday or done.',
      mimeType: 'application/json'
    },
    async (uri, variables) => {
      const status = String(variables.status)
      if (!(TASK_STATUSES as readonly string[]).includes(status)) {
        return plainResource(
          uri.href,
          `Unknown task status "${status}". Expected one of: ${TASK_STATUSES.join(', ')}`
        )
      }
      return jsonResource(uri.href, listTasks(db, { status: status as (typeof TASK_STATUSES)[number] }))
    }
  )

  server.registerResource(
    'gtd-project-detail',
    new ResourceTemplate('gtd://projects/{id}', {
      list: async () => ({
        resources: listProjects(db, 'active').map((project) => ({
          uri: `gtd://projects/${project.id}`,
          name: project.title,
          description: `${project.open_task_count} open task(s)`,
          mimeType: 'application/json'
        }))
      })
    }),
    {
      title: 'Project Detail',
      description: 'One project with its tasks and waiting-for items. Use gtd://projects to list ids.',
      mimeType: 'application/json'
    },
    async (uri, variables) => {
      const id = String(variables.id)
      const detail = getProject(db, id)
      if (!detail) {
        return plainResource(uri.href, `No project with id ${id}. List ids via gtd://projects.`)
      }
      return jsonResource(uri.href, detail)
    }
  )

  server.registerResource(
    'gtd-conversation-detail',
    new ResourceTemplate('gtd://conversations/{id}', {
      list: async () => ({
        resources: listConversations(db).map((conversation) => ({
          uri: `gtd://conversations/${conversation.id}`,
          name: conversation.title,
          description: `${conversation.message_count} message(s)`,
          mimeType: 'application/json'
        }))
      })
    }),
    {
      title: 'Conversation Detail',
      description: 'One AI chat conversation with all of its messages.',
      mimeType: 'application/json'
    },
    async (uri, variables) => {
      const id = String(variables.id)
      const detail = getConversation(db, id)
      if (!detail) {
        return plainResource(uri.href, `No conversation with id ${id}. List ids via gtd://conversations.`)
      }
      return jsonResource(uri.href, detail)
    }
  )
}
