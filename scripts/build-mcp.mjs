#!/usr/bin/env node
/**
 * Bundles the MCP server into a single self-contained CJS file for packaged
 * builds: resources/mcp/server.cjs.
 *
 * Why a bundle: the app spawns the MCP server as `node <entry> --http` on the
 * SYSTEM Node runtime. Inside an installer there is no node_modules (the MCP
 * SDK is a devDependency and files live inside app.asar, which plain node
 * cannot read), so the entry point plus all of its dependencies are bundled
 * into one file that electron-builder ships via extraResources.
 *
 * The output format is CJS on purpose: the SDK's SSE transport pulls in
 * CJS-only dependencies (raw-body → http-errors → depd), and ESM bundles
 * cannot run their `require()` calls at runtime ("Dynamic require of 'path'
 * is not supported"). Our own sources contain no top-level await, so the
 * ESM→CJS conversion is safe.
 *
 * Node's built-ins (node:sqlite, node:child_process, …) stay external, so the
 * bundle still requires Node >= 22.5 at runtime.
 *
 * Usage: node scripts/build-mcp.mjs   (wired into `npm run build`)
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const entry = join(repoRoot, 'mcp', 'index.ts')
const outDir = join(repoRoot, 'resources', 'mcp')
const outfile = join(outDir, 'server.cjs')

mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'info'
})

console.log(`[build-mcp] bundled ${entry} → ${outfile}`)
