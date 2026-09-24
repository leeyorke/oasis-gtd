#!/usr/bin/env node
/**
 * Oasis GTD MCP server entry point.
 *
 * Transports:
 *   stdio (default) — the MCP client spawns this process and speaks JSON-RPC
 *                     over stdin/stdout (`node mcp/index.ts`).
 *   http            — exposes the MCP Streamable HTTP endpoint on the network
 *                     (`node mcp/index.ts --http`), bearer-token protected.
 *
 * Runs directly on Node with built-in TypeScript type stripping — no build
 * step required. Requires Node.js >= 22.18 (or Node 22.6+ launched with
 * `node --experimental-strip-types`).
 *
 * Configuration (environment variables):
 *   OASIS_DB_PATH        Explicit path to the oasis-gtd SQLite database file.
 *   OASIS_PROFILE        Force the "dev" or "packaged" database when both exist.
 *   OASIS_MCP_TRANSPORT  "stdio" (default) or "http" (same as --http).
 *   OASIS_MCP_TOKEN      Bearer token for HTTP mode (required for --http).
 *   OASIS_MCP_HOST       HTTP bind address (default 0.0.0.0 — LAN accessible).
 *   OASIS_MCP_PORT       HTTP port (default 7800).
 *
 * IMPORTANT: in stdio mode stdout is the MCP protocol channel — all logging
 * must go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { openDatabase } from './db.ts'
import { createServer } from './server.ts'
import { startHttpServer } from './http-server.ts'

const DEFAULT_HTTP_PORT = 7800

function resolveHttpPort(): number {
  const raw = process.env['OASIS_MCP_PORT']
  if (!raw) return DEFAULT_HTTP_PORT
  const port = Number.parseInt(raw, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`OASIS_MCP_PORT must be an integer between 1 and 65535 (got: ${raw})`)
  }
  return port
}

async function main(): Promise<void> {
  const { db, info } = openDatabase()
  const dbLog =
    `[oasis-gtd-mcp] serving ${info.path} ` +
    `(profile=${info.profile}, mode=${info.openMode}, schema=v${info.schemaVersion})`

  const httpMode =
    process.argv.slice(2).includes('--http') ||
    (process.env['OASIS_MCP_TRANSPORT'] ?? '').toLowerCase() === 'http'

  if (httpMode) {
    const token = process.env['OASIS_MCP_TOKEN']
    if (!token || token.trim() === '') {
      throw new Error(
        'HTTP mode requires OASIS_MCP_TOKEN (bearer token clients must send). ' +
        'Example: set OASIS_MCP_TOKEN=my-secret-token'
      )
    }
    const port = resolveHttpPort()
    const host = process.env['OASIS_MCP_HOST'] ?? '0.0.0.0'
    console.error(dbLog)
    const running = await startHttpServer(db, info, { token, host, port })
    const shutdown = async (): Promise<void> => {
      await running.close()
      process.exit(0)
    }
    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
    return
  }

  const server = createServer(db, info)
  await server.connect(new StdioServerTransport())
  console.error(dbLog)
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(`[oasis-gtd-mcp] fatal: ${detail}`)
  process.exit(1)
})
