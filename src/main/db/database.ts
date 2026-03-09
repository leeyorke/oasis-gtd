import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

let db: Database.Database

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'oasis-gtd.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createTables()
  seedIfEmpty()
}

export function getDb(): Database.Database {
  return db
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      context TEXT,
      due_date TEXT,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'inbox',
      waiting_for TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      outcome TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS waiting_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      waiting_for TEXT NOT NULL,
      since TEXT NOT NULL,
      project_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS someday_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      horizon TEXT NOT NULL DEFAULT 'someday',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS review_checklist (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      review_date TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL DEFAULT 'openai',
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Ensure default settings exist
  const defaultSettings: Record<string, string> = {
    app_name: 'Oasis',
    review_day: '0',
    default_capture_status: 'inbox',
    contexts: JSON.stringify(['@Email', '@Office', '@Deep Work', '@Design', '@Admin', '@Phone', '@Errands', '@Computer', '@Home']),
  }
  const upsertSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(defaultSettings)) {
    upsertSetting.run(key, value)
  }
}

function seedIfEmpty(): void {
  const taskCount = (db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count
  if (taskCount > 0) return

  const now = new Date().toISOString()
  const projectId1 = uuidv4()
  const projectId2 = uuidv4()

  // Seed projects
  const insertProject = db.prepare(`
    INSERT INTO projects (id, title, description, outcome, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  insertProject.run(projectId1, 'Portfolio Redesign', 'Complete overhaul of personal portfolio site', 'A live, polished portfolio attracting new clients', 'active', now, now)
  insertProject.run(projectId2, 'Quarterly Report', 'Compile and present Q4 findings to stakeholders', 'Board-approved Q4 report delivered by month end', 'active', now, now)

  // Seed tasks
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, title, notes, context, due_date, project_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertTask.run(uuidv4(), 'Draft portfolio case studies', null, '@Deep Work', '2024-10-18', projectId1, 'next', now, now)
  insertTask.run(uuidv4(), 'Select typography for new catalog', null, '@Design', '2024-10-20', projectId1, 'next', now, now)
  insertTask.run(uuidv4(), 'Review final proofs for editorial spread', null, '@Deep Work', '2024-10-14', null, 'next', now, now)
  insertTask.run(uuidv4(), 'Follow up with curator regarding the archive', null, '@Email', null, null, 'next', now, now)
  insertTask.run(uuidv4(), 'Process physical inbox notes', null, '@Admin', null, null, 'next', now, now)
  insertTask.run(uuidv4(), 'Compile Q4 data spreadsheet', null, '@Office', '2024-10-25', projectId2, 'next', now, now)

  // Seed waiting items
  const insertWaiting = db.prepare(`
    INSERT INTO waiting_items (id, title, waiting_for, since, project_id, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  insertWaiting.run(uuidv4(), 'Photography licensing approval', 'Legal Team', '2024-10-02', projectId1, null, now)
  insertWaiting.run(uuidv4(), 'Client feedback on mockups', 'Sarah Chen', '2024-10-05', projectId1, 'Sent v2 mockups via email', now)
  insertWaiting.run(uuidv4(), 'Budget approval for print run', 'Finance Dept.', '2024-10-08', null, null, now)

  // Seed someday items
  const insertSomeday = db.prepare(`
    INSERT INTO someday_items (id, title, notes, horizon, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  insertSomeday.run(uuidv4(), 'Learn letterpress printing', 'Explore traditional print techniques', '3months', now)
  insertSomeday.run(uuidv4(), 'Write essay on brutalism in digital design', null, '1month', now)
  insertSomeday.run(uuidv4(), 'Visit the Bauhaus archive in Berlin', null, '1year', now)
  insertSomeday.run(uuidv4(), 'Build a physical zine', 'Self-published, limited edition', 'someday', now)

  // Seed review checklist
  const insertReview = db.prepare(`
    INSERT INTO review_checklist (id, category, title, completed, review_date)
    VALUES (?, ?, ?, ?, ?)
  `)
  const reviewItems = [
    ['Collect', 'Process all physical inboxes', 0],
    ['Collect', 'Review email and clear to zero', 0],
    ['Collect', 'Capture loose thoughts and ideas', 0],
    ['Process', 'Review and process all inbox items', 0],
    ['Process', 'Delete or archive what is no longer relevant', 0],
    ['Review', 'Review all active Next Actions lists', 0],
    ['Review', 'Review all active Projects', 0],
    ['Review', 'Review Waiting For list', 0],
    ['Review', 'Review Someday/Maybe list', 0],
    ['Review', 'Review calendar — past week', 0],
    ['Review', 'Review calendar — coming 2 weeks', 0],
    ['Reflect', 'Celebrate completions and progress', 0],
    ['Reflect', 'Assess what worked and what did not', 0],
    ['Create', 'Identify the most important actions for next week', 0],
  ]
  for (const [category, title, completed] of reviewItems) {
    insertReview.run(uuidv4(), category, title, completed, null)
  }

  // Seed AI provider (Ollama as default local option)
  const insertProvider = db.prepare(`
    INSERT INTO ai_providers (id, name, provider_type, base_url, model, api_key, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertProvider.run(uuidv4(), 'Ollama (Local)', 'ollama', 'http://localhost:11434', 'llama3', null, 1, now)
}

// ─── Task Queries ─────────────────────────────────────────────────────────────

export const taskQueries = {
  getByStatus: (status: string) =>
    db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC').all(status),

  getAll: () =>
    db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all(),

  getById: (id: string) =>
    db.prepare('SELECT * FROM tasks WHERE id = ?').get(id),

  create: (task: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO tasks (id, title, notes, context, due_date, project_id, status, created_at, updated_at)
      VALUES (@id, @title, @notes, @context, @due_date, @project_id, @status, @created_at, @updated_at)
    `).run({ ...task, id, created_at: now, updated_at: now })
    return id
  },

  update: (id: string, updates: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE tasks SET ${fields}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...updates, id, updated_at: now })
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id),
}

// ─── Project Queries ──────────────────────────────────────────────────────────

export const projectQueries = {
  getAll: () =>
    db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all(),

  getActive: () =>
    db.prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY created_at ASC").all(),

  getTaskCount: (projectId: string) =>
    (db.prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status != 'done'").get(projectId) as { count: number }).count,

  create: (project: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO projects (id, title, description, outcome, status, created_at, updated_at)
      VALUES (@id, @title, @description, @outcome, @status, @created_at, @updated_at)
    `).run({ ...project, id, created_at: now, updated_at: now })
    return id
  },

  update: (id: string, updates: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE projects SET ${fields}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...updates, id, updated_at: now })
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM projects WHERE id = ?').run(id),
}

// ─── Waiting Queries ──────────────────────────────────────────────────────────

export const waitingQueries = {
  getAll: () =>
    db.prepare('SELECT * FROM waiting_items ORDER BY since ASC').all(),

  create: (item: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO waiting_items (id, title, waiting_for, since, project_id, notes, created_at)
      VALUES (@id, @title, @waiting_for, @since, @project_id, @notes, @created_at)
    `).run({ ...item, id, created_at: now })
    return id
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM waiting_items WHERE id = ?').run(id),
}

// ─── Someday Queries ──────────────────────────────────────────────────────────

export const somedayQueries = {
  getAll: () =>
    db.prepare('SELECT * FROM someday_items ORDER BY horizon ASC, created_at ASC').all(),

  create: (item: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO someday_items (id, title, notes, horizon, created_at)
      VALUES (@id, @title, @notes, @horizon, @created_at)
    `).run({ ...item, id, created_at: now })
    return id
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM someday_items WHERE id = ?').run(id),
}

// ─── Review Queries ───────────────────────────────────────────────────────────

export const reviewQueries = {
  getAll: () =>
    db.prepare('SELECT * FROM review_checklist ORDER BY rowid ASC').all(),

  updateItem: (id: string, completed: boolean) =>
    db.prepare('UPDATE review_checklist SET completed = ?, review_date = ? WHERE id = ?')
      .run(completed ? 1 : 0, new Date().toISOString(), id),

  resetAll: () =>
    db.prepare('UPDATE review_checklist SET completed = 0').run(),
}

// ─── AI Provider Queries ──────────────────────────────────────────────────────

export const aiQueries = {
  getProviders: () =>
    db.prepare('SELECT * FROM ai_providers ORDER BY created_at ASC').all(),

  getActive: () =>
    db.prepare('SELECT * FROM ai_providers WHERE is_active = 1 LIMIT 1').get(),

  saveProvider: (provider: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT OR REPLACE INTO ai_providers (id, name, provider_type, base_url, model, api_key, is_active, created_at)
      VALUES (@id, @name, @provider_type, @base_url, @model, @api_key, @is_active, @created_at)
    `).run({ ...provider, id, created_at: now })
    if (provider.is_active) {
      db.prepare('UPDATE ai_providers SET is_active = 0 WHERE id != ?').run(id)
    }
    return id
  },

  setActive: (id: string) => {
    db.prepare('UPDATE ai_providers SET is_active = 0').run()
    db.prepare('UPDATE ai_providers SET is_active = 1 WHERE id = ?').run(id)
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id),

  getConversations: () =>
    db.prepare('SELECT * FROM chat_conversations ORDER BY updated_at DESC').all(),

  createConversation: (title: string, providerId: string) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO chat_conversations (id, title, provider_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, title, providerId, now, now)
    return id
  },

  getMessages: (conversationId: string) =>
    db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId),

  addMessage: (conversationId: string, role: string, content: string) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, conversationId, role, content, now)
    db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)
    return id
  },

  deleteConversation: (id: string) =>
    db.prepare('DELETE FROM chat_conversations WHERE id = ?').run(id),

  renameConversation: (id: string, title: string) =>
    db.prepare('UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), id),
}

// ─── Settings Queries ─────────────────────────────────────────────────────────

export const settingsQueries = {
  getAll: (): Record<string, string> => {
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  },

  set: (key: string, value: string) =>
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value),

  get: (key: string): string | null => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  },
}

// ─── Data Management Queries ──────────────────────────────────────────────────

export const dataQueries = {
  getDbPath: (): string => {
    const row = db.prepare('PRAGMA database_list').get() as { file: string }
    return row?.file || ''
  },

  clearCompletedTasks: () =>
    db.prepare("DELETE FROM tasks WHERE status = 'done'").run(),

  clearAllChatHistory: () => {
    db.prepare('DELETE FROM chat_messages').run()
    db.prepare('DELETE FROM chat_conversations').run()
  },

  getStats: () => ({
    tasks:         (db.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number }).n,
    nextActions:   (db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status = 'next'").get() as { n: number }).n,
    doneTasks:     (db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status = 'done'").get() as { n: number }).n,
    projects:      (db.prepare('SELECT COUNT(*) as n FROM projects').get() as { n: number }).n,
    waitingItems:  (db.prepare('SELECT COUNT(*) as n FROM waiting_items').get() as { n: number }).n,
    somedayItems:  (db.prepare('SELECT COUNT(*) as n FROM someday_items').get() as { n: number }).n,
    conversations: (db.prepare('SELECT COUNT(*) as n FROM chat_conversations').get() as { n: number }).n,
    messages:      (db.prepare('SELECT COUNT(*) as n FROM chat_messages').get() as { n: number }).n,
  }),

  exportAll: () => ({
    exported_at: new Date().toISOString(),
    tasks:        db.prepare('SELECT * FROM tasks').all(),
    projects:     db.prepare('SELECT * FROM projects').all(),
    waiting:      db.prepare('SELECT * FROM waiting_items').all(),
    someday:      db.prepare('SELECT * FROM someday_items').all(),
    settings:     db.prepare('SELECT * FROM app_settings').all(),
  }),
}