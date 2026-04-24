import { ipcMain, dialog, app, WebContents } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import {
  taskQueries,
  projectQueries,
  waitingQueries,
  somedayQueries,
  reviewQueries,
  aiQueries,
  settingsQueries,
  dataQueries,
  noteQueries,
  habitQueries,
  habitRecordQueries,
  resourceQueries,
} from '../db/database'

// Global store for AbortControllers per conversation
const streamControllers = new Map<string, AbortController>()

// Helper: safely parse JSON, returning null on empty/invalid body
const safeJson = async (res: Response): Promise<Record<string, unknown> | null> => {
  const text = await res.text()
  if (!text.trim()) return null
  try { return JSON.parse(text) } catch { return { __raw: text } }
}

// Helper: safely parse JSON string, returning fallback on invalid input
function safeParseJSON(value: unknown, fallback: unknown[] = []): unknown[] {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value as string)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

// Parse SSE (Server-Sent Events) stream line by line
async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data && data !== '[DONE]') {
            yield data
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Parse NDJSON (Newline-Delimited JSON) stream for Ollama
async function* parseNDJSON(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) {
          yield trimmed
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function streamOpenAICompatible(
  webContents: WebContents,
  provider: {provider_type: string; base_url: string; model: string; api_key?: string; system_prompt?: string; temperature?: number; max_tokens?: number},
  messages: Array<{role: string; content: string}>,
  conversationId: string,
  isTitleCall: boolean,
  signal?: AbortSignal
): Promise<string> {
  const url = `${provider.base_url}/v1/chat/completions`
  const maxTokens = isTitleCall ? 30 : (provider.max_tokens || 2048)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: maxTokens,
      temperature: provider.temperature ?? 0.7,
      system: provider.system_prompt || undefined,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  let fullContent = ''
  webContents.send('ai:startStream', { conversationId })

  for await (const dataStr of parseSSE(response.body)) {
    try {
      const data = JSON.parse(dataStr)
      const delta = data.choices?.[0]?.delta?.content
      if (delta) {
        fullContent += delta
        webContents.send('ai:streamChunk', { conversationId, content: delta })
      }
    } catch {
      // ignore parse errors for individual chunks
    }
  }

  return fullContent
}

async function streamAnthropic(
  webContents: WebContents,
  provider: {provider_type: string; base_url: string; model: string; api_key?: string; system_prompt?: string; temperature?: number; max_tokens?: number},
  messages: Array<{role: string; content: string}>,
  conversationId: string,
  isTitleCall: boolean,
  signal?: AbortSignal
): Promise<string> {
  const url = `${provider.base_url}/v1/messages`
  const maxTokens = isTitleCall ? 30 : (provider.max_tokens || 2048)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.api_key || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens,
      temperature: provider.temperature ?? 0.7,
      system: provider.system_prompt || messages.find(m => m.role === 'system')?.content,
      messages: messages.filter(m => m.role !== 'system'),
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  let fullContent = ''
  webContents.send('ai:startStream', { conversationId })

  for await (const dataStr of parseSSE(response.body)) {
    try {
      const data = JSON.parse(dataStr)
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        const delta = data.delta.text
        if (delta) {
          fullContent += delta
          webContents.send('ai:streamChunk', { conversationId, content: delta })
        }
      }
    } catch {
      // ignore parse errors for individual chunks
    }
  }

  return fullContent
}

async function streamOllama(
  webContents: WebContents,
  provider: {provider_type: string; base_url: string; model: string; api_key?: string; system_prompt?: string},
  messages: Array<{role: string; content: string}>,
  conversationId: string,
  isTitleCall: boolean,
  signal?: AbortSignal
): Promise<string> {
  const url = `${provider.base_url}/api/chat`

  // Ollama: prepend system prompt as first message if set
  const ollamaMessages = provider.system_prompt
    ? [{ role: 'system' as const, content: provider.system_prompt }, ...messages]
    : messages

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: provider.model, messages: ollamaMessages, stream: true }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  let fullContent = ''
  webContents.send('ai:startStream', { conversationId })

  for await (const dataStr of parseNDJSON(response.body)) {
    try {
      const data = JSON.parse(dataStr)
      const delta = data.message?.content
      if (delta) {
        fullContent += delta
        webContents.send('ai:streamChunk', { conversationId, content: delta })
      }
    } catch {
      // ignore parse errors for individual chunks
    }
  }

  return fullContent
}

export function registerHandlers(): void {
  // ─── Tasks ──────────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:getByStatus', (_, status: string) => taskQueries.getByStatus(status))
  ipcMain.handle('tasks:getAll', () => taskQueries.getAll())
  ipcMain.handle('tasks:create', (_, task) => taskQueries.create(task))
  ipcMain.handle('tasks:update', (_, id: string, updates) => taskQueries.update(id, updates))
  ipcMain.handle('tasks:delete', (_, id: string) => taskQueries.delete(id))

  // ─── Projects ───────────────────────────────────────────────────────────────
  ipcMain.handle('projects:getAll', () => {
    const projects = projectQueries.getAll() as Array<Record<string, unknown>>
    return projects.map(p => ({
      ...p,
      taskCount: projectQueries.getTaskCount(p.id as string),
    }))
  })
  ipcMain.handle('projects:create', (_, project) => projectQueries.create(project))
  ipcMain.handle('projects:update', (_, id: string, updates) => projectQueries.update(id, updates))
  ipcMain.handle('projects:delete', (_, id: string) => projectQueries.delete(id))

  // ─── Waiting ────────────────────────────────────────────────────────────────
  ipcMain.handle('waiting:getAll', () => waitingQueries.getAll())
  ipcMain.handle('waiting:create', (_, item) => waitingQueries.create(item))
  ipcMain.handle('waiting:delete', (_, id: string) => waitingQueries.delete(id))

  // ─── Someday ────────────────────────────────────────────────────────────────
  ipcMain.handle('someday:getAll', () => somedayQueries.getAll())
  ipcMain.handle('someday:create', (_, item) => somedayQueries.create(item))
  ipcMain.handle('someday:update', (_, id: string, updates) => somedayQueries.update(id, updates))
  ipcMain.handle('someday:delete', (_, id: string) => somedayQueries.delete(id))

  // ─── Notes ──────────────────────────────────────────────────────────────────
  ipcMain.handle('notes:getAll', () => {
    const notes = noteQueries.getAll() as Array<Record<string, unknown>>
    return notes.map(note => ({
      ...note,
      tags: safeParseJSON(note.tags),
    }))
  })
  ipcMain.handle('notes:getById', (_, id: string) => {
    const note = noteQueries.getById(id) as Record<string, unknown> | undefined
    if (!note) return null
    return {
      ...note,
      tags: safeParseJSON(note.tags),
    }
  })
  ipcMain.handle('notes:search', (_, keyword: string) => {
    const notes = noteQueries.search(keyword) as Array<Record<string, unknown>>
    return notes.map(note => ({
      ...note,
      tags: safeParseJSON(note.tags),
    }))
  })
  ipcMain.handle('notes:create', (_, note) => noteQueries.create(note))
  ipcMain.handle('notes:update', (_, id: string, updates) => noteQueries.update(id, updates))
  ipcMain.handle('notes:delete', (_, id: string) => noteQueries.delete(id))

  // ─── Resources ───────────────────────────────────────────────────────────────
  ipcMain.handle('resources:getAll', () => {
    const resources = resourceQueries.getAll() as Array<Record<string, unknown>>
    return resources.map(r => ({
      ...r,
      tags: safeParseJSON(r.tags),
      fileSize: r.file_size,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  })
  ipcMain.handle('resources:getById', (_, id: string) => {
    const resource = resourceQueries.getById(id) as Record<string, unknown> | undefined
    if (!resource) return null
    return {
      ...resource,
      tags: safeParseJSON(resource.tags),
      fileSize: resource.file_size,
      createdAt: resource.created_at,
      updatedAt: resource.updated_at,
    }
  })
  ipcMain.handle('resources:create', (_, resource) => resourceQueries.create(resource))
  ipcMain.handle('resources:update', (_, id: string, updates) => resourceQueries.update(id, updates))
  ipcMain.handle('resources:delete', (_, id: string) => resourceQueries.delete(id))

  // ─── Habits ─────────────────────────────────────────────────────────────────
  ipcMain.handle('habits:getAll', () => {
    const habits = habitQueries.getAll() as Array<Record<string, unknown>>
    const today = new Date().toISOString().split('T')[0]

    // 计算每个习惯的连续打卡天数和本周打卡情况
    return habits.map(habit => {
      const records = habitRecordQueries.getByHabitId(habit.id as string) as Array<Record<string, unknown>>
      const isQuantitative = (habit.is_quantitative as number) === 1
      const target = (habit.target as number) || 1

      // 计算连续打卡天数（基于是否"完成"）
      let streak = 0
      let currentDate = new Date()
      while (true) {
        const dateStr = currentDate.toISOString().split('T')[0]
        const record = records.find(r => r.record_date === dateStr)
        const isCompleted = record
          ? isQuantitative
            ? (record.count as number) >= target
            : (record.completed as number) === 1
          : false
        if (isCompleted) {
          streak++
          currentDate.setDate(currentDate.getDate() - 1)
        } else {
          break
        }
      }

      // 检查今日是否已打卡
      const todayRecord = records.find(r => r.record_date === today)
      const todayCount = todayRecord ? (todayRecord.count as number || 1) : 0
      const completedToday = todayCount >= target

      // 获取本周打卡记录（周一到周日）
      const now = new Date()
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1)) // 周一
      const weekRecords: Record<string, number> = {}
      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek)
        date.setDate(startOfWeek.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        const record = records.find(r => r.record_date === dateStr)
        weekRecords[dateStr] = record ? (record.count as number || 1) : 0
      }

      return {
        ...habit,
        streak,
        completedToday,
        todayCount,
        weekRecords,
      }
    })
  })
  ipcMain.handle('habits:create', (_, habit) => habitQueries.create(habit))
  ipcMain.handle('habits:update', (_, id: string, updates) => habitQueries.update(id, updates))
  ipcMain.handle('habits:delete', (_, id: string) => habitQueries.delete(id))
  ipcMain.handle('habits:incrementCount', (_, habitId: string, date: string) => {
    const habit = habitQueries.getById(habitId) as Record<string, unknown> | undefined
    if (!habit) return null
    const target = (habit.target as number) || 1
    return habitRecordQueries.incrementCount(habitId, date, target)
  })
  ipcMain.handle('habits:decrementCount', (_, habitId: string, date: string) => {
    return habitRecordQueries.decrementCount(habitId, date)
  })
  ipcMain.handle('habits:toggleComplete', (_, habitId: string, date: string, completed: boolean) => {
    return habitRecordQueries.toggleComplete(habitId, date, completed)
  })
  ipcMain.handle('habits:getById', (_, habitId: string) => {
    const habit = habitQueries.getById(habitId) as Record<string, unknown> | undefined
    if (!habit) return null

    const records = habitRecordQueries.getByHabitId(habitId) as Array<Record<string, unknown>>
    const today = new Date().toISOString().split('T')[0]
    const isQuantitative = (habit.is_quantitative as number) === 1
    const target = (habit.target as number) || 1

    // 计算当前连续打卡天数（基于是否"完成"）
    let streak = 0
    let currentDate = new Date()
    while (true) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const record = records.find(r => r.record_date === dateStr)
      const isCompleted = record
        ? isQuantitative
          ? (record.count as number) >= target
          : (record.completed as number) === 1
        : false
      if (isCompleted) {
        streak++
        currentDate.setDate(currentDate.getDate() - 1)
      } else {
        break
      }
    }

    // 计算最长连续打卡天数（基于是否"完成"）
    let longestStreak = 0
    let tempStreak = 0
    const sortedRecords = [...records]
      .filter(r => {
        const count = r.count as number || 1
        return isQuantitative ? count >= target : (r.completed as number) === 1
      })
      .sort((a, b) => (a.record_date as string).localeCompare(b.record_date as string))

    for (let i = 0; i < sortedRecords.length; i++) {
      if (i === 0) {
        tempStreak = 1
      } else {
        const prevDate = new Date(sortedRecords[i - 1].record_date as string)
        const currDate = new Date(sortedRecords[i].record_date as string)
        const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays === 1) {
          tempStreak++
        } else {
          tempStreak = 1
        }
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak
      }
    }

    // 总打卡次数（完成的天数，不是累计次数）
    const totalSessions = records.filter(r => {
      const count = r.count as number || 1
      return isQuantitative ? count >= target : (r.completed as number) === 1
    }).length

    // 完成率：总完成天数 / 自创建以来总天数
    const createdAt = new Date(habit.created_at as string)
    const now = new Date()
    const diffMs = now.getTime() - createdAt.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const totalDays = Math.max(1, diffDays + 1)
    const completionRate = Math.round((totalSessions / totalDays) * 100)

    // 检查今日是否已打卡
    const todayRecord = records.find(r => r.record_date === today)
    const todayCount = todayRecord ? (todayRecord.count as number || 1) : 0
    const completedToday = todayCount >= target

    // 获取本周打卡记录（周一到周日）
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1))
    const weekRecords: Record<string, number> = {}
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      const dateStr = date.toISOString().split('T')[0]
      const record = records.find(r => r.record_date === dateStr)
      weekRecords[dateStr] = record ? (record.count as number || 1) : 0
    }

    // 获取近12个月所有打卡记录用于日历
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const allRecords: Record<string, number> = {}
    records.forEach(r => {
      const recordDate = new Date(r.record_date as string)
      if (recordDate >= twelveMonthsAgo) {
        allRecords[r.record_date as string] = r.count as number || 1
      }
    })

    return {
      ...habit,
      streak,
      longestStreak,
      totalSessions,
      completionRate,
      completedToday,
      todayCount,
      weekRecords,
      allRecords,
    }
  })

  // ─── Weekly Review ──────────────────────────────────────────────────────────
  ipcMain.handle('review:getAll', () => reviewQueries.getAll())
  ipcMain.handle('review:updateItem', (_, id: string, completed: boolean) =>
    reviewQueries.updateItem(id, completed)
  )
  ipcMain.handle('review:resetAll', () => reviewQueries.resetAll())

  // ─── AI Providers ───────────────────────────────────────────────────────────
  ipcMain.handle('ai:getProviders', () => aiQueries.getProviders())
  ipcMain.handle('ai:saveProvider', (_, provider) => aiQueries.saveProvider(provider))
  ipcMain.handle('ai:setActive', (_, id: string) => aiQueries.setActive(id))
  ipcMain.handle('ai:deleteProvider', (_, id: string) => aiQueries.delete(id))

  // ─── Chat Conversations ──────────────────────────────────────────────────────
  ipcMain.handle('chat:getConversations', () => aiQueries.getConversations())
  ipcMain.handle('chat:createConversation', (_, title: string, providerId: string) =>
    aiQueries.createConversation(title, providerId)
  )
  ipcMain.handle('chat:getMessages', (_, conversationId: string) =>
    aiQueries.getMessages(conversationId)
  )
  ipcMain.handle('chat:deleteConversation', (_, id: string) => aiQueries.deleteConversation(id))
  ipcMain.handle('chat:renameConversation', (_, id: string, title: string) =>
    aiQueries.renameConversation(id, title)
  )

  // ─── AI Send Message (Non-streaming for backwards compatibility & title generation) ───────────────────
  ipcMain.handle('ai:sendMessage', async (_, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string; system_prompt?: string; temperature?: number; max_tokens?: number}) => {
    const isTitleCall = conversationId === '__title__'

    if (!isTitleCall) {
      console.log('\n[AI] ── sendMessage called (non-streaming) ───────────')
      console.log('[AI] conversationId:', conversationId)
      console.log('[AI] provider_type:', provider.provider_type)
    }

    try {
      // Save user message — skip for ephemeral title generation calls
      if (!isTitleCall) {
        const lastMsg = messages[messages.length - 1]
        aiQueries.addMessage(conversationId, lastMsg.role, lastMsg.content)
        console.log('[AI] user message saved to DB')
      }

      let responseText = ''
      const maxTokens = isTitleCall ? 30 : (provider.max_tokens || 2048)

      if (provider.provider_type === 'anthropic') {
        const url = `${provider.base_url}/v1/messages`
        if (!isTitleCall) console.log('[AI] -> Anthropic:', url)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.api_key || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: provider.model,
            max_tokens: maxTokens,
            temperature: provider.temperature ?? 0.7,
            system: provider.system_prompt || messages.find(m => m.role === 'system')?.content,
            messages: messages.filter(m => m.role !== 'system'),
          }),
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
        }
        const data = await safeJson(response)
        const content = data?.content as Array<{text: string}> | undefined
        responseText = content?.[0]?.text || 'No response'

      } else if (provider.provider_type === 'ollama') {
        const url = `${provider.base_url}/api/chat`
        if (!isTitleCall) console.log('[AI] -> Ollama:', url)
        const ollamaMessages = provider.system_prompt
          ? [{ role: 'system' as const, content: provider.system_prompt }, ...messages]
          : messages
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: provider.model, messages: ollamaMessages, stream: false }),
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
        }
        const data = await safeJson(response)
        const msg = data?.message as { content: string } | undefined
        responseText = msg?.content || 'No response'

      } else {
        // OpenAI-compatible
        const url = `${provider.base_url}/v1/chat/completions`
        if (!isTitleCall) console.log('[AI] -> OpenAI-compatible:', url)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            max_tokens: maxTokens,
            temperature: provider.temperature ?? 0.7,
            system: provider.system_prompt || undefined,
          }),
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
        }
        const data = await safeJson(response)
        const choices = data?.choices as Array<{message: {content: string}}> | undefined
        responseText = choices?.[0]?.message?.content || 'No response'
      }

      if (!isTitleCall) {
        console.log('[AI] response (first 100):', responseText.slice(0, 100))
        aiQueries.addMessage(conversationId, 'assistant', responseText)
        console.log('[AI] assistant message saved to DB')
        console.log('[AI] done\n')
      }

      return { success: true, content: responseText }

    } catch (err) {
      if (!isTitleCall) console.error('[AI] ERROR:', err instanceof Error ? err.message : err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // ─── AI Send Message Streaming ──────────────────────────────────────────────
  ipcMain.on('ai:sendMessageStream', async (event, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string; system_prompt?: string; temperature?: number; max_tokens?: number}) => {
    const webContents = event.sender
    const isTitleCall = conversationId === '__title__'

    if (!isTitleCall) {
      console.log('\n[AI] ── sendMessageStream called ──────────────────────')
      console.log('[AI] conversationId:', conversationId)
      console.log('[AI] provider_type:', provider.provider_type)
    }

    // Create AbortController for this stream
    const controller = new AbortController()
    streamControllers.set(conversationId, controller)

    try {
      // Save user message first
      if (!isTitleCall) {
        const lastMsg = messages[messages.length - 1]
        aiQueries.addMessage(conversationId, lastMsg.role, lastMsg.content)
        console.log('[AI] user message saved to DB')
      }

      let fullContent = ''

      if (provider.provider_type === 'anthropic') {
        fullContent = await streamAnthropic(webContents, provider, messages, conversationId, isTitleCall, controller.signal)
      } else if (provider.provider_type === 'ollama') {
        fullContent = await streamOllama(webContents, provider, messages, conversationId, isTitleCall, controller.signal)
      } else {
        fullContent = await streamOpenAICompatible(webContents, provider, messages, conversationId, isTitleCall, controller.signal)
      }

      if (!isTitleCall) {
        console.log('[AI] full response (first 100):', fullContent.slice(0, 100))
        aiQueries.addMessage(conversationId, 'assistant', fullContent)
        console.log('[AI] assistant message saved to DB')
        console.log('[AI] done\n')
      }

      // Auto-generate title if it's the first message
      let generatedTitle: string | undefined
      if (!isTitleCall && messages.length === 1) {
        try {
          const lang = 'en' // We'll get this from settings in a real implementation
          const titlePrompt: Array<{role: string; content: string}> = [
            {
              role: 'user',
              content: `Summarize this conversation exchange in 5 words or fewer as a conversation title. Reply with ONLY the title, no punctuation, no quotes.\n\nUser: ${messages[messages.length - 1].content}\nAssistant: ${fullContent}`,
            },
          ]
          // Use non-streaming for title generation
          const titleResult = await (async () => {
            if (provider.provider_type === 'anthropic') {
              const url = `${provider.base_url}/v1/messages`
              const response = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': provider.api_key || '',
                  'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                  model: provider.model,
                  max_tokens: 30,
                  messages: titlePrompt.filter(m => m.role !== 'system'),
                }),
              })
              if (!response.ok) return { success: false }
              const data = await safeJson(response)
              const content = data?.content as Array<{text: string}> | undefined
              return { success: true, content: content?.[0]?.text }
            } else {
              const url = `${provider.base_url}/v1/chat/completions`
              const response = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
                },
                body: JSON.stringify({ model: provider.model, messages: titlePrompt, max_tokens: 30 }),
              })
              if (!response.ok) return { success: false }
              const data = await safeJson(response)
              const choices = data?.choices as Array<{message: {content: string}}> | undefined
              return { success: true, content: choices?.[0]?.message?.content }
            }
          })()

          if (titleResult.success && titleResult.content) {
            generatedTitle = titleResult.content.trim().slice(0, 60)
            await aiQueries.renameConversation(conversationId, generatedTitle)
          }
        } catch {
          // Title generation failing is non-critical
        }
      }

      webContents.send('ai:streamEnd', { conversationId, content: fullContent, title: generatedTitle })

    } catch (err) {
      // Check if this was an abort (user stopped)
      if (err instanceof Error && err.name === 'AbortError') {
        if (!isTitleCall) {
          console.log('[AI] Stream aborted by user')
          // Send streamEnd with current content (partial response)
          // The content has already been streamed to renderer via ai:streamChunk
          webContents.send('ai:streamEnd', { conversationId, content: '', aborted: true })
        }
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (!isTitleCall) console.error('[AI] ERROR:', message)
        webContents.send('ai:streamError', { conversationId, error: message })
      }
    } finally {
      // Clean up the controller
      streamControllers.delete(conversationId)
    }
  })

  // ─── AI Stop Stream ──────────────────────────────────────────────────────────
  ipcMain.on('ai:stopStream', (_, conversationId: string) => {
    const controller = streamControllers.get(conversationId)
    if (controller) {
      console.log('[AI] Stopping stream for conversation:', conversationId)
      controller.abort()
      streamControllers.delete(conversationId)
    }
  })

  // ─── App Settings ────────────────────────────────────────────────────────────
  ipcMain.handle('settings:getAll', () => settingsQueries.getAll())
  ipcMain.handle('settings:set', (_, key: string, value: string) => settingsQueries.set(key, value))

  // ─── Data Management ─────────────────────────────────────────────────────────
  ipcMain.handle('data:getStats', () => dataQueries.getStats())
  ipcMain.handle('data:getDbPath', () => dataQueries.getDbPath())

  ipcMain.handle('data:clearCompleted', () => {
    dataQueries.clearCompletedTasks()
    return { success: true }
  })

  ipcMain.handle('data:clearChatHistory', () => {
    dataQueries.clearAllChatHistory()
    return { success: true }
  })

  ipcMain.handle('data:exportJSON', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export Oasis GTD Data',
      defaultPath: join(app.getPath('documents'), `oasis-gtd-export-${new Date().toISOString().split('T')[0]}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    try {
      const data = dataQueries.exportAll()
      writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  })

  // ─── Export Conversation Markdown ───────────────────────────────────────────
  ipcMain.handle('chat:exportMarkdown', async (_, conversationId: string, title: string, messages: Array<{role: string; content: string}>) => {
    // Sanitize title for filename
    const sanitizedTitle = title.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-').slice(0, 60)
    const dateStr = new Date().toISOString().split('T')[0]

    const result = await dialog.showSaveDialog({
      title: 'Export Conversation',
      defaultPath: join(app.getPath('documents'), `${sanitizedTitle || 'conversation'}-${dateStr}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })

    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    try {
      // Build Markdown content
      let mdContent = `# ${title || 'Conversation'}\n`
      mdContent += `${new Date().toLocaleDateString()}\n\n`
      mdContent += `---\n\n`

      for (const msg of messages) {
        const roleLabel = msg.role === 'user' ? 'You' : 'Assistant'
        mdContent += `## ${roleLabel}\n\n`
        mdContent += `${msg.content}\n\n`
        mdContent += `---\n\n`
      }

      writeFileSync(result.filePath, mdContent, 'utf-8')
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  })
}
