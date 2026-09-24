/**
 * Minimal ambient declarations for Node's built-in `node:sqlite` module.
 *
 * The repository pins @types/node ^20, which predates the `node:sqlite`
 * typings shipped with @types/node ^22. The MCP server runs directly on
 * Node's built-in SQLite driver (no native addon), so these declarations
 * only need to cover the surface this server uses.
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
