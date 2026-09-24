import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { settingsQueries, dataQueries } from './db/database'
import { createMcpController, type McpController } from './mcp-http'

/**
 * The single MCP controller instance shared by the app lifecycle
 * (src/main/index.ts) and the IPC handlers (src/main/ipc/handlers.ts).
 *
 * The child entry point is resolved here because it depends on Electron
 * packaging (dev source vs. bundled extraResources artifact):
 *   dev       → <repo>/mcp/index.ts        (TypeScript, run via node type stripping)
 *   packaged  → <resources>/mcp/server.cjs (esbuild bundle from scripts/build-mcp.mjs)
 */
const entryScript = is.dev
  ? join(__dirname, '../../mcp/index.ts')
  : join(process.resourcesPath, 'mcp', 'server.cjs')

export const mcpController: McpController = createMcpController({
  getSetting: (key) => settingsQueries.get(key),
  setSetting: (key, value) => settingsQueries.set(key, value),
  dbPath: () => dataQueries.getDbPath(),
  entryScript,
  onLog: (line) => console.log(line)
})
