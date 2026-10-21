/**
 * Minimal ambient declarations for Node's built-in `node:sqlite` module.
 *
 * The repository pins @types/node ^20, which predates the `node:sqlite`
 * typings shipped with @types/node ^22. The MCP server loads the module through
 * the driver adapter in `mcp/sqlite.ts` (so it can fall back to better-sqlite3
 * when the runtime has no node:sqlite — Electron's own Node 20, for instance),
 * which is why these declarations are kept for reference.
 */
declare module 'node:sqlite' {
  export interface DatabaseSyncOptions {
    /** Open the database file read-only. */
    readOnly?: boolean
    /** Create the file if it does not exist (default true). */
    open?: boolean
    /** Busy timeout in milliseconds. */
    timeout?: boolean | number
    enableForeignKeyConstraints?: boolean
    enableDoubleQuotedStringLiterals?: boolean
    allowExtension?: boolean
  }

  export interface StatementSync {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number; lastInsertRowid: number }
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions)
    prepare(sql: string): StatementSync
    exec(sql: string): void
    close(): void
  }
}
