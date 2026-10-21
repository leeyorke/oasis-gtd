import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { settingsQueries, dataQueries } from './db/database'
import {
  createMcpController,
  MCP_HTTP_DEFAULT_PORT,
  MCP_HTTP_DEFAULT_PORT_DEV,
  type McpController
} from './mcp-http'

/**
 * The single MCP controller instance shared by the app lifecycle
 * (src/main/index.ts) and the IPC handlers (src/main/ipc/handlers.ts).
 *
 * The child entry point is resolved here because it depends on Electron
 * packaging (dev source vs. bundled extraResources artifact):
 *   dev       → <repo>/mcp/index.ts        (TypeScript, run via node type stripping)
 *   packaged  → <resources>/mcp/server.cjs (esbuild bundle from scripts/build-mcp.mjs)
 *
 * Dev instances use port 7801 (packaged keep 7800) so a dev app and an
 * installed build can run side by side without fighting over the port.
 */
const entryScript = is.dev
  ? join(__dirname, '../../mcp/index.ts')
  : join(process.resourcesPath, 'mcp', 'server.cjs')

/**
 * Where the app's better-sqlite3 build lives.
 *
 * The MCP server needs a SQLite driver. Node's built-in `node:sqlite` only
 * exists from Node 22.5, so when the endpoint runs on the app's own runtime
 * (Electron's Node 20 — the fallback for machines without a system Node.js)
 * the server uses this module instead. Plain node cannot read inside app.asar,
 * hence the unpacked copy in a packaged build.
 */
const sqliteModulePath = is.dev
  ? join(__dirname, '../../node_modules/better-sqlite3')
  : join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3')

export const mcpController: McpController = createMcpController({
  getSetting: (key) => settingsQueries.get(key),
  setSetting: (key, value) => settingsQueries.set(key, value),
  dbPath: () => dataQueries.getDbPath(),
  entryScript,
  sqliteModulePath,
  defaultPort: is.dev ? MCP_HTTP_DEFAULT_PORT_DEV : MCP_HTTP_DEFAULT_PORT,
  onLog: (line) => console.log(line)
})
