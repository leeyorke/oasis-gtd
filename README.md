# Oasis GTD

<p align="center">
  <strong>English</strong>
  &nbsp;·&nbsp;
  <a href="./README_CN.md">简体中文</a>
</p>

Premium desktop GTD system built with Electron + React + TypeScript.

## Tech Stack

- **Electron 29** + **electron-vite** — Desktop app framework & build tool
- **React 18** + **TypeScript** — UI framework
- **Tailwind CSS** — Utility styling
- **Zustand** — State management
- **better-sqlite3** — Local SQLite database
- **electron-builder** — Windows/macOS/Linux packaging

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # App entry, window creation
│   ├── db/            # SQLite database (better-sqlite3)
│   └── ipc/           # IPC handlers for all operations
├── preload/           # Context bridge (secure API exposure)
└── renderer/          # React frontend
    └── src/
        ├── App.tsx
        ├── views/     # NextActions, Projects, WaitingFor, Someday, WeeklyReview, AIChat
        ├── components/ # Layout, Sidebar, QuickCapture, Modals
        ├── store/     # Zustand store (all app state)
        ├── hooks/     # useParallax
        └── types/     # TypeScript interfaces
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Install dependencies
npm install

# Run in development
npm run dev
```

### Build for Windows (Alpha)

```bash
npm run build:win
```

Output: `dist/Oasis-GTD-Setup-0.1.0-alpha.exe`

### Build for other platforms

```bash
npm run build:mac    # macOS
npm run build:linux  # Linux AppImage
```

## Release Script

The project includes a release script that automates version updates, building, and packaging:

```bash
# Run interactive release wizard
npm run release

# Or specify version directly
node scripts/release.js 1.0.0

# Dry run (no actual file changes)
node scripts/release.js --dry-run 1.0.0

# Temp build (no version bump, no git commit)
node scripts/release.js --temp
```

The script will:
1. Update package.json version number
2. Create git commit and tag
3. Auto-detect platform and build appropriate installer
4. Output build summary

Use `--temp` for quick test builds — it builds an installer using the current version without modifying any files or creating git commits.

## AI Provider Setup

Oasis supports multiple AI providers for the AI Assistant view:

| Provider | Base URL | Notes |
|----------|----------|-------|
| **OpenAI** | `https://api.openai.com` | Requires API key |
| **Anthropic** | `https://api.anthropic.com` | Requires API key |
| **Ollama** | `http://localhost:11434` | Free, runs locally |
| **LM Studio** | `http://localhost:1234` | OpenAI-compatible |
| **Custom** | Any OpenAI-compatible URL | e.g. vLLM, Groq |

Configure providers in the AI Assistant view → **Configure →**

## Windows App Icon

Place your icon files in `resources/`:
- `resources/icon.ico` — Windows icon (required for build)
- `resources/icon.icns` — macOS icon
- `resources/icon.png` — Linux icon (256×256)

You can generate these from any PNG using [electron-icon-maker](https://www.npmjs.com/package/electron-icon-maker) or online tools.

## Release Script

The project includes a release script that automates version updates, building, and packaging:

```bash
# Run interactive release wizard
npm run release

# Or specify version directly
node scripts/release.js 1.0.0

# Dry run (no actual file changes)
node scripts/release.js --dry-run 1.0.0
```

The script will:
1. Update package.json version number
2. Create git commit and tag
3. Auto-detect platform and build appropriate installer
4. Output build summary

All data is stored locally in SQLite at:
- **Windows:** `%APPDATA%\oasis-gtd\oasis-gtd.db`
- **macOS:** `~/Library/Application Support/oasis-gtd/oasis-gtd.db`
- **Linux:** `~/.config/oasis-gtd/oasis-gtd.db`

## MCP Server (Agent Data Access)

This repo ships an [MCP](https://modelcontextprotocol.io) server (`mcp/`) that lets other agents
read the app's data — tasks, projects, waiting-for, someday, notes, habits, AI chat history,
resources and the review checklist. It runs over stdio, reads the same SQLite database the app uses
(works while the app is running, thanks to WAL mode), and is strictly read-only.

```bash
npm run mcp        # start the server
npm run test:mcp   # end-to-end smoke test
```

It is already registered for Claude Code in `.mcp.json`. Requires Node.js ≥ 22.18.
Full documentation: [mcp/README.md](mcp/README.md).

For agents on other machines, the app itself starts the endpoint on launch (and stops it on quit):
it serves MCP Streamable HTTP on `0.0.0.0:7800` with a bearer token that is generated on first
launch and shown in **Settings → MCP** (status, connection URLs, token, on/off switch). Requires the
system Node ≥ 22.5 on PATH (Electron's bundled Node cannot run the server).

```bash
# manual start (same as what the app does), or rely on the app
OASIS_MCP_TOKEN=my-secret-token node mcp/index.ts --http
# → POST http://<局域网IP>:7800/mcp   (headers: Authorization: Bearer …, Accept: application/json, text/event-stream)
```

## GTD Views

| View | Description |
|------|-------------|
| **Next Actions** | All `@Context`-tagged next actions with due dates |
| **Projects** | Multi-action outcomes with project cards |
| **Waiting For** | Delegated items with aging visualization |
| **Someday/Maybe** | Ideas organized by time horizon |
| **Weekly Review** | Guided checklist: Collect → Process → Review → Reflect → Create |
| **AI Assistant** | LLM chat with configurable providers |

## Adding New App Modules

The AI provider interface is designed to be extensible. To add a new app (e.g., a different AI tool or note-taking module):

1. Add a new `ViewType` in `src/renderer/src/types/index.ts`
2. Create `src/renderer/src/views/YourView.tsx`
3. Register in `src/renderer/src/App.tsx`
4. Add nav item in `src/renderer/src/components/Sidebar.tsx`
5. Add IPC handlers in `src/main/ipc/handlers.ts` if backend needed

## Roadmap

- [ ] Drag & drop task reordering
- [ ] Calendar view with due date overview
- [ ] Context filtering (click @Context to filter)
- [ ] Project completion workflow
- [ ] Data export (JSON / CSV)
- [ ] Themes (dark mode)
- [ ] Global hotkey for Quick Capture
- [ ] Notifications for overdue items
