/**
 * Resolves and opens the Oasis GTD SQLite database.
 *
 * The desktop app stores all of its data in the Electron userData directory:
 *
 *   Windows: %APPDATA%\<userData>\oasis-gtd[-dev].db
 *   macOS:   ~/Library/Application Support/<userData>/oasis-gtd[-dev].db
 *   Linux:   ~/.config/<userData>/oasis-gtd[-dev].db
 *
 * `<userData>` is `oasis-gtd` in development (package.json `name`) and
 * `Oasis GTD` in packaged builds (electron-builder `productName`). The file
 * suffix is `-dev` when running `electron-vite dev` and absent for packaged
 * builds — see `initDatabase()` in src/main/db/database.ts.
 *
 * The app runs SQLite in WAL mode, so external readers can safely read the
 * database file while the app is running; no IPC into the Electron process
 * is required and the running app is never blocked or disturbed.
 *
 * The same WAL mode also lets a second process WRITE while the app is running:
 * SQLite serialises writers, `busy_timeout` makes the MCP server wait for the
 * app's short transactions instead of failing. Writes are only possible when
 * the server was started in write mode (see `resolveWritePolicy`).
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type DbProfile = 'dev' | 'packaged' | 'explicit'
export type OpenMode = 'read-only' | 'read-write'

export interface DbInfo {
  /** Absolute path of the SQLite file being served. */
  path: string
  /** Which app build owns the database. */
  profile: DbProfile
  /** How the file was opened. `read-only` is always attempted first. */
  openMode: OpenMode
  /** Value of `_schema_version` in app_settings (0 when unknown). */
  schemaVersion: number
  /** Size of the main database file in bytes. */
  sizeBytes: number
}

/** Transport the server was started with — decides the default write policy. */
export type Transport = 'stdio' | 'http'

/**
 * Whether the write tools may modify the database, and why.
 *
 * The policy is resolved once at startup and never changes while the server
 * runs, so a client cannot flip it mid-session.
 */
export interface WritePolicy {
  /** True when write tools are allowed to change data. */
  enabled: boolean
  /** Why writes are disabled (null when they are enabled). */
  reason: string | null
  /** Where the decision came from — shown in the server log and instructions. */
  source: string
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const FALSY = new Set(['0', 'false', 'no', 'off', 'disabled'])

/**
 * Resolves the write policy.
 *
 * `OASIS_MCP_WRITE` wins whenever it is set:
 *   1 / true / yes / on   → writes allowed
 *   0 / false / no / off  → writes refused
 *
 * Without the variable the transport decides:
 *   stdio — a local agent on this machine (`.mcp.json`): writes allowed.
 *   http  — a network endpoint other machines can reach: writes refused
 *           unless the operator opts in explicitly (the desktop app passes
 *           OASIS_MCP_WRITE=1 when the user enables writes in Settings).
 */
export function resolveWritePolicy(
  transport: Transport,
  env: Record<string, string | undefined> = process.env
): WritePolicy {
  const raw = (env['OASIS_MCP_WRITE'] ?? '').trim().toLowerCase()
  if (raw !== '') {
    if (TRUTHY.has(raw)) {
      return { enabled: true, reason: null, source: 'OASIS_MCP_WRITE' }
    }
    if (FALSY.has(raw)) {
      return {
        enabled: false,
        reason:
          'Write operations are disabled for this server (OASIS_MCP_WRITE is set to a falsy value).',
        source: 'OASIS_MCP_WRITE'
      }
    }
    return {
      enabled: false,
      reason: `OASIS_MCP_WRITE has an invalid value "${raw}" — expected one of 1/0, true/false, yes/no, on/off.`,
      source: 'OASIS_MCP_WRITE'
    }
  }
  if (transport === 'stdio') {
    return { enabled: true, reason: null, source: 'default (stdio transport)' }
  }
  return {
    enabled: false,
    reason:
      'Write operations are disabled for the HTTP transport. Set OASIS_MCP_WRITE=1 for the ' +
      'server process, or enable "Allow writes" in the desktop app (Settings → MCP).',
    source: 'default (http transport)'
  }
}

export interface DbCandidate {
  path: string
  profile: DbProfile
}

/** userData directory names used by the app (dev build, then packaged build). */
const USER_DATA_DIR_NAMES = ['oasis-gtd', 'Oasis GTD'] as const

/** Database file names used by the app (packaged, then dev). */
const DB_FILE_NAMES = ['oasis-gtd.db', 'oasis-gtd-dev.db'] as const

/** Tables that must exist for a file to be recognised as a GTD database. */
const GTD_TABLES = ['tasks', 'projects', 'waiting_items', 'someday_items'] as const

/** Every table the app owns (used for row-count reporting). */
export const APP_TABLES = [
  'tasks',
  'projects',
  'waiting_items',
  'someday_items',
  'review_checklist',
  'chat_conversations',
  'chat_messages',
  'app_settings',
  'notes',
  'habits',
  'habit_records',
  'resources',
  'focus_sessions'
] as const

function userDataRoots(): string[] {
  if (process.platform === 'win32') {
    return [process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming')]
  }
  if (process.platform === 'darwin') {
    return [join(homedir(), 'Library', 'Application Support')]
  }
  return [process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')]
}

function profileOf(fileName: string): DbProfile {
  return fileName.endsWith('-dev.db') ? 'dev' : 'packaged'
}

/** Newest mtime across the database file and its WAL sidecars. */
function activityMtimeMs(file: string): number {
  let newest = 0
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      newest = Math.max(newest, statSync(file + suffix).mtimeMs)
    } catch {
      /* sidecar missing — ignore */
    }
  }
  return newest
}

/**
 * All existing Oasis GTD database files, most recently active first. A running
 * app keeps appending to its `-wal` file, so the live profile naturally sorts
 * to the top when both a dev and a packaged database exist.
 */
export function candidateDbPaths(): DbCandidate[] {
  const found: DbCandidate[] = []
  for (const root of userDataRoots()) {
    for (const dirName of USER_DATA_DIR_NAMES) {
      for (const fileName of DB_FILE_NAMES) {
        const filePath = join(root, dirName, fileName)
        if (existsSync(filePath)) {
          found.push({ path: filePath, profile: profileOf(fileName) })
        }
      }
    }
  }
  found.sort((a, b) => activityMtimeMs(b.path) - activityMtimeMs(a.path))
  return found
}

function resolveCandidate(): DbCandidate {
  const explicit = process.env['OASIS_DB_PATH']
  if (explicit && explicit.trim() !== '') {
    if (!existsSync(explicit)) {
      throw new Error(`OASIS_DB_PATH is set but the file does not exist: ${explicit}`)
    }
    return { path: explicit, profile: 'explicit' }
  }

  const profileFilter = process.env['OASIS_PROFILE']
  if (profileFilter && profileFilter !== 'dev' && profileFilter !== 'packaged') {
    throw new Error(`OASIS_PROFILE must be "dev" or "packaged" (got: ${profileFilter})`)
  }

  const candidates = candidateDbPaths().filter(
    (candidate) => !profileFilter || candidate.profile === profileFilter
  )
  if (candidates.length === 0) {
    const searched: string[] = []
    for (const root of userDataRoots()) {
      for (const dirName of USER_DATA_DIR_NAMES) {
        for (const fileName of DB_FILE_NAMES) {
          searched.push(join(root, dirName, fileName))
        }
      }
    }
    throw new Error(
      'Could not find an Oasis GTD database. Searched:\n' +
        searched.map((p) => `  ${p}`).join('\n') +
        '\nHas the app been installed and launched at least once? ' +
        'Set OASIS_DB_PATH to point at the database file explicitly.'
    )
  }
  return candidates[0]
}

function isGtdDatabase(db: DatabaseSync): boolean {
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    const names = new Set(rows.map((row) => row.name))
    return GTD_TABLES.every((table) => names.has(table))
  } catch {
    return false
  }
}

function readSchemaVersion(db: DatabaseSync): number {
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = '_schema_version'")
      .get() as { value?: string } | undefined
    return row?.value ? Number.parseInt(row.value, 10) || 0 : 0
  } catch {
    return 0
  }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Opens the resolved database.
 *
 * Read-only is attempted first (the preferred, safe mode); a read-write handle
 * is only used as a fallback for files whose WAL sidecars prevent a read-only
 * open — and even then every read statement this server runs is a SELECT (see
 * assertReadOnly below).
 *
 * With `allowWrite: true` the file is opened read-write from the start, which
 * is what the write tools need. The connection is then tuned for safe
 * concurrent use with the running desktop app:
 *   - `busy_timeout`  — wait for the app's short write transactions instead of
 *                       failing with SQLITE_BUSY.
 *   - `journal_mode`  — WAL, so the app can keep reading while we write.
 *   - `foreign_keys`  — ON, so a task can never reference a missing project.
 */
export function openDatabase(options: { allowWrite?: boolean } = {}): { db: DatabaseSync; info: DbInfo } {
  const candidate = resolveCandidate()
  const allowWrite = options.allowWrite === true
  const attempts: Array<{ mode: OpenMode; open: () => DatabaseSync }> = allowWrite
    ? [{ mode: 'read-write', open: () => new DatabaseSync(candidate.path) }]
    : [
        { mode: 'read-only', open: () => new DatabaseSync(candidate.path, { readOnly: true }) },
        { mode: 'read-write', open: () => new DatabaseSync(candidate.path) }
      ]

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const db = attempt.open()
      try {
        db.exec('PRAGMA busy_timeout = 5000')
      } catch {
        /* some connections refuse pragmas — not fatal */
      }
      if (allowWrite) {
        // WAL keeps the desktop app readable while this process writes.
        try {
          db.prepare('PRAGMA journal_mode = WAL').get()
        } catch {
          /* another process may hold the file — WAL is the app default anyway */
        }
        try {
          db.exec('PRAGMA foreign_keys = ON')
        } catch {
          /* not fatal: writes still validate their references explicitly */
        }
      }
      if (!isGtdDatabase(db)) {
        db.close()
        throw new Error('file is not an Oasis GTD database (GTD tables are missing)')
      }
      return {
        db,
        info: {
          path: candidate.path,
          profile: candidate.profile,
          openMode: attempt.mode,
          schemaVersion: readSchemaVersion(db),
          sizeBytes: statSync(candidate.path).size
        }
      }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `Failed to open database at ${candidate.path}: ${describeError(lastError)}`
  )
}

// ─── Read-only query helpers ────────────────────────────────────────────────
// Defence in depth: this server must never mutate the user's data, so every
// statement served to clients is validated to be a plain SELECT (or a benign
// informational PRAGMA) before it reaches SQLite.

const SAFE_PRAGMA = /^pragma\s+(busy_timeout|table_info|database_list|quick_check)\b/i

function assertReadOnly(sql: string): void {
  const body = sql.replace(/--[^\n]*/g, ' ').trim()
  if (body.includes(';')) {
    throw new Error('multiple SQL statements are not allowed')
  }
  const lowered = body.toLowerCase()
  if (lowered.startsWith('select') || lowered.startsWith('with')) return
  if (SAFE_PRAGMA.test(body)) return
  throw new Error(`Refusing non-read-only statement: ${body.slice(0, 80)}`)
}

export function queryAll<T = Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = []
): T[] {
  assertReadOnly(sql)
  return db.prepare(sql).all(...params) as T[]
}

export function queryOne<T = Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = []
): T | undefined {
  assertReadOnly(sql)
  return db.prepare(sql).get(...params) as T | undefined
}

// ─── Write helpers ───────────────────────────────────────────────────────────
//
// The write tools in write.ts build every statement with bound parameters, so
// no user-supplied value is ever concatenated into SQL. The helpers below are
// the ONLY way this server mutates data; they do not re-validate the SQL
// (that is write.ts's job) but they do guarantee the write happens inside a
// transaction so a failed step never leaves half a change behind.

/** Runs one INSERT/UPDATE/DELETE with bound parameters. */
export function runStatement(db: DatabaseSync, sql: string, params: unknown[] = []): void {
  db.prepare(sql).run(...params)
}

/**
 * Runs `fn` inside an IMMEDIATE transaction.
 *
 * IMMEDIATE takes the write lock up front, so a concurrent writer (the running
 * desktop app) can never interleave with ours and produce a half-applied
 * change.
 */
export function transact<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* the transaction was already rolled back by SQLite */
    }
    throw error
  }
}

/** Row counts for every table the app owns. */
export function tableRowCounts(db: DatabaseSync): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const table of APP_TABLES) {
    try {
      const row = queryOne<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "${table}"`)
      counts[table] = row?.n ?? 0
    } catch {
      counts[table] = -1
    }
  }
  return counts
}
