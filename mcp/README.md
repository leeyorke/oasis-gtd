# Oasis GTD — MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets **other agents read the Oasis GTD app's
data** — tasks, projects, waiting-for items, someday items, notes, habits, AI chat history,
reference resources and the weekly review checklist.

The server is **strictly read-only** and runs as a standalone process over stdio. It talks directly
to the same SQLite database file the desktop app uses, so any data written by the running app is
visible immediately. The Electron app itself is never started, blocked or modified.

```
agent / MCP client  ──stdin/stdout (JSON-RPC)──►  mcp/index.ts  ──SELECT──►  %APPDATA%\oasis-gtd\oasis-gtd.db
```

## Requirements

- **Node.js ≥ 22.18** — the server runs TypeScript directly via Node's built-in type stripping
  (`node mcp/index.ts`), no build step, no native modules. On Node 22.6–22.17 use
  `node --experimental-strip-types mcp/index.ts`. The MCP SDK itself supports Node ≥ 18.
- The database is created by the app on first launch. If the app has never run, the server exits
  with an error listing the paths it searched.

## Quick start

```bash
# from the repository root
npm install       # once (installs @modelcontextprotocol/sdk as a devDependency)
npm run mcp       # start the server on stdio
npm run test:mcp  # 95-assertion end-to-end smoke test (fixture DB + tool/resource + HTTP sweep)
                  # + app-spawn.mjs (14 assertions: app-managed spawn, packaged bundle, lifecycle)
```

The repository already registers the server for Claude Code-style clients in
[`.mcp.json`](../.mcp.json), so any project-scoped agent in this repo can use it immediately:

```json
{
  "mcpServers": {
    "oasis-gtd": { "command": "node", "args": ["mcp/index.ts"] }
  }
}
```

### Connecting from other MCP clients

Any MCP client can spawn the server. Generic config:

```json
{
  "mcpServers": {
    "oasis-gtd": {
      "command": "node",
      "args": ["D:\\path\\to\\oasis-gtd\\mcp\\index.ts"]
    }
  }
}
```

Or with the Claude Code CLI (user scope, available in every project):

```bash
claude mcp add oasis-gtd -- node D:/path/to/oasis-gtd/mcp/index.ts
```

## HTTP / network mode (LAN)

Stdio requires the agent to spawn the server locally. For agents on **other machines**, start the
server in HTTP mode — it speaks the MCP **Streamable HTTP** transport on `POST /mcp`:

```bash
# token is REQUIRED in HTTP mode; host/port are configurable
OASIS_MCP_TOKEN=my-secret-token node mcp/index.ts --http
# → listening on 0.0.0.0:7800, logs every reachable URL:
#   http://192.168.31.70:7800/mcp   (LAN)
#   http://127.0.0.1:7800/mcp       (loopback)
```

### Environment variables (HTTP mode)

| Variable | Default | Meaning |
|----------|---------|---------|
| `OASIS_MCP_TRANSPORT` | `stdio` | Set to `http` instead of passing `--http`. |
| `OASIS_MCP_TOKEN` | — | **Required.** Bearer token every request must send (`Authorization: Bearer <token>`). Missing → server refuses to start. |
| `OASIS_MCP_HOST` | `0.0.0.0` | Bind address. `127.0.0.1` limits to this machine; `0.0.0.0` exposes on every interface (LAN). |
| `OASIS_MCP_PORT` | `7800` | TCP port. |
| `OASIS_DB_PATH` / `OASIS_PROFILE` | auto | Same database selection as stdio mode. |

### Raw HTTP call (curl)

Note the required `Accept` header — the MCP spec mandates it and the transport answers `406`
without it:

```bash
curl http://192.168.31.70:7800/mcp \
  -H "Authorization: Bearer my-secret-token" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Then POST `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, or
`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_overview","arguments":{}}}`.
Because this endpoint is stateless (no server-initiated notifications), POST
responses come back as plain `application/json` — no SSE parsing needed.

Client-compatibility notes (learned from real-world agents):

- `/mcp` and `/mcp/` are the same endpoint (trailing slash is normalized).
- The `Accept` header is lenient: a client sending only `application/json`
  (instead of the spec-mandated `application/json, text/event-stream`) still
  gets a `200` JSON response instead of `406`, since JSON is what we answer
  with anyway.

### MCP client config (URL transport)

```json
{
  "mcpServers": {
    "oasis-gtd-http": {
      "type": "http",
      "url": "http://192.168.31.70:7800/mcp",
      "headers": { "Authorization": "Bearer my-secret-token" }
    }
  }
}
```

### HTTP endpoints

Both MCP HTTP transports are served, so modern and older clients both work:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /mcp` | Bearer | JSON-RPC — **Streamable HTTP** (current spec): `initialize`, `tools/list`, `tools/call`, `resources/*` — answered with `application/json` |
| `GET /mcp` | Bearer | **Legacy HTTP+SSE** handshake: opens a `text/event-stream` and immediately sends `event: endpoint` pointing at `POST /messages?sessionId=…` |
| `POST /messages` | Bearer | Legacy SSE JSON-RPC messages; responses stream back over the SSE connection |
| `DELETE /mcp` | Bearer | Session termination (no-op in stateless mode) |
| `HEAD /mcp` | Bearer | Liveness probe (`curl -I`) → 200 + `Allow: GET, POST, DELETE` |
| `GET /health` | none | Liveness probe: `{"status":"ok","service":"oasis-gtd-mcp"}` — reveals nothing about the data |
| `OPTIONS /mcp` | none | CORS preflight |

Client config guidance: prefer the URL transport (`POST /mcp` — plain JSON, no
SSE parsing). Clients built on older MCP SDKs (e.g. early Python `sse_client`)
work as-is through the legacy handshake above.

### Discovering the tools

Tool discovery is built into the protocol: after `initialize`, every MCP client
calls `tools/list` and receives all 18 tools (name, description, JSON-Schema
parameters) plus `resources/list` / `resources/templates/list`. The
`initialize` response also carries an **instructions** block that the client
hands to the agent — it documents the GTD data model and tells the agent to call
`get_overview` first. Claude Code-style clients do all of this automatically and
expose the tools as `mcp__oasis-gtd__*`.

To inspect the catalogue yourself:

```bash
npm run mcp:inspect                                    # spawn a stdio server, print everything
node mcp/inspect.mjs --http http://192.168.31.70:7800/mcp --token <token>   # query a running endpoint
```

It prints the server info + instructions, every tool with its description /
parameters / read-only flag, and all resources and resource templates.

For non-MCP HTTP clients, do the same handshake by hand:

```bash
curl -X POST http://192.168.31.70:7800/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## HTTP security model

- Stateless: each request runs against a fresh server instance, so no session state (and no other
  agent's context) is ever shared between connections.
- Bearer token compared in constant time; without `OASIS_MCP_TOKEN` the server refuses to start.
- The database is opened **read-only**, exactly like stdio mode — the network exposes nothing the
  stdio server could not read.
- `0.0.0.0` means every interface, i.e. anyone on the LAN with the token can read the user's GTD
  data. Keep the token secret; use `OASIS_MCP_HOST=127.0.0.1` when only local agents need it.
- Request bodies are capped at 1 MB.

## App-managed mode (automatic start/stop)

The desktop app runs the HTTP endpoint **as a child process of itself**:

- **Starts** on app launch, right after the database is initialized
  (`mcpController.start()` in `src/main/index.ts`).
- **Stops** when the user actually quits (tray → 退出, `before-quit`). Minimising
  to the tray keeps the service running — agents can keep reading while the app
  is hidden.
- **Dev** spawns `node mcp/index.ts --http` from the repo; **packaged builds**
  spawn `node resources/mcp/server.cjs --http` — a self-contained esbuild bundle
  (`npm run build` → `scripts/build-mcp.mjs`) shipped via electron-builder
  `extraResources`, so no node_modules is needed on the target machine.

### Settings → MCP (in-app control)

The Settings view has an **MCP Agent** section showing live status and a runtime
toggle (no app restart needed):

- **Status dot** — green `Running · :<port>` when the child process is alive;
  grey `Stopped` otherwise, including start failures (the reason is shown).
- **On / Off toggle** — persists to `app_settings.mcp_http_enabled` and starts
  or kills the service immediately.
- **Endpoint URLs** — loopback + every LAN address, each with a copy button.
- **Bearer token** — the value to hand to agents, with a copy button.
- **Database** — the exact file the endpoint is serving.

Backed by the `mcp:getState` / `mcp:setEnabled` IPC handlers in
`src/main/ipc/handlers.ts`, served by the shared controller in
`src/main/mcp-controller.ts`.

### Settings keys (app_settings)

| Key | Default | Meaning |
|-----|---------|---------|
| `mcp_http_enabled` | enabled | The Settings toggle; `0` means the service stays off |
| `mcp_http_port` | `7800` | Port for the endpoint (applied at start) |
| `mcp_http_token` | auto-generated | Bearer token (base64url, 24 random bytes). Generated on first launch and kept stable across restarts. Shown in Settings → MCP and in the app log at every launch |

The exact database file the app uses is passed to the server (`OASIS_DB_PATH`),
so agents always see the same data as the app — live, read-only.

Only one endpoint can run per machine: the controller kills any child left over
from a main-process reload (electron-vite dev re-evaluates the main entry on
rebuilds) and refuses to spawn when another process already listens on the port
— so a second app instance never leads to two servers fighting over the port.

Requirements / failure modes (all non-fatal — the app keeps running):

- The **system Node** must be ≥ 22.5 and on `PATH` (Electron's bundled Node 20
  lacks `node:sqlite`, which is why the server is a separate process). Missing
  node → Settings shows `Start failed: … (is Node.js installed and on PATH?)`.
- Port already in use (e.g. a second app instance) → the child exits and the
  error is surfaced in the Settings section; the first instance keeps serving.
- `stdio` mode is unaffected: it stays per-client spawn, independent of the app.

The stdio section below still applies to local MCP clients (`.mcp.json`).

## Configuration

| Variable         | Values                | Default | Meaning |
|------------------|-----------------------|---------|---------|
| `OASIS_DB_PATH`  | file path             | auto    | Explicit path to the `oasis-gtd*.db` SQLite file. Wins over auto-detection. |
| `OASIS_PROFILE`  | `dev` \| `packaged`   | auto    | Force which database to serve when both a dev and a packaged database exist. |

Auto-detection probes the Electron userData directory for `oasis-gtd` (dev, `oasis-gtd-dev.db`)
and `Oasis GTD` (packaged, `oasis-gtd.db`) — on Windows/macOS/Linux respectively — and prefers the
most recently active database (a running app keeps writing to its `-wal` sidecar, so the live
profile sorts first). `get_db_info` always reports which file is being served.

## What agents can read

### Tools

| Tool | Purpose |
|------|---------|
| `get_overview` | Whole-system snapshot: counts per task status, attention items (overdue, due today, inbox size, stale waiting-for), recent activity, `@context` list, database info. **Start here.** |
| `get_db_info` | Which database file is served (path, profile, read-only mode, schema version, size) and row counts per table. |
| `list_tasks` | Tasks with filters: `status`, `project_id`, `priority`, `context`, `query`, `due_before`, `exclude_done`, `order`, `limit`, `offset`. |

Task statuses: `inbox` (unprocessed captures), `next` (next action), `waiting` (delegated/blocked),
`someday`, `done`, and `archive` (closed and hidden — the app's Archive view). `exclude_done` hides
both `done` and `archive`.| `get_task` | One task by UUID. |
| `search_tasks` | Keyword search across titles, notes, waiting-for names. |
| `list_projects` | Projects with open/total task counts. |
| `get_project` | One project with its tasks and waiting-for items. |
| `list_waiting_items` | Delegated/blocked items, oldest first (the chase list). |
| `list_someday_items` | Future ideas by horizon (`soon`→`someday`). |
| `list_notes` / `search_notes` | Quick notes, tag filter and keyword search. |
| `list_habits` / `get_habit` | Habits with today's check-ins; check-in records for the last N days. |
| `list_conversations` / `get_conversation` | The user's in-app AI chat history with message counts and full messages. |
| `list_resources` | Reference material (documents, links, spreadsheets, …). |
| `get_review_checklist` | Weekly review checklist with completion state. |
| `export_gtd_data` | Full JSON export of all GTD collections (optionally including chat messages). |

### Resources

Static: `gtd://overview`, `gtd://tasks`, `gtd://projects`, `gtd://waiting-items`,
`gtd://someday-items`, `gtd://notes`, `gtd://habits`, `gtd://resources`, `gtd://conversations`,
`gtd://review-checklist`

Templated: `gtd://tasks/{status}`, `gtd://projects/{id}`, `gtd://conversations/{id}`

## How it works

- **Schema source of truth:** `src/main/db/database.ts`. The MCP layer re-uses the same table
  definitions; column names are returned verbatim (snake_case) so agents see the app's own model.
- **Concurrency:** the app opens SQLite in WAL mode, so external readers can read while the app
  runs. The server opens the file read-only whenever possible (falling back to a read-write handle
  only when WAL sidecars prevent a read-only open — and even then it executes SELECT statements
  only; `db.ts` rejects any non-`SELECT` statement before it reaches SQLite).
- **No build step:** TypeScript runs directly on Node (type stripping). `mcp/package.json` declares
  `"type": "module"` for this subdirectory only — the Electron app build in `out/` is untouched.
- **Local only:** the server speaks stdio and binds no ports; every agent that connects does so
  through its own MCP client on this machine.

## Security notes

- Read-only by construction: every tool advertises `readOnlyHint`, and `db.ts` validates each
  statement is a `SELECT` (or a benign informational PRAGMA).
- **`ai_providers` (API keys) and `app_settings` are intentionally not exposed** — no tool or
  resource can read them, and the smoke test asserts a planted secret never leaks.
- The server exposes the user's personal data (tasks, notes, chat history) to whatever MCP client
  connects. Only register it with clients you trust.

## Files

```
mcp/
├── index.ts          # entry point (stdio or --http transport, env config, logging to stderr only)
├── http-server.ts    # Streamable HTTP transport: bearer auth, CORS, /health, stateless per-request
├── server.ts         # McpServer identity + agent instructions
├── tools.ts          # 18 read-only tools (zod-validated inputs)
├── resources.ts      # static + templated resources
├── data.ts           # all SQL queries (the data access layer)
├── db.ts             # database resolution, read-only open, statement whitelisting
├── types/sqlite.d.ts # ambient typings for Node's built-in node:sqlite
├── test/smoke.mjs    # end-to-end smoke test (fixture DB, stdio JSON-RPC + HTTP, 95 assertions)
├── test/app-spawn.mjs # app-managed spawn test (bundle + src/main/mcp-http.ts wiring, 14 assertions)
└── tsconfig.json     # editor / `tsc --noEmit` support (no emit — Node runs the TS directly)
```

## Troubleshooting

Every request on `/mcp` is logged to stderr (never the token itself), so when a
client cannot connect, check the app/dev log for `[mcp-http]` lines:

| Log line | Meaning | Fix |
|----------|---------|-----|
| *(no `tcp connect` line at all)* | The client's connection never reached the server | **Windows:** the firewall blocks unlisted inbound ports — check `netsh advfirewall firewall show rule name=all dir=in` for an Allow rule on your port and add one from an **admin** PowerShell: `New-NetFirewallRule -DisplayName "Oasis MCP" -Direction Inbound -Protocol TCP -LocalPort 7800 -Action Allow`. Curl working while the agent fails is the classic symptom: curl goes through a proxy (e.g. `http_proxy=127.0.0.1:7890`) that connects locally, while the agent connects directly. Also check `HTTP_PROXY`/`ALL_PROXY` env on the client machine. |
| `tcp connect` but no request line | TCP arrived, but no HTTP request followed (or the client hung) | Client-side HTTP stack issue; capture what it sends. |
| `POST /mcp auth=missing … → 401` | The client did not send `Authorization: Bearer …` | Add the token header to the client's MCP config (e.g. `"headers": {"Authorization": "Bearer <token>"}`). |
| `POST /mcp auth=provided … → 401` | Wrong token | Compare with the token in Settings → MCP. |
| `SSE session opened: …` | A legacy client is connected through the HTTP+SSE path | Working as intended; watch for `POST /messages auth=missing → 401` if it stalls there. |

Every TCP connection (`tcp connect from <ip>:<port>` / `tcp close` / `tcp error`) and every
HTTP request on any path is logged, so a client that reports "unreachable" can always be
traced to network layer, HTTP layer, or auth layer.

| Symptom | Cause / fix |
|---------|-------------|
| `Could not find an Oasis GTD database` | The app has never run on this profile, or the DB lives elsewhere — set `OASIS_DB_PATH`. |
| `SyntaxError: Invalid or unexpected token` / type errors at startup | Node too old. Use Node ≥ 22.18 (or `node --experimental-strip-types`). |
| Serves the wrong database | Both `oasis-gtd-dev.db` and `oasis-gtd.db` exist; pin one with `OASIS_PROFILE=dev\|packaged` or `OASIS_DB_PATH`. |
| `unable to open database file` | Read-only WAL open needs the `-shm` sidecar; the server retries with a read-write handle. If both fail, the file is locked or missing. |
| `405 Method Not Allowed` on `curl -I` | HEAD is a probe only; real calls are POST (see above). |
| `406 Not Acceptable` on POST | `Accept` must list both types: `application/json, text/event-stream`. |

## Extending

1. Add a query function to `mcp/data.ts` (SELECT only).
2. Register a tool in `mcp/tools.ts` (`server.registerTool(...)`) or a resource in `mcp/resources.ts`.
3. Add coverage to `mcp/test/smoke.mjs` and run `npm run test:mcp`.
