/**
 * Assembles the MCP server: identity, agent instructions, tools and resources.
 */
import type { DatabaseSync } from 'node:sqlite'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbInfo, WritePolicy } from './db.ts'
import { registerTools } from './tools.ts'
import { registerResources } from './resources.ts'

const SERVER_NAME = 'oasis-gtd'
const SERVER_VERSION = '1.1.0'

const DATA_MODEL = `Data model (SQLite tables served directly):
- tasks: GTD actions. status is one of inbox (unprocessed capture), next (next action), waiting (delegated/blocked), someday, done, archive. priority high/medium/low. context is an @context like @Computer. project_id links to projects. due_date is an ISO date.
- projects: outcomes being worked on; status active or on-hold.
- waiting_items: things delegated to other people; waiting_for is the person, since is when delegation started.
- someday_items: future ideas; horizon is soon/1month/3months/1year/someday.
- notes: quick captured thoughts — this is the 随想 view.
- habits + habit_records: habit tracking (record_date is YYYY-MM-DD).
- chat_conversations + chat_messages: the user's AI chat history from the app's built-in assistant.
- resources: reference material (documents, links, ...).
- review_checklist: the weekly review checklist.
- ai_providers (API keys) and app_settings (configuration) are intentionally NOT exposed and can never be written.`

/** The instructions handed to the agent on `initialize`. */
function buildInstructions(policy: WritePolicy): string {
  const writing = policy.enabled
    ? `Writing (ENABLED on this server):
- Capture a thought: capture_item with target="note" (随想) or target="inbox"/"next"/"waiting"/"someday" (a task in that GTD bucket), "project", "waiting_item" or "someday_item".
- Fine-grained tools exist too: create_note / update_note / delete_note, create_task / update_task / delete_task, create_project / update_project / delete_project, create_waiting_item / delete_waiting_item, create_someday_item / update_someday_item / delete_someday_item.
- create_task and capture_item accept a project by id (project_id) or by title (project) — the title is matched case-insensitively and must be unambiguous.
- Updates are partial: only the fields you pass are changed. Deletes are permanent, so confirm with the user first.
- Writes go straight into the app's SQLite file; the desktop app picks them up on its next refresh.`
    : `Writing (DISABLED on this server):
- The read tools work, but nothing can be created, changed or deleted.
- ${policy.reason ?? 'Write operations are disabled for this server.'}`

  return `Oasis GTD is the user's personal GTD (Getting Things Done) system. This MCP server exposes that data.

${DATA_MODEL}

Guidance:
- Call get_overview first to see counts and attention items, then drill in with list_tasks / search_tasks / get_project etc.
- Reads hit the live SQLite file (WAL mode), so data written by the running desktop app is visible immediately; nothing is cached or mutated by the read tools.

${writing}`
}

export function createServer(
  db: DatabaseSync,
  info: DbInfo,
  writePolicy: WritePolicy
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: buildInstructions(writePolicy) }
  )
  registerTools(server, db, info, writePolicy)
  registerResources(server, db, info)
  return server
}
