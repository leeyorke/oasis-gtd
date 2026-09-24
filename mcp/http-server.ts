/**
 * HTTP transport for the Oasis GTD MCP server.
 *
 * Serves BOTH MCP HTTP transports so any client generation can connect:
 *
 *   Streamable HTTP (current spec, stateless):
 *     POST /mcp      JSON-RPC request/response, answered with application/json
 *     HEAD /mcp      liveness probe (curl -I)
 *
 *   Legacy HTTP+SSE (2024-11-05 clients, e.g. older Python MCP SDKs):
 *     GET  /mcp            opens an SSE stream and sends `event: endpoint`
 *                          pointing at POST /messages?sessionId=…
 *     POST /messages       JSON-RPC messages for that SSE session; responses
 *                          stream back over the SSE connection
 *
 *   GET  /health   unauthenticated liveness probe: {"status":"ok"}
 *
 * Security model (deliberately strict):
 *   - Bearer-token auth on every MCP request (OASIS_MCP_TOKEN); the token is
 *     compared in constant time and a missing token refuses to start.
 *   - The database is opened read-only, exactly like the stdio mode.
 *   - Streamable POSTs each run against a fresh server instance, so no session
 *     state (and therefore no other agent's context) is ever shared. Legacy SSE
 *     sessions are per-connection and torn down when the stream closes.
 */
import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { timingSafeEqual } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DatabaseSync } from 'node:sqlite'
import { createServer } from './server.ts'
import type { DbInfo } from './db.ts'

export interface HttpServerOptions {
  /** Shared bearer token. Required — the server refuses to start without it. */
  token: string
  /** Bind address. `0.0.0.0` exposes the server on every interface (LAN). */
  host: string
  /** TCP port to listen on. */
  port: number
}

export interface RunningHttpServer {
  /** Base URL of the MCP endpoint, e.g. http://192.168.1.10:7800/mcp */
  url: string
  /** All reachable base URLs (loopback + LAN addresses), for logging. */
  urls: string[]
  close: () => Promise<void>
}

const MAX_BODY_BYTES = 1024 * 1024
const MCP_PATH = '/mcp'
/** Where legacy SSE clients POST their JSON-RPC messages. */
const SSE_MESSAGES_PATH = '/messages'

/** Live legacy-SSE sessions: sessionId → transport + its server instance. */
const sseSessions = new Map<string, { transport: SSEServerTransport; server: McpServer }>()

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, mcp-session-id, mcp-protocol-version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version'
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...CORS_HEADERS
  })
  res.end(payload)
}

function lanAddresses(): string[] {
  const addresses: string[] = []
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address)
    }
  }
  return addresses
}

/**
 * Handles one POST/GET/DELETE on /mcp with a fresh, stateless server instance.
 */
async function handleMcpRequest(
  db: DatabaseSync,
  info: DbInfo,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const declaredLength = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    sendJson(res, 413, {
      jsonrpc: '2.0',
      error: { code: -32600, message: `Request body too large (max ${MAX_BODY_BYTES} bytes)` },
      id: null
    })
    return
  }

  const server = createServer(db, info)
  const transport = new StreamableHTTPServerTransport({
    // Stateless mode: no session ids, no shared state between requests.
    sessionIdGenerator: undefined,
    // This endpoint is request/response only (stateless — there is nothing to
    // attach server-initiated notifications to), so answer POSTs with plain
    // application/json instead of an SSE stream. Both are spec-legal, but JSON
    // is what simple/non-MCP HTTP clients can actually parse.
    enableJsonResponse: true
  })

  let cleanedUp = false
  const cleanup = (): void => {
    if (cleanedUp) return
    cleanedUp = true
    void server.close().catch(() => undefined)
    void transport.close().catch(() => undefined)
  }
  res.on('close', cleanup)

  // Leniency for non-compliant clients: the spec requires the Accept header to
  // list both application/json and text/event-stream (otherwise the transport
  // answers 406), but some clients send only application/json. Since we answer
  // POSTs with JSON anyway (enableJsonResponse), widen the header instead of
  // rejecting — the response format never changes, only the error disappears.
  if (req.method === 'POST') {
    const accept = String(req.headers['accept'] ?? '')
    if (accept.includes('application/json') && !accept.includes('text/event-stream')) {
      req.headers['accept'] = 'application/json, text/event-stream'
    }
  }

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[oasis-gtd-mcp] /mcp request failed: ${detail}`)
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      })
    }
    cleanup()
  }
}

export async function startHttpServer(
  db: DatabaseSync,
  info: DbInfo,
  options: HttpServerOptions
): Promise<RunningHttpServer> {
  const httpServer = createHttpServer((req, res) => {
    void route(db, info, req, res, options)
  })

  // TCP-level trace: distinguishes "connection never arrived" (client-side
  // network/proxy/SSRF problem) from "arrived but no HTTP request followed".
  httpServer.on('connection', (socket) => {
    const peer = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? '?'}`
    console.error(`[mcp-http] tcp connect from ${peer}`)
    socket.on('close', () => console.error(`[mcp-http] tcp close    from ${peer}`))
    socket.on('error', (err) => console.error(`[mcp-http] tcp error   from ${peer}: ${err.message}`))
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(options.port, options.host, () => {
      httpServer.removeListener('error', reject)
      resolve()
    })
  })

  const address = httpServer.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : options.port
  const base = (host: string): string => `http://${host}:${boundPort}${MCP_PATH}`
  const hosts = ['127.0.0.1', ...lanAddresses()]
  const urls = hosts.map(base)

  console.error(
    `[oasis-gtd-mcp] HTTP transport listening on ${options.host}:${boundPort} (token auth required)`
  )
  for (const url of urls) console.error(`[oasis-gtd-mcp]   ${url}`)

  return {
    url: base('127.0.0.1'),
    urls,
    close: async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      db.close()
    }
  }
}

async function route(
  db: DatabaseSync,
  info: DbInfo,
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpServerOptions
): Promise<void> {
  const startedAt = Date.now()
  // Normalize the path so "/mcp" and "/mcp/" are the same endpoint (obsidian's
  // MCP URL, for example, carries a trailing slash — strict matching here
  // would 404 a client that merely copied that style).
  const path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/'

  // Request log for everything except the unauthenticated /health probe (the
  // bearer token itself is never logged). This is what you check when a client
  // reports it cannot connect: no TCP/HTTP line at all means the request never
  // reached us (proxy/firewall); "auth=missing" means no token was sent.
  if (path !== '/health') {
    const hasAuth = typeof req.headers['authorization'] === 'string'
    res.on('finish', () => {
      console.error(
        `[mcp-http] ${req.method ?? '?'} ${path} auth=${hasAuth ? 'provided' : 'missing'} ` +
          `ua="${String(req.headers['user-agent'] ?? '').slice(0, 60)}" ` +
          `→ ${res.statusCode} (${Date.now() - startedAt}ms)`
      )
    })
  }

  // CORS preflight (browser-based MCP clients)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Max-Age': '86400',
      ...CORS_HEADERS
    })
    res.end()
    return
  }

  // Liveness probe — deliberately unauthenticated and reveals nothing about the data.
  if (path === '/health') {
    sendJson(res, 200, { status: 'ok', service: 'oasis-gtd-mcp' })
    return
  }

  // Everything else requires the bearer token.
  const header = req.headers['authorization']
  const provided = Array.isArray(header) ? (header[0] ?? '') : (header ?? '')
  if (!safeEqual(provided, `Bearer ${options.token}`)) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="oasis-gtd-mcp"',
      ...CORS_HEADERS
    })
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: missing or invalid bearer token' },
        id: null
      })
    )
    return
  }

  if (path !== MCP_PATH && !(path === SSE_MESSAGES_PATH && req.method === 'POST')) {
    sendJson(res, 404, { error: `Not found. Use ${MCP_PATH}` })
    return
  }

  // Liveness probe for the endpoint itself (e.g. `curl -I`).
  if (path === MCP_PATH && req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Length': '0',
      Allow: 'GET, POST, DELETE',
      ...CORS_HEADERS
    })
    res.end()
    return
  }

  // ── Legacy HTTP+SSE transport (older MCP clients) ─────────────────────────
  // GET /mcp opens an SSE stream; the SDK immediately sends the `endpoint`
  // event pointing the client at POST /messages?sessionId=… . JSON-RPC
  // requests then arrive on that endpoint and responses stream back over the
  // SSE connection. One server instance per connection, torn down on close.
  if (path === MCP_PATH && req.method === 'GET') {
    await handleSseHandshake(db, info, req, res)
    return
  }

  if (path === SSE_MESSAGES_PATH && req.method === 'POST') {
    await handleSseMessage(req, res)
    return
  }

  await handleMcpRequest(db, info, req, res)
}

async function handleSseHandshake(
  db: DatabaseSync,
  info: DbInfo,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const transport = new SSEServerTransport(SSE_MESSAGES_PATH, res)
  const server = createServer(db, info)
  const sessionId = transport.sessionId
  sseSessions.set(sessionId, { transport, server })

  const teardown = (): void => {
    if (sseSessions.get(sessionId)?.transport === transport) {
      sseSessions.delete(sessionId)
    }
    void server.close().catch(() => undefined)
    void transport.close().catch(() => undefined)
  }
  res.on('close', teardown)

  try {
    // connect() starts the transport, which writes the SSE headers and the
    // `endpoint` event the legacy client waits for.
    await server.connect(transport)
    console.error(`[mcp-http] SSE session opened: ${sessionId} (${sseSessions.size} active)`)
  } catch (error) {
    teardown()
    throw error
  }
}

async function handleSseMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId') ?? ''
  const session = sseSessions.get(sessionId)
  if (!session) {
    sendJson(res, 404, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unknown or expired SSE session. Re-open GET /mcp.' },
      id: null
    })
    return
  }
  try {
    await session.transport.handlePostMessage(req, res)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[mcp-http] SSE message failed: ${detail}`)
    if (!res.headersSent) {
      sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: detail }, id: null })
    }
  }
}
