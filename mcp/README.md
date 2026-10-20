# Oasis GTD — MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets **other agents read and write the Oasis
GTD app's data** — tasks, projects, waiting-for items, someday items, notes (随想), habits, AI chat
history, reference resources and the weekly review checklist.

The server runs as a standalone process over stdio. It talks directly to the same SQLite database
file the desktop app uses, so any data written by the running app is visible immediately, and — with
write access enabled — anything an agent files is picked up by the app on its next refresh. The
Electron app itself is never started, blocked or modified.

```
agent / MCP client  ──stdin/stdout (JSON-RPC)──►  mcp/index.ts  ──SQL──►  %APPDATA%\oasis-gtd\oasis-gtd.db
```

**Write access** is a switch, not a build flag:

| Transport | Default | How to change it |
|-----------|---------|------------------|
| stdio (local agent) | **writes enabled** | `OASIS_MCP_WRITE=0` disables them |
| http (LAN endpoint) | **writes disabled** | `OASIS_MCP_WRITE=1` enables them — the desktop app does this when you turn on "Write access" in Settings → MCP |

With writes disabled the write tools stay registered but answer with a clear
`Write operations are disabled …` error, so an agent never gets a confusing "unknown tool".

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
npm run test:mcp  # 167-assertion end-to-end smoke test (fixture DB + tool/resource + HTTP sweep)
                  # + app-spawn.mjs (46 assertions: app-managed spawn, packaged bundle, lifecycle)
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
calls `tools/list` and receives all 34 tools (19 read + 15 write; name, description,
JSON-Schema parameters) plus `resources/list` / `resources/templates/list`. The
`initialize` response also carries an **instructions** block that the client
hands to the agent — it documents the GTD data model, tells the agent to call
`get_overview` first, and states whether writing is enabled on this server.
Claude Code-style clients do all of this automatically and expose the tools as
`mcp__oasis-gtd__*`.

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
- The database is opened **read-only** unless write access is enabled — the network exposes nothing
  the stdio server could not read, and nothing more.
- `0.0.0.0` means every interface, i.e. anyone on the LAN with the token can read the user's GTD
  data — and, with write access on, change it. Keep the token secret; use
  `OASIS_MCP_HOST=127.0.0.1` when only local agents need it.
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
- **Write access toggle** — persists to `app_settings.mcp_allow_write` and restarts
  the endpoint so the change takes effect immediately. On = agents may file
  thoughts/tasks and edit or delete GTD data; off = read-only endpoint.
- **Endpoint URLs** — loopback + every LAN address, each with a copy button.
- **Bearer token** — the value to hand to agents, with a copy button.
- **Database** — the exact file the endpoint is serving.

Backed by the `mcp:getState` / `mcp:setEnabled` / `mcp:setAllowWrite` IPC handlers
in `src/main/ipc/handlers.ts`, served by the shared controller in
`src/main/mcp-controller.ts`.

### Settings keys (app_settings)

| Key | Default | Meaning |
|-----|---------|---------|
| `mcp_http_enabled` | enabled | The Settings toggle; `0` means the service stays off |
| `mcp_http_port` | `7800` packaged / `7801` dev | Port for the endpoint. Dev builds default to 7801 so a dev app and an installed build can run side by side |
| `mcp_http_token` | auto-generated | Bearer token (base64url, 24 random bytes). Generated on first launch and kept stable across restarts |
| `mcp_http_node_path` | auto-detected | Absolute path to the system Node.js (≥ 22.5) runtime. Auto-resolved (PATH → registry → common install locations); set this when detection picks the wrong node or finds none |
| `mcp_allow_write` | enabled | Whether agents may create/change/delete data through the endpoint. Passed to the child as `OASIS_MCP_WRITE`; flipping it restarts the endpoint |

> **The token is per-profile.** `npm run dev` and the packaged build use *different*
> databases (`oasis-gtd-dev.db` vs `oasis-gtd.db`), so each has its own
> `mcp_http_token`. Always copy the token from the app you are actually running
> (Settings → MCP → Bearer Token, or its startup log) — reusing the dev token
> against a packaged app (or vice versa) yields `401 Unauthorized`.

The system Node runtime is resolved explicitly — a **packaged app launched from
Explorer does not inherit the shell's PATH** (the classic `spawn node ENOENT`
failure with version-manager installs such as nvm/nvm4w), and `existsSync`
passing does not mean `CreateProcess` can launch the file. The resolver therefore
probes PATH → the Windows registry (fresh even for long-running desktop
sessions) → common install roots → each candidate's realpath (nvm4w symlinks),
**verifies every candidate by actually running it** (`node -v`), and at spawn
time retries the next candidate when one fails to launch (synchronous throws
included). The resolved path is shown in Settings → MCP. Two further gotchas
that bit in production and are handled here: the child is spawned **without a
`cwd`** (a packaged app's `__dirname` lives inside `app.asar` — a file — and a
cwd that is not a directory makes CreateProcess fail with an ENOENT that blames
node.exe), and a pinned `mcp_http_node_path` is a *preference*, not a hard
requirement: if it cannot be launched, auto-discovery takes over.

The exact database file the app uses is passed to the server (`OASIS_DB_PATH`),
so agents always see the same data as the app — live.

The app polls a cheap signature of the GTD tables every few seconds and reloads
its lists when it moves, so anything an agent files shows up in the app within
seconds (and immediately when the window regains focus).

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
| `OASIS_MCP_WRITE`| `1` \| `0`            | stdio: `1`, http: `0` | Whether the write tools may modify the database. `1/true/yes/on` enables, `0/false/no/off` disables. |
| `OASIS_MCP_TOKEN`| any string            | —       | Bearer token; required in HTTP mode. |
| `OASIS_MCP_HOST` | host / IP             | `0.0.0.0` | Bind address in HTTP mode. Use `127.0.0.1` for a loopback-only endpoint. |
| `OASIS_MCP_PORT` | `1`–`65535`           | `7800`  | TCP port in HTTP mode. |

Auto-detection probes the Electron userData directory for `oasis-gtd` (dev, `oasis-gtd-dev.db`)
and `Oasis GTD` (packaged, `oasis-gtd.db`) — on Windows/macOS/Linux respectively — and prefers the
most recently active database (a running app keeps writing to its `-wal` sidecar, so the live
profile sorts first). `get_db_info` always reports which file is being served.

## What agents can read

### Tools

| Tool | Purpose |
|------|---------|
| `get_overview` | Whole-system snapshot: counts per task status, attention items (overdue, due today, inbox size, stale waiting-for), recent activity, `@context` list, database info. **Start here.** |
| `get_db_info` | Which database file is served (path, profile, open mode, schema version, size) and row counts per table. |
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

## What agents can write

Available when write access is enabled (see the switch at the top of this file).
Every write answers with `{ action, entity, id, record }` — the row as it now
exists in the database — so the agent can report exactly what was filed.

| Tool | Purpose |
|------|---------|
| `capture_item` | **The one to reach for.** Routes one thought by `target`: `note` → 随想, `inbox`/`next`/`waiting`/`someday` → a task in that GTD bucket, `project`, `waiting_item` (needs `waiting_for`), `someday_item` (needs `horizon`). |
| `create_note` / `update_note` / `delete_note` | 随想: content, tags (array), weather. |
| `create_task` / `update_task` / `delete_task` | Tasks: title, status, notes, `@context`, due date, priority, `waiting_for`, project. |
| `create_project` / `update_project` / `delete_project` | Projects: title, description, outcome, status. Deleting detaches the project's tasks and waiting items instead of orphaning them. |
| `create_waiting_item` / `delete_waiting_item` | Delegated items: title, `waiting_for`, `since`, project, notes. |
| `create_someday_item` / `update_someday_item` / `delete_someday_item` | Someday/maybe ideas: title, notes, horizon, category. |

Details worth knowing:

- **Projects by title.** `create_task` / `capture_item` accept `project_id` (UUID) *or*
  `project` (title, matched case-insensitively). An ambiguous title is an error — the
  message lists the candidates.
- **Partial updates.** Only the fields you pass are changed.
- **Validation mirrors the app.** `status`, `priority` and `horizon` are checked against the
  app's own `CHECK` constraints; a `waiting` task without `waiting_for` is refused; dates are
  normalised to `YYYY-MM-DD`.
- **Deletes are permanent.** They are marked `destructiveHint: true`, so a well-behaved client
  asks the user first.
- **Transactions.** Multi-step changes (e.g. deleting a project) run inside one transaction —
  a failure never leaves half a change behind.
- **`ai_providers` and `app_settings` are never writable** — API keys and configuration stay
  out of reach.

## How it works

- **Schema source of truth:** `src/main/db/database.ts`. The MCP layer re-uses the same table
  definitions; column names are returned verbatim (snake_case) so agents see the app's own model.
- **Concurrency:** the app opens SQLite in WAL mode, so external readers can read while the app
  runs — and an external writer can write, too. In read mode the server opens the file read-only
  whenever possible (falling back to a read-write handle only when WAL sidecars prevent a
  read-only open — and even then it executes SELECT statements only; `db.ts` rejects any
  non-`SELECT` statement before it reaches SQLite). In write mode it opens read-write, sets
  `busy_timeout` (so the app's short transactions are waited for, not failed on), keeps WAL and
  turns foreign keys on.
- **No build step:** TypeScript runs directly on Node (type stripping). `mcp/package.json` declares
  `"type": "module"` for this subdirectory only — the Electron app build in `out/` is untouched.
- **Local only:** the server speaks stdio and binds no ports; every agent that connects does so
  through its own MCP client on this machine.

## Security notes

- The read path is read-only by construction: every read tool advertises `readOnlyHint`, and
  `db.ts` validates each statement is a `SELECT` (or a benign informational PRAGMA).
- The write path is opt-in per server (see the switch at the top of this file) and narrow:
  only the GTD tables are writable, every statement is parameterised, updates touch whitelisted
  columns only, and `ai_providers` / `app_settings` are never writable.
- **`ai_providers` (API keys) and `app_settings` are intentionally not exposed** — no tool or
  resource can read them, and the smoke test asserts a planted secret never leaks.
- The server exposes the user's personal data (tasks, notes, chat history) to whatever MCP client
  connects — and, with write access on, lets it change that data. Only register it with clients
  you trust, and keep the bearer token secret.

## Files

```
mcp/
├── index.ts          # entry point (stdio or --http transport, env config, logging to stderr only)
├── http-server.ts    # Streamable HTTP transport: bearer auth, CORS, /health, stateless per-request
├── server.ts         # McpServer identity + agent instructions
├── tools.ts          # 34 tools (19 read + 15 write, zod-validated inputs)
├── resources.ts      # static + templated resources
├── data.ts           # all read queries (the data access layer)
├── write.ts          # all write operations (validation, transactions, whitelisted columns)
├── db.ts             # database resolution, read-only/read-write open, statement whitelisting
├── types/sqlite.d.ts # ambient typings for Node's built-in node:sqlite
├── test/smoke.mjs    # end-to-end smoke test (fixture DB, stdio JSON-RPC + HTTP + writes, 167 assertions)
├── test/app-spawn.mjs # app-managed spawn test (bundle + src/main/mcp-http.ts wiring, 46 assertions)
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
| `spawn <path> ENOENT` in the packaged build | Historically caused by the child being spawned with `cwd` pointing inside `app.asar` (a file, not a directory) — CreateProcess then reports ENOENT against node.exe. Fixed by not passing a cwd. If you still see it: the error names the runtime that could not be launched, each attempt is logged (`could not launch …`), and the resolver retries the remaining candidates. Pin a known-good absolute path with `app_settings.mcp_http_node_path` (e.g. the real version directory of an nvm install) if you want to force one. |
| `failed to start any node runtime. Attempts: …` | Every candidate failed to launch — the log lists each attempt and its error. Usually a broken pin, an antivirus blocking node.exe, or permissions. |
| `Node.js >= 22.5 was not found` | No usable node on PATH, in the registry, or in common install locations — install Node.js ≥ 22.5 or pin `app_settings.mcp_http_node_path`. |
| `SyntaxError: Invalid or unexpected token` / type errors at startup | Node too old. Use Node ≥ 22.18 (or `node --experimental-strip-types`). |
| Serves the wrong database | Both `oasis-gtd-dev.db` and `oasis-gtd.db` exist; pin one with `OASIS_PROFILE=dev\|packaged` or `OASIS_DB_PATH`. |
| `unable to open database file` | Read-only WAL open needs the `-shm` sidecar; the server retries with a read-write handle. If both fail, the file is locked or missing. |
| `405 Method Not Allowed` on `curl -I` | HEAD is a probe only; real calls are POST (see above). |
| `406 Not Acceptable` on POST | `Accept` must list both types: `application/json, text/event-stream`. |

## Extending

1. Add a read query function to `mcp/data.ts` (SELECT only) or a write function to `mcp/write.ts`
   (parameterised statements, whitelisted columns, wrapped in `transact`).
2. Register a tool in `mcp/tools.ts` (`server.registerTool(...)`) or a resource in `mcp/resources.ts`.
3. Add coverage to `mcp/test/smoke.mjs` and run `npm run test:mcp`.
