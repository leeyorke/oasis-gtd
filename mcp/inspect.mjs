#!/usr/bin/env node
/**
 * Prints the MCP tool & resource catalogue of the Oasis GTD server.
 *
 * Usage:
 *   node mcp/inspect.mjs                                    # spawn a stdio server and query it
 *   node mcp/inspect.mjs --http http://127.0.0.1:7800/mcp \
 *                          --token <bearer-token>           # query an already-running endpoint
 *
 * This is the human-readable equivalent of the `initialize` + `tools/list`
 * + `resources/list` + `resources/templates/list` handshake every MCP client
 * performs to discover what the server offers.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const serverEntry = join(repoRoot, 'mcp', 'index.ts')

function parseArgs(argv) {
  const args = { http: null, token: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--http') args.http = argv[i + 1] ?? null
    if (argv[i] === '--token') args.token = argv[i + 1] ?? null
  }
  return args
}

/** Minimal stdio JSON-RPC client (newline-delimited, as the transport requires). */
function createStdioClient() {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child.stdout.setEncoding('utf8')
  child.stderr.resume() // drain logs
  let buffer = ''
  const pending = new Map()
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
      if (line === '') continue
      try {
        const message = JSON.parse(line)
        if (message.id !== undefined && pending.has(message.id)) {
          pending.get(message.id)(message)
          pending.delete(message.id)
        }
      } catch {
        /* ignore non-JSON lines */
      }
    }
  })
  let nextId = 0
  return {
    request(method, params = {}) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 20000)
        pending.set(id, (message) => {
          clearTimeout(timer)
          resolve(message)
        })
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      })
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
    },
    close() {
      child.kill()
    }
  }
}

/** HTTP client for an already-running endpoint (JSON or SSE responses). */
async function httpRequest(url, method, params, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${method} → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  let message
  if (contentType.includes('text/event-stream')) {
    for (const block of text.split('\n\n')) {
      const dataLines = []
      for (const line of block.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length > 0) {
        message = JSON.parse(dataLines.join('\n'))
        break
      }
    }
    if (!message) throw new Error(`no JSON-RPC message in SSE response: ${text.slice(0, 200)}`)
  } else {
    message = JSON.parse(text)
  }
  if (message.error) {
    throw new Error(`${method} → JSON-RPC ${message.error.code}: ${message.error.message}`)
  }
  return message
}

function trim(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function paramNames(schema) {
  const properties = schema?.properties ?? {}
  const required = new Set(schema?.required ?? [])
  return Object.entries(properties)
    .map(([name, spec]) => (required.has(name) ? `${name}*` : name))
    .join(', ')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let close = () => undefined
  let notify = () => undefined
  let request
  if (args.http) {
    // Query an already-running endpoint (no child process needed).
    request = (method, params) => httpRequest(args.http, method, params, args.token)
  } else {
    // Spawn a stdio server and talk to it directly.
    const client = createStdioClient()
    request = async (method, params) => {
      const message = await client.request(method, params)
      if (message.error) {
        throw new Error(`${method} → JSON-RPC ${message.error.code}: ${message.error.message}`)
      }
      return message
    }
    notify = (method, params) => client.notify(method, params)
    close = () => client.close()
  }

  try {
    const init = await request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'mcp-inspect', version: '1.0.0' }
    })
    notify('notifications/initialized')
    const info = init.result?.serverInfo ?? {}
    console.log(`\n  MCP server: ${info.name ?? '?'} v${info.version ?? '?'}  (protocol ${init.result?.protocolVersion ?? '?'})`)

    if (init.result?.instructions) {
      console.log(`\n  ── instructions (what clients hand to the agent) ──`)
      console.log(
        init.result.instructions
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
      )
    }

    const tools = await request('tools/list')
    const toolList = tools.result?.tools ?? []
    console.log(`\n  ── tools (${toolList.length}) ──`)
    for (const tool of toolList) {
      const params = paramNames(tool.inputSchema)
      const flags = [
        tool.annotations?.readOnlyHint ? 'read-only' : null,
        tool.annotations?.destructiveHint ? 'destructive' : null
      ].filter(Boolean)
      console.log(`  • ${tool.name}${flags.length ? `  [${flags.join(', ')}]` : ''}`)
      console.log(`      ${trim(tool.description, 110)}`)
      if (params) console.log(`      params: ${params}`)
    }

    const resources = await request('resources/list')
    const resourceList = resources.result?.resources ?? []
    console.log(`\n  ── resources (${resourceList.length}) ──`)
    for (const resource of resourceList) {
      console.log(`  • ${resource.uri}  — ${trim(resource.name ?? resource.description, 70)}`)
    }

    const templates = await request('resources/templates/list')
    const templateList = templates.result?.resourceTemplates ?? []
    if (templateList.length > 0) {
      console.log(`\n  ── resource templates (${templateList.length}) ──`)
      for (const template of templateList) {
        console.log(`  • ${template.uriTemplate}  — ${trim(template.description, 70)}`)
      }
    }
    console.log('')
  } finally {
    close()
  }
}

main().catch((error) => {
  console.error(`inspect failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
