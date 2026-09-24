#!/usr/bin/env node
/**
 * App-integration test for the MCP HTTP endpoint.
 *
 * Covers the two pieces the Electron app relies on (see src/main/index.ts):
 *
 *   1. The packaged artifact `resources/mcp/server.mjs` (esbuild bundle of
 *      mcp/index.ts, shipped via extraResources) must start under plain system
 *      node and serve MCP over HTTP — because the app spawns exactly this file
 *      in production builds.
 *   2. The spawn manager `src/main/mcp-http.ts` must pass the environment the
 *      server expects (OASIS_DB_PATH / OASIS_MCP_TOKEN / OASIS_MCP_PORT /
 *      OASIS_MCP_HOST), serve real data from the app's database file, and
 *      terminate cleanly when the app quits (child.kill()).
 *
 * Run with:  node mcp/test/app-spawn.mjs        (wired into npm run test:mcp)
 * Requires Node.js >= 22.18 and esbuild (devDependency).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { build as esbuild } from 'esbuild'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const devEntry = join(repoRoot, 'mcp', 'index.ts')

const failures = []
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

async function removeDir(dir) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (error) {
      if (error && (error.code === 'EBUSY' || error.code === 'EPERM')) {
        await sleep(200)
        continue
      }
      throw error
    }
  }
  console.error(`warning: could not fully remove ${dir}`)
}

// ─── Fixture database (minimal app schema) ──────────────────────────────────

const SECRET = 'app-spawn-secret-key-abc123'
const isoAgo = (days) => new Date(Date.now() - days * 86400000).toISOString()

function buildFixtureDb(filePath) {
  const db = new DatabaseSync(filePath)
  db.exec(`
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, context TEXT,
      due_date TEXT, project_id TEXT, status TEXT NOT NULL DEFAULT 'inbox', waiting_for TEXT,
      priority TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
      outcome TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE waiting_items (id TEXT PRIMARY KEY, title TEXT NOT NULL, waiting_for TEXT NOT NULL,
      since TEXT NOT NULL, project_id TEXT, notes TEXT, created_at TEXT NOT NULL);
    CREATE TABLE someday_items (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, horizon TEXT,
      category TEXT, created_at TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE ai_providers (id TEXT PRIMARY KEY, name TEXT NOT NULL, provider_type TEXT,
      base_url TEXT, model TEXT, api_key TEXT, created_at TEXT NOT NULL);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  const run = (sql, ...params) => db.prepare(sql).run(...params)
  run('INSERT INTO app_settings (key, value) VALUES (?,?)', 'app_name', 'Oasis')
  run('INSERT INTO app_settings (key, value) VALUES (?,?)', '_schema_version', '3')
  run('INSERT INTO tasks (id,title,status,created_at,updated_at) VALUES (?,?,?,?,?)',
    'aaaaaaaa-0000-0000-0000-000000000001', 'Ship the app', 'next', isoAgo(3), isoAgo(1))
  run('INSERT INTO tasks (id,title,status,created_at,updated_at) VALUES (?,?,?,?,?)',
    'aaaaaaaa-0000-0000-0000-000000000002', 'Book flights', 'inbox', isoAgo(2), isoAgo(2))
  run('INSERT INTO ai_providers (id,name,provider_type,base_url,model,api_key,created_at) VALUES (?,?,?,?,?,?,?)',
    'bbbbbbbb-0000-0000-0000-000000000001', 'Provider', 'openai', 'https://api.example.com',
    'gpt-4o', SECRET, isoAgo(30))
  db.close()
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

const ACCEPT = 'application/json, text/event-stream'

async function waitForHealth(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  return false
}

async function rpc(port, body, token) {
  const headers = { 'Content-Type': 'application/json', Accept: ACCEPT }
  if (token !== null) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (contentType.includes('text/event-stream')) {
    for (const block of text.split('\n\n')) {
      const dataLines = []
      for (const line of block.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length > 0) return { status: res.status, message: JSON.parse(dataLines.join('\n')) }
    }
    return { status: res.status, message: null }
  }
  try {
    return { status: res.status, message: JSON.parse(text) }
  } catch {
    return { status: res.status, message: null }
  }
}

async function callTool(port, name, args, token) {
  const res = await rpc(port, {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name, arguments: args ?? {} }
  }, token)
  return JSON.parse(res.message.result.content[0].text)
}

// ─── Test run ────────────────────────────────────────────────────────────────

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'oasis-mcp-appspawn-'))
  const fixturePath = join(workDir, 'oasis-gtd.db')
  buildFixtureDb(fixturePath)
  console.log(`fixture: ${fixturePath}`)

  // 1. Bundle the packaged artifact the app spawns in production
  // (same config as scripts/build-mcp.mjs: CJS, because the SDK's SSE
  // transport pulls in CJS-only dependencies raw-body → http-errors → depd).
  const bundlePath = join(workDir, 'server.cjs')
  console.log('\n── packaged artifact (esbuild bundle) ──')
  await esbuild({
    entryPoints: [devEntry],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'error'
  })
  check('esbuild bundle of mcp/index.ts produced', true)

  const bundlePort = await freePort()
  const bundleChild = spawn(process.execPath, [bundlePath, '--http'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OASIS_DB_PATH: fixturePath,
      OASIS_MCP_TOKEN: 'bundle-token-1',
      OASIS_MCP_PORT: String(bundlePort),
      OASIS_MCP_HOST: '127.0.0.1'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let bundleStderr = ''
  bundleChild.stderr?.setEncoding('utf8')
  bundleChild.stderr?.on('data', (chunk) => {
    bundleStderr += chunk
  })
  try {
    check('bundle becomes ready (/health)', await waitForHealth(bundlePort), bundleStderr.slice(-500))
    const init = await rpc(bundlePort, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'app-spawn', version: '1.0.0' } }
    }, 'bundle-token-1')
    check('bundle: initialize', init.message?.result?.serverInfo?.name === 'oasis-gtd')
    const tools = await rpc(bundlePort, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'bundle-token-1')
    check('bundle: tools/list → 18', (tools.message?.result?.tools ?? []).length === 18)
    const bundleTasks = await callTool(bundlePort, 'list_tasks', {}, 'bundle-token-1')
    check('bundle: reads the app database', bundleTasks.total_matching === 2
      && bundleTasks.tasks.every((task) => task.id.startsWith('aaaaaaaa-')))
    const bundleDbInfo = await callTool(bundlePort, 'get_db_info', {}, 'bundle-token-1')
    check('bundle: serves the exact database file', bundleDbInfo.database.path === fixturePath,
      bundleDbInfo.database.path)
    check('bundle: api_key never exposed', !JSON.stringify(bundleDbInfo).includes(SECRET))
    const unauthorized = await rpc(bundlePort, { jsonrpc: '2.0', id: 3, method: 'ping' }, null)
    check('bundle: token required', unauthorized.status === 401)
  } finally {
    bundleChild.kill()
  }

  // 2. The controller the app uses (src/main/mcp-http.ts, wired with the real
  //    settings/queries in src/main/mcp-controller.ts). Here the settings are
  //    backed by an in-memory store and the entry is the dev TypeScript file.
  console.log('\n── app spawn manager (src/main/mcp-http.ts) ──')
  const { createMcpController } = await import('../../src/main/mcp-http.ts')
  const settings = new Map()
  const managerPort = await freePort()
  // Seed the persisted port so start() picks a known one.
  settings.set('mcp_http_port', String(managerPort))
  const logs = []
  const controller = createMcpController({
    getSetting: (key) => settings.get(key) ?? null,
    setSetting: (key, value) => settings.set(key, value),
    dbPath: () => fixturePath,
    entry: { script: devEntry, cwd: repoRoot },
    onLog: (line) => logs.push(line)
  })

  // Disabled-at-startup path: preference persisted as off → no child spawned.
  const disabled = createMcpController({
    getSetting: (key) => (key === 'mcp_http_enabled' ? '0' : null),
    setSetting: () => undefined,
    dbPath: () => fixturePath,
    entry: { script: devEntry, cwd: repoRoot }
  })
  await disabled.start()
  check('manager: disabled preference → no child spawned', disabled.getState().running === false
    && disabled.getState().enabled === false)

  const state = await controller.start()
  check('manager: start() reports intent', state.enabled === true && state.port === managerPort)
  check('manager: token generated on first start', typeof state.token === 'string' && state.token.length > 10)
  check('manager: state exposes endpoint urls', Array.isArray(state.urls)
    && state.urls.some((url) => url.endsWith(`:${managerPort}/mcp`)))
  check('manager: dbPath passed through', state.dbPath === fixturePath)

  try {
    check('manager: child becomes ready (/health)', await waitForHealth(managerPort), logs.join('\n').slice(-500))
    const init = await rpc(managerPort, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'app-spawn', version: '1.0.0' } }
    }, state.token)
    check('manager: initialize with the token it was given', init.message?.result?.serverInfo?.name === 'oasis-gtd')
    const dbInfo = await rpc(managerPort, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'get_db_info', arguments: {} }
    }, state.token)
    const servedPath = JSON.parse(dbInfo.message.result.content[0].text).database.path
    check('manager: passes OASIS_DB_PATH through (app database)', servedPath === fixturePath, servedPath)
    const wrongToken = await rpc(managerPort, { jsonrpc: '2.0', id: 3, method: 'ping' }, 'bundle-token-1')
    check('manager: wrong token rejected', wrongToken.status === 401)

    // Runtime toggle (Settings → MCP): off stops the service, on brings it back.
    const off = await controller.setEnabled(false)
    check('manager: setEnabled(false) reports stopped', off.running === false && off.enabled === false)
    const afterOff = await fetch(`http://127.0.0.1:${managerPort}/health`).then(
      () => 'still-up',
      () => 'down'
    )
    check('manager: endpoint stops on toggle-off', afterOff === 'down')

    const on = await controller.setEnabled(true)
    check('manager: setEnabled(true) reports running', on.running === true && on.enabled === true)
    check('manager: endpoint comes back on toggle-on', await waitForHealth(managerPort))
    const initAgain = await rpc(managerPort, {
      jsonrpc: '2.0', id: 4, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'app-spawn', version: '1.0.0' } }
    }, on.token)
    check('manager: stable token across restarts', on.token === state.token
      && initAgain.message?.result?.serverInfo?.name === 'oasis-gtd')
  } finally {
    // Simulates app quit: before-quit handler calls controller.stop().
    controller.stop()
  }

  await sleep(300)
  const deadCheck = await fetch(`http://127.0.0.1:${managerPort}/health`).then(
    () => 'still-up',
    () => 'down'
  )
  check('manager: endpoint stops with the app (quit)', deadCheck === 'down')

  // ── Guards against double-starting the endpoint ───────────────────────────
  console.log('\n── app-spawn guards ──')

  // Guard 2: an external process already on the port → no second endpoint.
  const squatterPort = await freePort()
  const squatter = createNetServer()
  await new Promise((resolve) => squatter.listen(squatterPort, '127.0.0.1', resolve))
  const blocked = createMcpController({
    getSetting: (key) => (key === 'mcp_http_port' ? String(squatterPort) : null),
    setSetting: () => undefined,
    dbPath: () => fixturePath,
    entry: { script: devEntry, cwd: repoRoot },
    onLog: (line) => logs.push(line)
  })
  const blockedState = await blocked.start()
  check('manager: external port squatter → no second endpoint spawned',
    blockedState.running === false && (blockedState.error ?? '').includes('already in use'),
    blockedState.error ?? '')
  await new Promise((resolve) => squatter.close(resolve))

  // Guard 1: a child left over from a main-process reload is killed on start.
  const leftoverPort = await freePort()
  const leftover = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  globalThis.__oasisGtdMcpHttpChild = leftover
  const leftoverExited = new Promise((resolve) => leftover.once('exit', resolve))
  const reloaded = createMcpController({
    getSetting: (key) => (key === 'mcp_http_port' ? String(leftoverPort) : null),
    setSetting: () => undefined,
    dbPath: () => fixturePath,
    entry: { script: devEntry, cwd: repoRoot },
    onLog: (line) => logs.push(line)
  })
  const reloadedState = await reloaded.start()
  check('manager: leftover reload child killed on start',
    await Promise.race([leftoverExited.then(() => true), sleep(3000).then(() => false)]))
  check('manager: reload start spawns a fresh endpoint',
    reloadedState.running === true && reloaded.isRunning(),
    reloadedState.error ?? '')
  reloaded.stop()

  await removeDir(workDir)

  console.log(`\n${checks - failures.length}/${checks} checks passed`)
  if (failures.length > 0) {
    console.error(`\n${failures.length} FAILURES:`)
    for (const failure of failures) console.error(`  ✗ ${failure}`)
    process.exitCode = 1
  } else {
    console.log('App-spawn integration test PASSED')
  }
}

main().catch((error) => {
  console.error('App-spawn test crashed:', error)
  process.exitCode = 1
})
