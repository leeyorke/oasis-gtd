/**
 * SQLite driver for the MCP server.
 *
 * Two drivers are supported, and the server picks the first one that works:
 *
 *   node:sqlite    — Node's built-in module (Node >= 22.5). Preferred: no
 *                    native addon, nothing to ship.
 *   better-sqlite3 — the native module the desktop app already ships. Used
 *                    when the server runs on Electron's own runtime (Node 20,
 *                    no node:sqlite), which is how the app runs the endpoint
 *                    on machines that have no system Node.js installed. The app
 *                    points at its unpacked copy through OASIS_SQLITE_MODULE.
 *
 * Both drivers expose the same tiny surface, so nothing above this file has
 * to know which one is in use.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

export interface SqliteStatement {
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement
  exec(sql: string): void
  close(): void
}

/**
 * The historic name of the database handle. The rest of the server imports the
 * type under this name, so it stays available here.
 */
export type DatabaseSync = SqliteDatabase

export type SqliteDriverName = 'node:sqlite' | 'better-sqlite3'

/**
 * require() that works in both entry shapes: the ESM source (run by node with
 * type stripping) and the CJS bundle esbuild produces for packaged builds.
 */
const requireFn: NodeRequire =
  typeof require === 'function'
    ? require
    : createRequire(join(process.argv[1] ?? process.cwd(), 'oasis-mcp-loader.js'))

/** SQLite refuses booleans and undefined — normalise them before binding. */
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((param) => {
    if (typeof param === 'boolean') return param ? 1 : 0
    if (param === undefined) return null
    return param
  })
}

interface RawStatement {
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
  run(...params: unknown[]): unknown
}

function wrapStatement(statement: RawStatement): SqliteStatement {
  return {
    all: (...params) => statement.all(...normalizeParams(params)),
    get: (...params) => statement.get(...normalizeParams(params)),
    run: (...params) =>
      statement.run(...normalizeParams(params)) as {
        changes: number | bigint
        lastInsertRowid: number | bigint
      }
  }
}

// ─── node:sqlite ─────────────────────────────────────────────────────────────

let nodeSqlite: { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => RawDatabase } | null = null
let nodeSqliteProbed = false

function loadNodeSqlite(): typeof nodeSqlite {
  if (!nodeSqliteProbed) {
    nodeSqliteProbed = true
    try {
      nodeSqlite = requireFn('node:sqlite') as typeof nodeSqlite
    } catch {
      // Node < 22.5 (or a build without the module) — the fallback takes over.
      nodeSqlite = null
    }
  }
  return nodeSqlite
}

interface RawDatabase {
  prepare(sql: string): RawStatement
  exec(sql: string): void
  close(): void
}

function openNodeSqlite(path: string, readOnly: boolean): SqliteDatabase {
  const mod = loadNodeSqlite()
  if (!mod) throw new Error('node:sqlite is not available in this runtime')
  const db = readOnly
    ? new mod.DatabaseSync(path, { readOnly: true })
    : new mod.DatabaseSync(path)
  return {
    prepare: (sql) => wrapStatement(db.prepare(sql)),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  }
}

// ─── better-sqlite3 ──────────────────────────────────────────────────────────

interface BetterSqliteDatabase extends RawDatabase {
  close(): void
}

interface BetterSqliteModule {
  new (path: string, options?: { readonly?: boolean; fileMustExist?: boolean }): BetterSqliteDatabase
}

function loadBetterSqlite(): BetterSqliteModule {
  // The app passes the absolute path of its unpacked copy — plain node cannot
  // read inside app.asar, and the module may not be resolvable from the
  // bundle's own directory.
  const explicit = (process.env['OASIS_SQLITE_MODULE'] ?? '').trim()
  if (explicit !== '') return requireFn(explicit) as BetterSqliteModule
  return requireFn('better-sqlite3') as BetterSqliteModule
}

function openBetterSqlite(path: string, readOnly: boolean): SqliteDatabase {
  const Database = loadBetterSqlite()
  const db = readOnly
    ? new Database(path, { readonly: true, fileMustExist: true })
    : new Database(path)
  return {
    prepare: (sql) => wrapStatement(db.prepare(sql)),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Opens a database file with whichever driver this runtime provides.
 *
 * `node:sqlite` is tried first; the app's own better-sqlite3 build is the
 * fallback that makes the endpoint work on a machine without Node.js.
 */
export function openSqlite(
  path: string,
  options: { readOnly?: boolean } = {}
): { db: SqliteDatabase; driver: SqliteDriverName } {
  const readOnly = options.readOnly === true

  if (loadNodeSqlite()) {
    try {
      return { db: openNodeSqlite(path, readOnly), driver: 'node:sqlite' }
    } catch (error) {
      // A file that cannot be opened read-only (missing WAL sidecars, …) is
      // still worth retrying with the other driver.
      const nodeError = describeError(error)
      try {
        return { db: openBetterSqlite(path, readOnly), driver: 'better-sqlite3' }
      } catch {
        throw new Error(
          `Failed to open ${path} with node:sqlite (${nodeError}) and with better-sqlite3.`
        )
      }
    }
  }

  try {
    return { db: openBetterSqlite(path, readOnly), driver: 'better-sqlite3' }
  } catch (error) {
    throw new Error(
      `No usable SQLite driver: this runtime has no node:sqlite (it needs Node >= 22.5) ` +
        `and the better-sqlite3 fallback could not be loaded — ${describeError(error)}. ` +
        `Set OASIS_SQLITE_MODULE to the module directory, or run the server on Node >= 22.5.`
    )
  }
}
