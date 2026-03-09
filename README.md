# Aura GTD — Alpha

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

Output: `dist/Aura-GTD-Setup-0.1.0-alpha.exe`

### Build for other platforms

```bash
npm run build:mac    # macOS
npm run build:linux  # Linux AppImage
```

## Windows App Icon

Place your icon files in `resources/`:
- `resources/icon.ico` — Windows icon (required for build)
- `resources/icon.icns` — macOS icon
- `resources/icon.png` — Linux icon (256×256)

You can generate these from any PNG using [electron-icon-maker](https://www.npmjs.com/package/electron-icon-maker) or online tools.

## AI Provider Setup

Aura supports multiple AI providers for the AI Assistant view:

| Provider | Base URL | Notes |
|----------|----------|-------|
| **OpenAI** | `https://api.openai.com` | Requires API key |
| **Anthropic** | `https://api.anthropic.com` | Requires API key |
| **Ollama** | `http://localhost:11434` | Free, runs locally |
| **LM Studio** | `http://localhost:1234` | OpenAI-compatible |
| **Custom** | Any OpenAI-compatible URL | e.g. vLLM, Groq |

Configure providers in the AI Assistant view → **Configure →**

## Data Storage

All data is stored locally in SQLite at:
- **Windows:** `%APPDATA%\aura-gtd\aura-gtd.db`
- **macOS:** `~/Library/Application Support/aura-gtd/aura-gtd.db`
- **Linux:** `~/.config/aura-gtd/aura-gtd.db`

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
