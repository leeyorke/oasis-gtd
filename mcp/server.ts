/**
 * Assembles the MCP server: identity, agent instructions, tools and resources.
 */
import type { DatabaseSync } from 'node:sqlite'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbInfo } from './db.ts'
import { registerTools } from './tools.ts'
import { registerResources } from './resources.ts'

const SERVER_NAME = 'oasis-gtd'
const SERVER_VERSION = '1.0.0'

const INSTRUCTIONS = `Oasis GTD is the user's personal GTD (Getting Things Done) system. This MCP server exposes that data READ-ONLY.

Data model (SQLite tables served directly):
- tasks: GTD actions. status is one of inbox (unprocessed capture), next (next action), waiting (delegated/blocked), someday, done. priority high/medium/low. context is an @context like @Computer. project_id links to projects. due_date is an ISO date.
- projects: outcomes being worked on; status active or on-hold.
- waiting_items: things delegated to other people; waiting_for is the person, since is when delegation started.
- someday_items: future ideas; horizon is soon/1month/3months/1year/someday.
- notes: quick captured thoughts.
- habits + habit_records: habit tracking (record_date is YYYY-MM-DD).
- chat_conversations + chat_messages: the user's AI chat history from the app's built-in assistant.
- resources: reference material (documents, links, ...).
- review_checklist: the weekly review checklist.
- ai_providers (API keys) and app_settings (configuration) are intentionally NOT exposed.

Guidance:
- Call get_overview first to see counts and attention items, then drill in with list_tasks / search_tasks / get_project etc.
- Reads hit the live SQLite file (WAL mode), so data written by the running desktop app is visible immediately; nothing is cached or mutated by this server.
- Nothing here can create, update or delete data — the server only runs SELECT statements.`

export function createServer(db: DatabaseSync, info: DbInfo): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS }
  )
  registerTools(server, db, info)
  registerResources(server, db, info)
  return server}
