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
  migrateProjects()
  seedIfEmpty()
}

export function getDb(): Database.Database {
  return db
}

function migrateProjects(): void {
  db.prepare("UPDATE projects SET status = 'active' WHERE status IN ('completed', 'someday')").run()
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
      priority TEXT DEFAULT 'medium',
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
      system_prompt TEXT DEFAULT '',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
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

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT,
      weather TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL DEFAULT 'daily',
      time_of_day TEXT,
      color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS habit_records (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      record_date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      UNIQUE(habit_id, record_date)
    );
  `)

  // Migration: Add new columns to ai_providers if they don't exist
  try {
    db.exec(`ALTER TABLE ai_providers ADD COLUMN system_prompt TEXT DEFAULT ''`)
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE ai_providers ADD COLUMN temperature REAL DEFAULT 0.7`)
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE ai_providers ADD COLUMN max_tokens INTEGER DEFAULT 2048`)
  } catch { /* column already exists */ }

  // Migration: Add priority column to tasks if it doesn't exist
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'`)
  } catch { /* column already exists */ }

  // Migration: Add category column to someday_items if it doesn't exist
  try {
    db.exec(`ALTER TABLE someday_items ADD COLUMN category TEXT DEFAULT ''`)
  } catch { /* column already exists */ }

  // Create resources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'document',
      description TEXT,
      file_size TEXT,
      url TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

  // Seed tasks (standalone tasks, not linked to projects)
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, title, notes, context, due_date, project_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertTask.run(uuidv4(), 'Review final proofs for editorial spread', null, '@Deep Work', '2024-10-14', null, 'next', now, now)
  insertTask.run(uuidv4(), 'Follow up with curator regarding the archive', null, '@Email', null, null, 'next', now, now)
  insertTask.run(uuidv4(), 'Process physical inbox notes', null, '@Admin', null, null, 'next', now, now)

  // Seed waiting items (standalone items, not linked to projects)
  const insertWaiting = db.prepare(`
    INSERT INTO waiting_items (id, title, waiting_for, since, project_id, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  insertWaiting.run(uuidv4(), 'Budget approval for print run', 'Finance Dept.', '2024-10-08', null, null, now)

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
    INSERT INTO ai_providers (id, name, provider_type, base_url, model, api_key, system_prompt, temperature, max_tokens, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertProvider.run(uuidv4(), 'Ollama (Local)', 'ollama', 'http://localhost:11434', 'llama3', null, '', 0.7, 2048, 1, now)
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
    `).run({
      id,
      title: task.title,
      notes: task.notes ?? null,
      context: task.context ?? null,
      due_date: task.due_date ?? null,
      project_id: task.project_id ?? null,
      status: task.status,
      created_at: now,
      updated_at: now,
    })
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
    `).run({ ...project, id, description: project.description ?? null, outcome: project.outcome ?? null, status: project.status ?? 'active', created_at: now, updated_at: now })
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
      INSERT INTO someday_items (id, title, notes, horizon, category, created_at)
      VALUES (@id, @title, @notes, @horizon, @category, @created_at)
    `).run({ ...item, id, category: item.category ?? '', created_at: now })
    return id
  },

  update: (id: string, updates: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE someday_items SET ${fields}, created_at = @created_at WHERE id = @id`)
      .run({ ...updates, id, created_at: now })
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
    let id: string

    // Check if provider has an id and exists in database
    if (provider.id) {
      id = String(provider.id)
      const exists = (db.prepare('SELECT COUNT(*) as count FROM ai_providers WHERE id = ?').get(id) as { count: number }).count > 0

      if (exists) {
        // Update existing provider - always update all fields
        db.prepare(`
          UPDATE ai_providers
          SET name = @name,
              provider_type = @provider_type,
              base_url = @base_url,
              model = @model,
              api_key = @api_key,
              system_prompt = @system_prompt,
              temperature = @temperature,
              max_tokens = @max_tokens,
              is_active = @is_active
          WHERE id = @id
        `).run({
          ...provider,
          id,
          api_key: provider.api_key || null,
          system_prompt: provider.system_prompt || '',
          temperature: provider.temperature ?? 0.7,
          max_tokens: provider.max_tokens ?? 2048,
          is_active: provider.is_active ?? 0,
        })

        // If this provider is being set active, deactivate others
        if (provider.is_active) {
          db.prepare('UPDATE ai_providers SET is_active = 0 WHERE id != ?').run(id)
        }

        return id
      }
    }

    // Create new provider
    id = uuidv4()
    db.prepare(`
      INSERT INTO ai_providers (id, name, provider_type, base_url, model, api_key, system_prompt, temperature, max_tokens, is_active, created_at)
      VALUES (@id, @name, @provider_type, @base_url, @model, @api_key, @system_prompt, @temperature, @max_tokens, @is_active, @created_at)
    `).run({
      ...provider,
      id,
      created_at: now,
      system_prompt: provider.system_prompt || '',
      temperature: provider.temperature ?? 0.7,
      max_tokens: provider.max_tokens ?? 2048,
      is_active: provider.is_active ?? 0
    })

    // If this provider is being set active, deactivate others
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

// ─── Note Queries ─────────────────────────────────────────────────────────────
export const noteQueries = {
  getAll: () =>
    db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all(),

  getById: (id: string) =>
    db.prepare('SELECT * FROM notes WHERE id = ?').get(id),

  search: (keyword: string) =>
    db.prepare('SELECT * FROM notes WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC')
      .all(`%${keyword}%`, `%${keyword}%`),

  create: (note: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO notes (id, content, tags, weather, created_at, updated_at)
      VALUES (@id, @content, @tags, @weather, @created_at, @updated_at)
    `).run({
      id,
      content: note.content,
      tags: note.tags ? JSON.stringify(note.tags) : null,
      weather: note.weather ?? null,
      created_at: now,
      updated_at: now,
    })
    return id
  },

  update: (id: string, updates: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')

    const params: Record<string, unknown> = { ...updates, id, updated_at: now }
    if (updates.tags) {
      params.tags = JSON.stringify(updates.tags)
    }

    db.prepare(`UPDATE notes SET ${fields}, updated_at = @updated_at WHERE id = @id`)
      .run(params)
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM notes WHERE id = ?').run(id),
}

// ─── Habit Queries ─────────────────────────────────────────────────────────────
export const habitQueries = {
  getAll: () =>
    db.prepare('SELECT * FROM habits WHERE is_archived = 0 ORDER BY created_at ASC').all(),

  getById: (id: string) =>
    db.prepare('SELECT * FROM habits WHERE id = ?').get(id),

  create: (habit: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO habits (id, title, description, frequency, time_of_day, color, created_at, updated_at, is_archived)
      VALUES (@id, @title, @description, @frequency, @time_of_day, @color, @created_at, @updated_at, @is_archived)
    `).run({
      id,
      title: habit.title,
      description: habit.description ?? null,
      frequency: habit.frequency ?? 'daily',
      time_of_day: habit.time_of_day ?? null,
      color: habit.color ?? null,
      created_at: now,
      updated_at: now,
      is_archived: 0,
    })
    return id
  },

  update: (id: string, updates: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE habits SET ${fields}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...updates, id, updated_at: now })
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM habits WHERE id = ?').run(id),
}

// ─── Habit Record Queries ─────────────────────────────────────────────────────
export const habitRecordQueries = {
  getByHabitId: (habitId: string) =>
    db.prepare('SELECT * FROM habit_records WHERE habit_id = ? ORDER BY record_date DESC').all(habitId),

  getByHabitAndDate: (habitId: string, recordDate: string) =>
    db.prepare('SELECT * FROM habit_records WHERE habit_id = ? AND record_date = ?').get(habitId, recordDate),

  getWeekRecords: (habitId: string, startOfWeek: string, endOfWeek: string) =>
    db.prepare('SELECT * FROM habit_records WHERE habit_id = ? AND record_date BETWEEN ? AND ?')
      .all(habitId, startOfWeek, endOfWeek),

  createOrUpdate: (habitId: string, recordDate: string, completed: boolean, notes?: string) => {
    const now = new Date().toISOString()
    const existing = habitRecordQueries.getByHabitAndDate(habitId, recordDate)

    if (existing) {
      // 更新现有记录
      db.prepare(`
        UPDATE habit_records
        SET completed = @completed, notes = @notes, created_at = @updated_at
        WHERE habit_id = @habitId AND record_date = @recordDate
      `).run({
        habitId,
        recordDate,
        completed: completed ? 1 : 0,
        notes: notes ?? null,
        updated_at: now
      })
      return existing.id
    } else {
      // 创建新记录
      const id = uuidv4()
      db.prepare(`
        INSERT INTO habit_records (id, habit_id, record_date, completed, notes, created_at)
        VALUES (@id, @habitId, @recordDate, @completed, @notes, @created_at)
      `).run({
        id,
        habitId,
        recordDate,
        completed: completed ? 1 : 0,
        notes: notes ?? null,
        created_at: now
      })
      return id
    }
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM habit_records WHERE id = ?').run(id),
}

// ─── Resource Queries ────────────────────────────────────────────────────────
export const resourceQueries = {
  getAll: () =>
    db.prepare('SELECT * FROM resources ORDER BY updated_at DESC').all(),

  getById: (id: string) =>
    db.prepare('SELECT * FROM resources WHERE id = ?').get(id),

  create: (resource: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const id = uuidv4()
    db.prepare(`
      INSERT INTO resources (id, title, type, description, file_size, url, tags, created_at, updated_at)
      VALUES (@id, @title, @type, @description, @file_size, @url, @tags, @created_at, @updated_at)
    `).run({
      id,
      title: resource.title,
      type: resource.type ?? 'document',
      description: resource.description ?? null,
      file_size: resource.fileSize ?? null,
      url: resource.url ?? null,
      tags: resource.tags ? JSON.stringify(resource.tags) : null,
      created_at: now,
      updated_at: now,
    })
    return id
  },

  update: (id: string, updates: Record<string, unknown>) => {
    const now = new Date().toISOString()
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')

    const params: Record<string, unknown> = { ...updates, id, updated_at: now }
    if (updates.tags) {
      params.tags = JSON.stringify(updates.tags)
    }
    // Map camelCase to snake_case for DB
    if (updates.fileSize) {
      params.file_size = updates.fileSize
      delete params.fileSize
    }

    db.prepare(`UPDATE resources SET ${fields}, updated_at = @updated_at WHERE id = @id`)
      .run(params)
  },

  delete: (id: string) =>
    db.prepare('DELETE FROM resources WHERE id = ?').run(id),
}