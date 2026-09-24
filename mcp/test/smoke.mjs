#!/usr/bin/env node
/**
 * End-to-end smoke test for the Oasis GTD MCP server.
 *
 * What it proves:
 *   1. `node mcp/index.ts` starts as a stdio MCP server using built-in TS
 *      type stripping (no build step).
 *   2. initialize / tools/list / resources/list negotiation works.
 *   3. Every registered tool returns well-formed, correct data from a
 *      fixture database with the app's exact schema.
 *   4. Static and templated resources read correctly.
 *   5. The server is read-only: no tool leaks the ai_providers secret.
 *
 * Run with:  npm run test:mcp        (or: node mcp/test/smoke.mjs)
 * Requires Node.js >= 22.18 (for built-in TypeScript type stripping).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const serverEntry = join(repoRoot, 'mcp', 'index.ts')

// ─── Fixture database (mirrors src/main/db/database.ts createTables) ─────────

const SCHEMA = `
-- Mirrors the app's createTables() schema. The tasks CHECK includes 'archive'
-- because real databases predate that constraint and still hold archived rows.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, context TEXT, due_date TEXT,
  project_id TEXT, status TEXT NOT NULL DEFAULT 'inbox'
    CHECK(status IN ('inbox','next','waiting','someday','done','archive')),
  waiting_for TEXT, priority TEXT DEFAULT 'medium'
    CHECK(priority IN ('high','medium','low')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, outcome TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','on-hold')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE waiting_items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, waiting_for TEXT NOT NULL, since TEXT NOT NULL,
  project_id TEXT, notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE someday_items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT,
  horizon TEXT NOT NULL DEFAULT 'someday'
    CHECK(horizon IN ('soon','1month','3months','1year','someday')),
  category TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE review_checklist (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), review_date TEXT
);
CREATE TABLE ai_providers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, provider_type TEXT NOT NULL DEFAULT 'openai'
    CHECK(provider_type IN ('openai','anthropic','ollama','custom')),
  base_url TEXT NOT NULL, model TEXT NOT NULL, api_key TEXT, system_prompt TEXT DEFAULT '',
  temperature REAL DEFAULT 0.7, max_tokens INTEGER DEFAULT 2048,
  is_active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, provider_id TEXT, model TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE notes (
  id TEXT PRIMARY KEY, content TEXT NOT NULL, tags TEXT, weather TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE habits (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK(frequency IN ('daily','weekly')), time_of_day TEXT, color TEXT,
  target INTEGER NOT NULL DEFAULT 1, is_quantitative INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1))
);
CREATE TABLE habit_records (
  id TEXT PRIMARY KEY, habit_id TEXT NOT NULL, record_date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1 CHECK(completed IN (0,1)),
  count INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
  UNIQUE(habit_id, record_date)
);
CREATE TABLE resources (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'document'
    CHECK(type IN ('document','link','spreadsheet','image','collection')),
  description TEXT, file_size TEXT, url TEXT, tags TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
`

const SECRET = 'SUPER-SECRET-API-KEY-7f3a9'
const today = new Date().toISOString().split('T')[0]
const isoNow = new Date().toISOString()
const isoAgo = (days) => new Date(Date.now() - days * 86400000).toISOString()
const dateAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

const IDS = {
  project: '11111111-1111-1111-1111-111111111111',
  taskInbox: '22222222-2222-2222-2222-222222222221',
  taskNext: '22222222-2222-2222-2222-222222222222',
  taskWaiting: '22222222-2222-2222-2222-222222222223',
  taskDone: '22222222-2222-2222-2222-222222222224',
  taskArchived: '22222222-2222-2222-2222-222222222225',
  waiting: '33333333-3333-3333-3333-333333333333',
  someday: '44444444-4444-4444-4444-444444444444',
  note: '55555555-5555-5555-5555-555555555555',
  habit: '66666666-6666-6666-6666-666666666666',
  habitSimple: '66666666-6666-6666-6666-666666666667',
  conversation: '77777777-7777-7777-7777-777777777777',
  resource: '88888888-8888-8888-8888-888888888888'
}

function buildFixtureDb(filePath) {
  const db = new DatabaseSync(filePath)
  db.exec(SCHEMA)
  const run = (sql, ...params) => db.prepare(sql).run(...params)
  run(
    'INSERT INTO projects (id,title,description,outcome,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    IDS.project, 'Launch website', 'Ship the new marketing site', 'Live site with 3 case studies',
    'active', isoAgo(30), isoAgo(2)
  )
  run('INSERT INTO projects (id,title,description,outcome,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    '99999999-9999-9999-9999-999999999999', 'On hold project', null, null, 'on-hold', isoAgo(60), isoAgo(30))
  run(
    'INSERT INTO tasks (id,title,notes,context,due_date,project_id,status,waiting_for,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    IDS.taskInbox, 'Buy milk', 'Whole milk', '@Errands', null, null, 'inbox', null, 'low', isoAgo(5), isoAgo(5)
  )
  run(
    'INSERT INTO tasks (id,title,notes,context,due_date,project_id,status,waiting_for,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    IDS.taskNext, 'Draft homepage copy', 'Hero + 3 sections', '@Computer', today, IDS.project, 'next',
    null, 'high', isoAgo(4), isoAgo(1)
  )
  run(
    'INSERT INTO tasks (id,title,notes,context,due_date,project_id,status,waiting_for,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    IDS.taskWaiting, 'Awaiting logo feedback', null, null, null, IDS.project, 'waiting',
    'Alice', 'medium', isoAgo(10), isoAgo(9)
  )
  run(
    'INSERT INTO tasks (id,title,notes,context,due_date,project_id,status,waiting_for,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    IDS.taskDone, 'Old finished task', null, null, null, null, 'done', null, 'medium', isoAgo(40), isoAgo(35)
  )
  run(
    'INSERT INTO tasks (id,title,notes,context,due_date,project_id,status,waiting_for,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    IDS.taskArchived, 'Archived task', null, null, null, null, 'archive', null, 'medium', isoAgo(50), isoAgo(45)
  )
  run(
    'INSERT INTO waiting_items (id,title,waiting_for,since,project_id,notes,created_at) VALUES (?,?,?,?,?,?,?)',
    IDS.waiting, 'Invoice approval', 'Bob', isoAgo(10), IDS.project, 'Q3 invoice', isoAgo(10)
  )
  run(
    'INSERT INTO someday_items (id,title,notes,horizon,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    IDS.someday, 'Learn piano', null, '1year', '', isoAgo(20), null
  )
  run(
    'INSERT INTO someday_items (id,title,notes,horizon,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    '44444444-4444-4444-4444-444444444445', 'Trip to Japan', 'Cherry blossom season', 'soon',
    'travel', isoAgo(15), null
  )
  run('INSERT INTO review_checklist (id,category,title,completed,review_date) VALUES (?,?,?,?,?)',
    'aaaaaaaa-0000-0000-0000-000000000001', 'inbox', 'Clear inbox', 0, null)
  run('INSERT INTO review_checklist (id,category,title,completed,review_date) VALUES (?,?,?,?,?)',
    'aaaaaaaa-0000-0000-0000-000000000002', 'projects', 'Review active projects', 1, isoNow)
  run(
    'INSERT INTO ai_providers (id,name,provider_type,base_url,model,api_key,is_active,created_at) VALUES (?,?,?,?,?,?,?,?)',
    'bbbbbbbb-0000-0000-0000-000000000001', 'Test provider', 'openai', 'https://api.example.com',
    'gpt-4o', SECRET, 1, isoAgo(50)
  )
  run(
    'INSERT INTO chat_conversations (id,title,provider_id,model,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    IDS.conversation, 'Weekly planning', 'bbbbbbbb-0000-0000-0000-000000000001', 'gpt-4o',
    isoAgo(2), isoAgo(1)
  )
  run('INSERT INTO chat_messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)',
    'cccccccc-0000-0000-0000-000000000001', IDS.conversation, 'user', 'Help me plan my week', isoAgo(2))
  run('INSERT INTO chat_messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)',
    'cccccccc-0000-0000-0000-000000000002', IDS.conversation, 'assistant',
    "Sure — let's start with the inbox.", isoAgo(2))
  run(
    'INSERT INTO app_settings (key,value) VALUES (?,?)', 'app_name', 'Oasis'
  )
  run(
    'INSERT INTO app_settings (key,value) VALUES (?,?)', 'contexts',
    JSON.stringify(['@Email', '@Office', '@Computer', '@Errands'])
  )
  run('INSERT INTO app_settings (key,value) VALUES (?,?)', '_schema_version', '3')
  run(
    'INSERT INTO notes (id,content,tags,weather,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    IDS.note, 'Remember to call mom', JSON.stringify(['personal']), 'sunny', isoAgo(3), isoAgo(3)
  )
  run(
    'INSERT INTO notes (id,content,tags,weather,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    '55555555-5555-5555-5555-555555555556', 'Idea: a GTD podcast', JSON.stringify(['ideas', 'media']),
    null, isoAgo(8), isoAgo(8)
  )
  run(
    'INSERT INTO habits (id,title,description,frequency,target,is_quantitative,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    IDS.habit, 'Drink water', '8 glasses a day', 'daily', 8, 1, isoAgo(14), isoAgo(14)
  )
  run(
    'INSERT INTO habits (id,title,description,frequency,target,is_quantitative,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    IDS.habitSimple, 'Read 20 pages', null, 'daily', 1, 0, isoAgo(14), isoAgo(14)
  )
  run('INSERT INTO habit_records (id,habit_id,record_date,completed,count,created_at) VALUES (?,?,?,?,?,?)',
    'dddddddd-0000-0000-0000-000000000001', IDS.habit, today, 1, 3, isoNow)
  run('INSERT INTO habit_records (id,habit_id,record_date,completed,count,created_at) VALUES (?,?,?,?,?,?)',
    'dddddddd-0000-0000-0000-000000000002', IDS.habit, dateAgo(1), 1, 8, isoNow)
  run('INSERT INTO habit_records (id,habit_id,record_date,completed,count,created_at) VALUES (?,?,?,?,?,?)',
    'dddddddd-0000-0000-0000-000000000003', IDS.habitSimple, today, 1, 1, isoNow)
  run(
    'INSERT INTO resources (id,title,type,description,url,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    IDS.resource, 'GTD book notes', 'document', 'Summary of Getting Things Done',
    null, JSON.stringify(['gtd']), isoAgo(7), isoAgo(7)
  )
  db.close()
}

// ─── Minimal stdio JSON-RPC client ───────────────────────────────────────────

class StdioMcpClient {
  constructor(env) {
    this.nextId = 0
    this.pending = new Map()
    this.stderrTail = ''
    this.child = spawn(process.execPath, [serverEntry], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => this.#onStdout(chunk))
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk) => {
      this.stderrTail += chunk
      if (this.stderrTail.length > 4000) this.stderrTail = this.stderrTail.slice(-4000)
    })
    this.child.on('exit', (code) => {
      for (const [, reject] of this.pending) {
        reject(new Error(`server exited early (code ${code}). stderr:\n${this.stderrTail}`))
      }
      this.pending.clear()
    })
    this.buffer = ''
  }

  #onStdout(chunk) {
    this.buffer += chunk
    let index = this.buffer.indexOf('\n')
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      index = this.buffer.indexOf('\n')
      if (line === '') continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue // notifications and anything without an id are ignored here
      }
      if (message.id !== undefined && this.pending.has(message.id)) {
        this.pending.get(message.id)(message)
        this.pending.delete(message.id)
      }
    }
  }

  request(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 20000)
      this.pending.set(id, (message) => {
        clearTimeout(timer)
        resolve(message)
      })
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return
    await new Promise((resolve) => {
      this.child.once('exit', resolve)
      this.child.kill()
    })
  }
}

// ─── Assertions ──────────────────────────────────────────────────────────────

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

/** Calls a tool and parses its JSON payload. */
async function callTool(client, name, args = {}) {
  const response = await client.request('tools/call', { name, arguments: args })
  if (response.error) throw new Error(`tools/call ${name} failed: ${JSON.stringify(response.error)}`)
  const result = response.result
  if (result.isError) throw new Error(`tool ${name} returned isError: ${result.content?.[0]?.text}`)
  return JSON.parse(result.content[0].text)
}

async function readResource(client, uri) {
  const response = await client.request('resources/read', { uri })
  if (response.error) throw new Error(`resources/read ${uri} failed: ${JSON.stringify(response.error)}`)
  return response.result.contents[0]
}

// ─── HTTP mode (LAN + bearer token) ──────────────────────────────────────────

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

const HTTP_TOKEN = 'smoke-test-token-7f3a9c'
/** MCP Streamable HTTP requires this Accept header (SDK enforces it). */
const MCP_ACCEPT = 'application/json, text/event-stream'

async function postMcp(port, body, token = HTTP_TOKEN) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: MCP_ACCEPT
  }
  if (token !== null) headers.Authorization = `Bearer ${token}`
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
}

/**
 * Parses an MCP Streamable HTTP response: the server may answer either with
 * `application/json` or with a `text/event-stream` SSE stream (both are legal).
 */
async function parseMcpResponse(res) {
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (contentType.includes('text/event-stream')) {
    const events = []
    for (const block of text.split('\n\n')) {
      const dataLines = []
      for (const line of block.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length > 0) events.push(JSON.parse(dataLines.join('\n')))
    }
    return events[0]
  }
  return JSON.parse(text)
}

async function testHttpMode(fixturePath) {
  console.log('\n── HTTP transport ──')
  const port = await freePort()
  const child = spawn(process.execPath, [serverEntry, '--http'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OASIS_DB_PATH: fixturePath,
      OASIS_MCP_TOKEN: HTTP_TOKEN,
      OASIS_MCP_HOST: '127.0.0.1',
      OASIS_MCP_PORT: String(port)
    },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  child.stderr.setEncoding('utf8')
  let stderrTail = ''
  child.stderr.on('data', (chunk) => {
    stderrTail += chunk
    if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000)
  })
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`http server exited early (code ${code}). stderr:\n${stderrTail}`)
    }
  })

  try {
    // Wait for readiness (GET /health is unauthenticated by design).
    let ready = false
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      await sleep(250)
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`)
        if (res.ok) ready = true
      } catch {
        /* not up yet */
      }
    }
    check('http: server becomes ready (/health)', ready, stderrTail)

    const health = await fetch(`http://127.0.0.1:${port}/health`)
    const healthJson = await health.json()
    check('http: /health payload', healthJson.status === 'ok' && healthJson.service === 'oasis-gtd-mcp')

    const noAuth = await postMcp(port, { jsonrpc: '2.0', id: 1, method: 'ping' }, null)
    check('http: request without token → 401', noAuth.status === 401)
    check('http: 401 advertises bearer challenge', (noAuth.headers.get('www-authenticate') ?? '').includes('Bearer'))

    const badToken = await postMcp(port, { jsonrpc: '2.0', id: 1, method: 'ping' }, 'wrong-token')
    check('http: request with wrong token → 401', badToken.status === 401)

    const initRes = await postMcp(port, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'smoke-http', version: '1.0.0' }
      }
    })
    check('http: initialize → 200', initRes.status === 200)
    check('http: POST responds application/json (not SSE)',
      (initRes.headers.get('content-type') ?? '').includes('application/json'),
      `content-type=${initRes.headers.get('content-type')}`)
    const initJson = await parseMcpResponse(initRes)
    check('http: initialize serverInfo', initJson.result?.serverInfo?.name === 'oasis-gtd')

    // Legacy HTTP+SSE handshake: GET /mcp must immediately send the `endpoint`
    // event (an empty, hanging stream is what breaks older clients).
    const sseRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${HTTP_TOKEN}`, Accept: 'text/event-stream' }
    })
    check('http: GET /mcp → 200 text/event-stream (legacy SSE)', sseRes.status === 200
      && (sseRes.headers.get('content-type') ?? '').includes('text/event-stream'),
      `status=${sseRes.status}`)
    const reader = sseRes.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    const readNextEvent = async () => {
      while (true) {
        const idx = sseBuffer.indexOf('\n\n')
        if (idx >= 0) {
          const block = sseBuffer.slice(0, idx)
          sseBuffer = sseBuffer.slice(idx + 2)
          if (block.trim() !== '') return block
        }
        const { value, done } = await reader.read()
        if (done) return null
        sseBuffer += decoder.decode(value, { stream: true })
      }
    }
    const endpointEvent = await readNextEvent()
    check('http: legacy SSE endpoint event sent immediately',
      (endpointEvent ?? '').includes('event: endpoint')
      && (endpointEvent ?? '').includes('/messages?sessionId='),
      (endpointEvent ?? '').slice(0, 120))
    const endpointPath = (endpointEvent ?? '').match(/data: (\S+)/)?.[1]
    check('http: legacy SSE endpoint path parsed',
      typeof endpointPath === 'string' && endpointPath.startsWith('/messages?sessionId='),
      String(endpointPath))

    if (endpointPath) {
      const msgRes = await fetch(`http://127.0.0.1:${port}${endpointPath}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${HTTP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      })
      check('http: legacy SSE message POST accepted',
        msgRes.status === 202 || msgRes.status === 200, `status=${msgRes.status}`)
      // The response streams back over the SSE connection.
      let sawToolsList = false
      const deadline = Date.now() + 5000
      while (!sawToolsList && Date.now() < deadline) {
        const event = await readNextEvent()
        if (event === null) break
        if (event.includes('"tools"')) sawToolsList = true
      }
      check('http: legacy SSE response streams back (tools/list)', sawToolsList)
      await reader.cancel()
    }

    const toolsRes = await postMcp(port, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const toolsJson = await parseMcpResponse(toolsRes)
    check('http: tools/list → 18 tools', (toolsJson.result?.tools ?? []).length === 18)

    const overviewRes = await postMcp(port, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_overview', arguments: {} }
    })
    const overviewJson = JSON.parse((await parseMcpResponse(overviewRes)).result.content[0].text)
    check('http: get_overview reads fixture data', overviewJson.counts.tasks.total === 5
      && overviewJson.database.openMode === 'read-only')

    const resourceRes = await postMcp(port, {
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: 'gtd://tasks' }
    })
    const resourceContent = (await parseMcpResponse(resourceRes)).result?.contents?.[0]
    check('http: resources/read gtd://tasks', resourceContent?.mimeType === 'application/json'
      && JSON.parse(resourceContent.text).tasks.length === 3)

    const unknownPath = await fetch(`http://127.0.0.1:${port}/nope`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${HTTP_TOKEN}`, 'Content-Type': 'application/json' },
      body: '{}'
    })
    check('http: unknown path with token → 404', unknownPath.status === 404)

    // Trailing slash must behave like the canonical path (obsidian-style URLs).
    const slashRes = await fetch(`http://127.0.0.1:${port}/mcp/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HTTP_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list' })
    })
    check('http: /mcp/ (trailing slash) behaves like /mcp', slashRes.status === 200,
      `status=${slashRes.status}`)

    // Non-compliant Accept (JSON only) is tolerated — we answer JSON anyway.
    const jsonOnlyRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HTTP_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/list' })
    })
    check('http: Accept: application/json only → 200 (no 406)', jsonOnlyRes.status === 200
      && (jsonOnlyRes.headers.get('content-type') ?? '').includes('application/json'),
      `status=${jsonOnlyRes.status}`)

    const preflight = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'OPTIONS' })
    check('http: CORS preflight → 204 + allow origin', preflight.status === 204
      && preflight.headers.get('access-control-allow-origin') === '*')

    const headProbe = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${HTTP_TOKEN}` }
    })
    check('http: HEAD /mcp → 200 + Allow header', headProbe.status === 200
      && (headProbe.headers.get('allow') ?? '').includes('GET'),
      `status=${headProbe.status}`)
  } finally {
    child.kill()
  }
}

// ─── Test run ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function removeDir(dir) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (error) {
      if (error && (error.code === 'EBUSY' || error.code === 'EPERM')) {
        await sleep(200) // Windows: SQLite releases the file handles shortly after exit
        continue
      }
      throw error
    }
  }
  console.error(`warning: could not fully remove ${dir}`)
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'oasis-gtd-mcp-test-'))
  const fixturePath = join(workDir, 'oasis-gtd.db')
  buildFixtureDb(fixturePath)
  console.log(`fixture database: ${fixturePath}`)

  const client = new StdioMcpClient({ OASIS_DB_PATH: fixturePath })
  try {    // 1. Lifecycle
    const init = await client.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' }
    })
    check('initialize returns serverInfo', init.result?.serverInfo?.name === 'oasis-gtd',
      JSON.stringify(init.result?.serverInfo))
    check('initialize returns instructions', typeof init.result?.instructions === 'string' && init.result.instructions.length > 100)
    check('initialize advertises tools capability', !!init.result?.capabilities?.tools)
    check('initialize advertises resources capability', !!init.result?.capabilities?.resources)
    client.notify('notifications/initialized')

    const ping = await client.request('ping')
    check('ping responds', !!ping.result && !ping.error)

    // 2. Tool catalogue
    const tools = await client.request('tools/list')
    const toolNames = (tools.result?.tools ?? []).map((t) => t.name)
    const expectedTools = [
      'get_overview', 'get_db_info', 'list_tasks', 'get_task', 'search_tasks',
      'list_projects', 'get_project', 'list_waiting_items', 'list_someday_items',
      'list_notes', 'search_notes', 'list_habits', 'get_habit',
      'list_conversations', 'get_conversation', 'list_resources',
      'get_review_checklist', 'export_gtd_data'
    ]
    for (const name of expectedTools) {
      check(`tool registered: ${name}`, toolNames.includes(name))
    }
    check('all tools advertise readOnlyHint',
      (tools.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true))

    // 3. Tool behaviour
    const overview = await callTool(client, 'get_overview')
    check('overview task counts', overview.counts.tasks.total === 5 && overview.counts.tasks.inbox === 1
      && overview.counts.tasks.next === 1 && overview.counts.tasks.waiting === 1
      && overview.counts.tasks.done === 1 && overview.counts.tasks.archive === 1,
      JSON.stringify(overview.counts.tasks))
    check('overview by_status grouping', overview.counts.tasks.by_status.archive === 1
      && overview.counts.tasks.by_status.next === 1)
    check('overview project counts', overview.counts.projects.active === 1 && overview.counts.projects['on-hold'] === 1)
    check('overview attention metrics', overview.attention.inbox_tasks === 1
      && overview.attention.due_today_tasks === 1 && overview.attention.overdue_tasks === 0
      && overview.attention.stale_waiting_items === 1,
      JSON.stringify(overview.attention))
    check('overview contexts parsed', Array.isArray(overview.contexts) && overview.contexts.includes('@Computer'))
    check('overview exposes database path', overview.database.path === fixturePath)
    check('overview shows read-only mode', overview.database.openMode === 'read-only')

    const nextTasks = await callTool(client, 'list_tasks', { status: 'next' })
    check('list_tasks filters by status', nextTasks.returned === 1
      && nextTasks.tasks[0].id === IDS.taskNext && nextTasks.tasks[0].project_title === 'Launch website')

    const openTasks = await callTool(client, 'list_tasks', { exclude_done: true })
    check('list_tasks exclude_done', openTasks.total_matching === 3)

    const paged = await callTool(client, 'list_tasks', { limit: 2, offset: 0, order: 'title' })
    check('list_tasks pagination', paged.returned === 2 && paged.total_matching === 5)

    const archived = await callTool(client, 'list_tasks', { status: 'archive' })
    check('list_tasks archive status', archived.returned === 1 && archived.tasks[0].id === IDS.taskArchived)

    const single = await callTool(client, 'get_task', { id: IDS.taskNext })
    check('get_task by id', single.title === 'Draft homepage copy' && single.priority === 'high')

    const missing = await client.request('tools/call', { name: 'get_task', arguments: { id: 'nope' } })
    check('get_task unknown id → isError', missing.result?.isError === true)

    const searched = await callTool(client, 'search_tasks', { query: 'logo' })
    check('search_tasks keyword', searched.tasks.length === 1 && searched.tasks[0].id === IDS.taskWaiting)

    const projects = await callTool(client, 'list_projects')
    check('list_projects active first', projects.projects.length === 2
      && projects.projects[0].id === IDS.project
      && projects.projects[0].open_task_count === 2)

    const project = await callTool(client, 'get_project', { id: IDS.project })
    check('get_project bundles tasks + waiting', project.tasks.length === 2
      && project.waiting_items.length === 1 && project.waiting_items[0].waiting_for === 'Bob')

    const waiting = await callTool(client, 'list_waiting_items')
    check('list_waiting_items', waiting.waiting_items.length === 1 && !!waiting.waiting_items[0].project_title)

    const someday = await callTool(client, 'list_someday_items', { horizon: 'soon' })
    check('list_someday_items horizon filter', someday.someday_items.length === 1
      && someday.someday_items[0].title === 'Trip to Japan')

    const notes = await callTool(client, 'list_notes', { tag: 'personal' })
    check('list_notes tag filter + parsed tags', notes.notes.length === 1
      && Array.isArray(notes.notes[0].tags) && notes.notes[0].tags[0] === 'personal')

    const noteSearch = await callTool(client, 'search_notes', { query: 'podcast' })
    check('search_notes', noteSearch.notes.length === 1 && noteSearch.notes[0].content.includes('podcast'))

    const habits = await callTool(client, 'list_habits')
    check('list_habits today counts', habits.habits.length === 2
      && habits.habits[0].today_count === 3 && habits.habits[1].today_count === 1)

    const habit = await callTool(client, 'get_habit', { id: IDS.habit, days: 30 })
    check('get_habit records', habit.recent_records.length === 2
      && habit.habit.total_sessions === 11)

    const conversations = await callTool(client, 'list_conversations')
    check('list_conversations message counts', conversations.conversations.length === 1
      && conversations.conversations[0].message_count === 2)

    const conversation = await callTool(client, 'get_conversation', { id: IDS.conversation })
    check('get_conversation chronological messages', conversation.messages.length === 2
      && conversation.messages[0].role === 'user' && conversation.messages[1].role === 'assistant')

    const resources = await callTool(client, 'list_resources', { type: 'document' })
    check('list_resources type filter', resources.resources.length === 1
      && Array.isArray(resources.resources[0].tags))

    const review = await callTool(client, 'get_review_checklist')
    check('get_review_checklist', review.total === 2 && review.completed === 1)

    const dbInfo = await callTool(client, 'get_db_info')
    check('get_db_info row counts', dbInfo.row_counts.tasks === 5
      && dbInfo.row_counts.chat_messages === 2 && dbInfo.row_counts.habits === 2)
    check('get_db_info schema version', dbInfo.database.schemaVersion === 3)

    const exported = await callTool(client, 'export_gtd_data')
    check('export_gtd_data collections', exported.tasks.length === 5 && exported.projects.length === 2
      && exported.conversations.length === 1 && !('messages' in exported))

    const exportedWithMessages = await callTool(client, 'export_gtd_data', { include_messages: true })
    check('export_gtd_data include_messages', exportedWithMessages.messages?.length === 2)

    // 4. Security: secrets must never surface through any tool
    const allOutputs = [tools.result, overview, dbInfo, exported].map((v) => JSON.stringify(v)).join('\n')
    check('ai_providers api_key never exposed', !allOutputs.includes(SECRET))
    check('export omits ai_providers table', !JSON.stringify(exported).includes('ai_providers'))

    // 5. Resources
    const resourceList = await client.request('resources/list')
    const uris = (resourceList.result?.resources ?? []).map((r) => r.uri)
    for (const uri of ['gtd://overview', 'gtd://tasks', 'gtd://projects', 'gtd://waiting-items',
      'gtd://someday-items', 'gtd://notes', 'gtd://habits', 'gtd://resources',
      'gtd://conversations', 'gtd://review-checklist']) {
      check(`resource listed: ${uri}`, uris.includes(uri))
    }
    // Template instances are merged into resources/list by the SDK …
    for (const status of ['inbox', 'next', 'waiting', 'someday', 'done']) {
      check(`template instance listed: gtd://tasks/${status}`, uris.includes(`gtd://tasks/${status}`))
    }
    check(`template instance listed: gtd://projects/${IDS.project}`,
      uris.includes(`gtd://projects/${IDS.project}`))
    check(`template instance listed: gtd://conversations/${IDS.conversation}`,
      uris.includes(`gtd://conversations/${IDS.conversation}`))

    // … and the raw patterns are exposed through resources/templates/list.
    const templateList = await client.request('resources/templates/list')
    const templates = (templateList.result?.resourceTemplates ?? []).map((t) => t.uriTemplate)
    for (const template of ['gtd://tasks/{status}', 'gtd://projects/{id}', 'gtd://conversations/{id}']) {
      check(`resource template listed: ${template}`, templates.includes(template))
    }

    const overviewResource = await readResource(client, 'gtd://overview')
    const overviewJson = JSON.parse(overviewResource.text)
    check('read gtd://overview', overviewResource.mimeType === 'application/json'
      && overviewJson.counts.tasks.total === 5)

    const tasksResource = await readResource(client, 'gtd://tasks')
    const tasksJson = JSON.parse(tasksResource.text)
    check('read gtd://tasks excludes done', tasksJson.tasks.length === 3)

    const statusResource = await readResource(client, 'gtd://tasks/next')
    const statusJson = JSON.parse(statusResource.text)
    check('read gtd://tasks/next (template)', statusJson.tasks.length === 1
      && statusJson.tasks[0].id === IDS.taskNext)

    const badStatus = await readResource(client, 'gtd://tasks/bogus')
    check('read gtd://tasks/bogus → plain-text error', badStatus.mimeType === 'text/plain'
      && badStatus.text.includes('Unknown task status'))

    const projectResource = await readResource(client, `gtd://projects/${IDS.project}`)
    check('read gtd://projects/{id} (template)', projectResource.mimeType === 'application/json'
      && JSON.parse(projectResource.text).project.title === 'Launch website')

    const conversationResource = await readResource(client, `gtd://conversations/${IDS.conversation}`)
    check('read gtd://conversations/{id} (template)',
      JSON.parse(conversationResource.text).messages.length === 2)

    const missingConversation = await readResource(client, `gtd://conversations/does-not-exist`)
    check('read unknown conversation → plain-text error', missingConversation.mimeType === 'text/plain')
  } finally {
    await client.close()
  }

  await testHttpMode(fixturePath)
  await removeDir(workDir)

  console.log(`\n${checks - failures.length}/${checks} checks passed`)
  if (failures.length > 0) {
    console.error(`\n${failures.length} FAILURES:`)
    for (const failure of failures) console.error(`  ✗ ${failure}`)
    process.exitCode = 1
  } else {
    console.log('MCP server smoke test PASSED')
  }
}

main().catch((error) => {
  console.error('Smoke test crashed:', error)
  process.exitCode = 1
})
