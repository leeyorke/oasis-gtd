import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { connect } from 'node:net'
import { homedir, networkInterfaces } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

/**
 * Manages the agent-facing MCP HTTP server as a child process of the app.
 *
 * The server itself (mcp/index.ts, bundled to resources/mcp/server.cjs for
 * packaged builds) must run on the SYSTEM Node runtime: it uses Node's built-in
 * `node:sqlite` (Node ≥ 22.5), which Electron's bundled Node (20.x on Electron
 * 29) does not provide. So instead of importing it into the main process we
 * spawn `node <entry> --http` and pipe its logs here.
 *
 * Lifecycle: the app starts the service on launch (after the database is ready)
 * and stops it when the user actually quits (before-quit). The Settings view
 * can toggle it at runtime — the toggle persists in app_settings and takes
 * effect immediately.
 *
 * Two guards keep exactly one endpoint running:
 *   1. A global child handle. electron-vite dev re-evaluates the main entry
 *      module on every rebuild (re-running start() in a fresh module instance
 *      without restarting the process), which would orphan the first child.
 *      `globalThis` survives those reloads, so we can kill the leftover.
 *   2. A port probe before spawning, so a second app instance (or any other
 *      process already on the port) never leads to two listeners fighting over
 *      the same port (Windows lets both bind via SO_REUSEADDR).
 *
 * This module is intentionally free of Electron imports so it can be unit
 * tested under plain Node (see mcp/test/app-spawn.mjs); everything
 * Electron-specific (settings, DB path, entry script) is injected by the
 * caller (src/main/mcp-controller.ts).
 */

export interface McpControllerDeps {
  /** Reads a persisted setting (app_settings). */
  getSetting: (key: string) => string | null
  /** Persists a setting (app_settings). */
  setSetting: (key: string, value: string) => void
  /** The exact database file the app itself uses. */
  dbPath: () => string
  /** Entry script for the child process (mcp/index.ts in dev, server.cjs when packaged). */
  entry: { script: string; cwd: string }
  /** Receives every log line the MCP server writes to stderr. */
  onLog?: (line: string) => void
}

export interface McpServiceState {
  /** User preference — false means "do not run with the app". */
  enabled: boolean
  /** Whether the child process is currently alive. */
  running: boolean
  /** Port the endpoint listens on (or would listen on). */
  port: number
  /** Bearer token agents must send. */
  token: string
  /** Every reachable endpoint URL (loopback + LAN addresses). */
  urls: string[]
  /** The database file being served. */
  dbPath: string
  /** Absolute path of the system node used to spawn the server (null = not found). */
  nodePath: string | null
  /** Last startup failure, if any (missing node, port in use, …). */
  error: string | null
}

export interface McpController {
  /** Spawns the service unless disabled or already running. */
  start: () => Promise<McpServiceState>
  /** Kills the child process if running. */
  stop: () => McpServiceState
  /** Persists the preference and starts/stops the service immediately. */
  setEnabled: (enabled: boolean) => Promise<McpServiceState>
  /** Current state without changing anything. */
  getState: () => McpServiceState
  isRunning: () => boolean
}

export const MCP_HTTP_DEFAULT_PORT = 7800

export const MCP_SETTING_ENABLED = 'mcp_http_enabled'
export const MCP_SETTING_PORT = 'mcp_http_port'
export const MCP_SETTING_TOKEN = 'mcp_http_token'
/** Optional explicit path to the system node executable (see resolveNodeExecutable). */
export const MCP_SETTING_NODE_PATH = 'mcp_http_node_path'

/** Survives electron-vite dev module reloads (globalThis is per-process). */
const GLOBAL_CHILD_KEY = '__oasisGtdMcpHttpChild'

/** Generates the bearer token handed to agents (stored in app_settings). */
export function generateMcpToken(): string {
  return randomBytes(24).toString('base64url')
}

// ─── System Node resolution ──────────────────────────────────────────────────
// The MCP server child needs Node ≥ 22.5 (Electron's bundled Node 20 has no
// node:sqlite), so we spawn the SYSTEM node. `spawn('node', …)` resolves through
// PATH — but a packaged app launched from Explorer/Start Menu does not inherit
// the shell's PATH, and nvm-style installs (this user: nvm4w at D:\software\
// nvm4w) leave GUI processes with a stale PATH. That is the "spawn node ENOENT"
// failure. So resolve an absolute path explicitly:
//   1. app_settings.mcp_http_node_path (explicit override)
//   2. the current process PATH
//   3. the PATH recorded in the registry (fresh even for long-running Explorer
//      sessions that never re-read the environment after node was installed)
//   4. well-known install locations (nodejs.org installer, nvm, fnm, volta,
//      scoop, chocolatey, …)

const isWindows = process.platform === 'win32'
const nodeExeName = isWindows ? 'node.exe' : 'node'

/** All HKCU/HKLM Environment values, for PATH expansion (Windows only). */
function registryEnvironment(): Map<string, string> {
  const values = new Map<string, string>()
  const hives = [
    'HKCU\\Environment',
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
  ]
  // Absolute path, spawned without a shell: a packaged GUI app may have a PATH
  // that resolves neither `reg` nor `cmd`. (Non-ASCII paths are emitted in the
  // console code page and may mangle; such entries simply fail the existsSync
  // probe below, which is fine — node installs are ASCII-named.)
  const regExe = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'reg.exe')
  for (const hive of hives) {
    try {
      const result = spawnSync(regExe, ['query', hive], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true
      })
      if (result.status !== 0 || !result.stdout) continue
      for (const line of result.stdout.split(/\r?\n/)) {
        const match = line.match(/^\s{4}(\S+)\s+REG_\S+\s+(.*)$/)
        if (match) values.set(match[1].toUpperCase(), match[2].trim())
      }
    } catch {
      /* registry unavailable — PATH probing below still applies */
    }
  }
  return values
}

function expandVars(value: string, vars: Map<string, string>): string {
  return value.replace(/%([^%]+)%/g, (_full, name: string) => {
    const key = name.toUpperCase()
    return vars.get(key) ?? process.env[name] ?? process.env[key] ?? `%${name}%`
  })
}

function wellKnownNodeDirs(): string[] {
  const home = homedir()
  const dirs: string[] = []
  const addVersioned = (root: string, ...below: string[]): void => {
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(join(root, entry.name, ...below))
      }
    } catch {
      /* root missing */
    }
  }
  if (isWindows) {
    const programFiles = process.env['ProgramFiles'] ?? join(home, '..', 'Program Files')
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? join(home, '..', 'Program Files (x86)')
    const localAppData = process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local')
    const appData = process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming')
    dirs.push(
      join(programFiles, 'nodejs'),
      join(programFilesX86, 'nodejs'),
      join(localAppData, 'Volta', 'bin'),
      join(appData, 'fnm'),
      join(home, 'scoop', 'apps', 'nodejs', 'current'),
      join(home, 'scoop', 'shims'),
      join('C:', 'ProgramData', 'chocolatey', 'bin')
    )
    addVersioned(join(appData, 'nvm'))
    addVersioned(join(home, 'scoop', 'apps', 'nodejs'))
  } else {
    dirs.push('/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin')
    dirs.push(join(home, '.volta', 'bin'), join(home, '.local', 'bin'))
    addVersioned(join(home, '.nvm', 'versions', 'node'), 'bin')
    addVersioned(join(home, '.fnm', 'node-versions'), 'installation', 'bin')
  }
  return dirs
}

export interface NodeResolution {
  /** Absolute path to the node executable, or null when none was found. */
  path: string | null
  /** For diagnostics: where the path came from. */
  source: string
}

export function resolveNodeExecutable(override?: string | null): NodeResolution {
  if (override && override.trim() !== '') {
    return existsSync(override)
      ? { path: override, source: 'mcp_http_node_path' }
      : { path: null, source: `mcp_http_node_path (${override} does not exist)` }
  }

  const candidates: Array<{ dir: string; source: string }> = []
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    if (dir.trim() !== '') candidates.push({ dir, source: 'PATH' })
  }
  if (isWindows) {
    const vars = registryEnvironment()
    const pathValue = vars.get('PATH')
    if (pathValue) {
      for (const dir of expandVars(pathValue, vars).split(';')) {
        if (dir.trim() !== '') candidates.push({ dir, source: 'registry PATH' })
      }
    }
  }
  for (const dir of wellKnownNodeDirs()) candidates.push({ dir, source: 'known location' })

  for (const { dir, source } of candidates) {
    const exe = basename(dir).toLowerCase() === nodeExeName && existsSync(dir)
      ? dir
      : join(dir, nodeExeName)
    if (existsSync(exe)) return { path: exe, source }
  }
  return { path: null, source: '' }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function endpointUrls(port: number): string[] {
  const hosts = ['127.0.0.1']
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) hosts.push(entry.address)
    }
  }
  return hosts.map((host) => `http://${host}:${port}/mcp`)
}

function resolvePort(deps: McpControllerDeps): number {
  const raw = deps.getSetting(MCP_SETTING_PORT)
  if (!raw) return MCP_HTTP_DEFAULT_PORT
  const port = Number.parseInt(raw, 10)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : MCP_HTTP_DEFAULT_PORT
}

function resolveToken(deps: McpControllerDeps): string {
  const existing = deps.getSetting(MCP_SETTING_TOKEN)
  if (existing && existing.trim() !== '') return existing
  const token = generateMcpToken()
  deps.setSetting(MCP_SETTING_TOKEN, token)
  return token
}

/** The child from a previous module load, if it is still alive. */
function leftoverGlobalChild(): ChildProcess | undefined {
  const previous = (globalThis as Record<string, unknown>)[GLOBAL_CHILD_KEY] as
    | ChildProcess
    | undefined
  if (previous && previous.exitCode === null && previous.signalCode === null) return previous
  return undefined
}

/** True when something already accepts connections on the loopback port. */
function portResponds(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    const finish = (result: boolean): void => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(500)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

export function createMcpController(deps: McpControllerDeps): McpController {
  let child: ChildProcess | null = null
  let error: string | null = null

  const isRunning = (): boolean => child !== null && child.exitCode === null && child.signalCode === null

  const getState = (): McpServiceState => {
    const port = resolvePort(deps)
    const node = resolveNodeExecutable(deps.getSetting(MCP_SETTING_NODE_PATH))
    return {
      enabled: deps.getSetting(MCP_SETTING_ENABLED) !== '0',
      running: isRunning(),
      port,
      token: resolveToken(deps),
      urls: endpointUrls(port),
      dbPath: deps.dbPath(),
      nodePath: node.path,
      error
    }
  }

  const stop = (): McpServiceState => {
    if (child && isRunning()) {
      child.kill()
    }
    child = null
    error = null
    delete (globalThis as Record<string, unknown>)[GLOBAL_CHILD_KEY]
    return getState()
  }

  const start = async (): Promise<McpServiceState> => {
    if (isRunning()) return getState()
    if (deps.getSetting(MCP_SETTING_ENABLED) === '0') return getState()

    const token = resolveToken(deps)
    const port = resolvePort(deps)
    error = null

    // The MCP server needs Node ≥ 22.5, which Electron's own Node (20.x) does
    // not provide — spawn the system node, resolved to an absolute path so it
    // also works when the packaged app is launched without a shell PATH.
    const node = resolveNodeExecutable(deps.getSetting(MCP_SETTING_NODE_PATH))
    if (!node.path) {
      error =
        `Node.js >= 22.5 was not found (searched PATH, the registry and common install ` +
        `locations). Install Node.js, or pin the executable in app_settings.${MCP_SETTING_NODE_PATH}.`
      deps.onLog?.(`[MCP] ${error}`)
      return getState()
    }
    if (node.source !== 'PATH') {
      deps.onLog?.(`[MCP] node runtime: ${node.path} (found via ${node.source})`)
    }

    // Guard 1: a main-process reload (electron-vite dev) re-runs start() with
    // fresh module state; the previous child is only reachable via globalThis.
    const leftover = leftoverGlobalChild()
    if (leftover) {
      deps.onLog?.('[MCP] stopping endpoint left over from a main-process reload')
      leftover.kill()
      delete (globalThis as Record<string, unknown>)[GLOBAL_CHILD_KEY]
      await sleep(300) // let the OS release the listening socket
    }

    // Guard 2: never double-bind — another app instance or process may own it.
    if (await portResponds(port)) {
      error = `port ${port} is already in use by another process; not starting a second endpoint`
      deps.onLog?.(`[MCP] ${error}`)
      return getState()
    }

    const spawned = spawn(node.path, [deps.entry.script, '--http'], {
      cwd: deps.entry.cwd,
      env: {
        ...process.env,
        OASIS_DB_PATH: deps.dbPath(),
        OASIS_MCP_TOKEN: token,
        OASIS_MCP_PORT: String(port),
        // LAN-accessible by design; the bearer token is the access control.
        OASIS_MCP_HOST: '0.0.0.0'
      },
      // stdout is unused in HTTP mode; the server logs to stderr.
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true
    })

    let stderrTail = ''
    spawned.stderr?.setEncoding('utf8')
    spawned.stderr?.on('data', (chunk: string | Buffer) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim() !== '') deps.onLog?.(line.trim())
      }
      stderrTail += String(chunk)
      if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000)
    })
    spawned.on('error', (err: Error) => {
      error = `failed to start: ${err.message} (is Node.js installed and on PATH?)`
      if (child === spawned) child = null
    })
    spawned.on('exit', (code: number | null) => {
      if (child === spawned) child = null
      if ((globalThis as Record<string, unknown>)[GLOBAL_CHILD_KEY] === spawned) {
        delete (globalThis as Record<string, unknown>)[GLOBAL_CHILD_KEY]
      }
      if (code !== 0 && code !== null) {
        error =
          `exited with code ${code} (port ${port} in use, or Node.js missing). ` +
          `Last output: ${stderrTail.split(/\r?\n/).filter(Boolean).slice(-3).join(' | ').slice(0, 300)}`
      }
    })

    child = spawned
    ;(globalThis as Record<string, unknown>)[GLOBAL_CHILD_KEY] = spawned
    deps.onLog?.(
      `[MCP] agent HTTP endpoint: http://<this-machine>:${port}/mcp  token: ${token} ` +
        '(disable in Settings → MCP, or set app_settings.mcp_http_enabled=0)'
    )
    return getState()
  }

  const setEnabled = async (enabled: boolean): Promise<McpServiceState> => {
    deps.setSetting(MCP_SETTING_ENABLED, enabled ? '1' : '0')
    return enabled ? start() : stop()
  }

  return { start, stop, setEnabled, getState, isRunning }
}
