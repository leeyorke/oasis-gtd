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

export const mcpController: McpController = createMcpController({
  getSetting: (key) => settingsQueries.get(key),
  setSetting: (key, value) => settingsQueries.set(key, value),
  dbPath: () => dataQueries.getDbPath(),
  entryScript,
  defaultPort: is.dev ? MCP_HTTP_DEFAULT_PORT_DEV : MCP_HTTP_DEFAULT_PORT,
  onLog: (line) => console.log(line)
})
