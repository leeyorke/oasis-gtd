import { ipcMain, dialog, app } from 'electron'
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
  getDb,
} from '../db/database'

// Helper to normalize URL (remove trailing slash)
const normalizeUrl = (base: string, path: string) => {
  const baseClean = base.replace(/\/+$/, '')
  const pathClean = path.replace(/^\/+/, '')
  return `${baseClean}/${pathClean}`
}

// Helper to generate title from user message
async function generateTitleFromMessage(userMessage: string, provider: {provider_type: string; base_url: string; model: string; api_key?: string}): Promise<string> {
  try {
    const titlePrompt = [
      { role: 'system', content: 'Generate a concise, 4-6 word title for this conversation. Only return the title, no other text.' },
      { role: 'user', content: userMessage }
    ]

    let title = 'New Conversation'

    if (provider.provider_type === 'anthropic') {
      const url = normalizeUrl(provider.base_url, '/v1/messages')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.api_key || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 64,
          messages: titlePrompt.filter(m => m.role !== 'system'),
          system: titlePrompt.find(m => m.role === 'system')?.content,
        }),
      })
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>
        const content = data.content as Array<{text: string}> | undefined
        title = content?.[0]?.text?.trim() || title
      }
    } else if (provider.provider_type === 'ollama') {
      const url = normalizeUrl(provider.base_url, '/api/chat')
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.model, messages: titlePrompt, stream: false }),
      })
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>
        const msg = data.message as { content: string } | undefined
        title = msg?.content?.trim() || title
      }
    } else {
      // OpenAI-compatible
      const url = normalizeUrl(provider.base_url, '/v1/chat/completions')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
        },
        body: JSON.stringify({ model: provider.model, messages: titlePrompt, max_tokens: 64 }),
      })
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>
        const choices = data.choices as Array<{message: {content: string}}> | undefined
        title = choices?.[0]?.message?.content?.trim() || title
      }
    }

    // Clean up title - remove quotes if any
    title = title.replace(/^["']|["']$/g, '')
    // Limit length
    if (title.length > 50) title = title.slice(0, 47) + '...'
    return title
  } catch {
    return 'New Conversation'
  }
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
  ipcMain.handle('someday:delete', (_, id: string) => somedayQueries.delete(id))

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
  ipcMain.handle('chat:updateConversationTitle', (_, id: string, title: string) => {
    const db = getDb()
    db.prepare('UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, new Date().toISOString(), id)
  })
  ipcMain.handle('chat:getMessages', (_, conversationId: string) =>
    aiQueries.getMessages(conversationId)
  )
  ipcMain.handle('chat:deleteConversation', (_, id: string) => aiQueries.deleteConversation(id))

  // ─── AI Send Message (Streaming) ────────────────────────────────────────────
  ipcMain.handle('ai:sendMessage', async (_, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string}, isFirstMessage: boolean = false) => {
    console.log('\n[AI] sendMessage called')
    console.log('[AI] provider_type:', provider.provider_type)
    console.log('[AI] model:', provider.model)

    try {
      const lastMsg = messages[messages.length - 1]
      aiQueries.addMessage(conversationId, lastMsg.role, lastMsg.content)

      // Generate title if it's the first message
      let generatedTitle: string | null = null
      if (isFirstMessage && lastMsg.role === 'user') {
        generatedTitle = await generateTitleFromMessage(lastMsg.content, provider)
        if (generatedTitle && generatedTitle !== 'New Conversation') {
          const db = getDb()
          db.prepare('UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?').run(generatedTitle, new Date().toISOString(), conversationId)
        }
      }

      let responseText = ''

      if (provider.provider_type === 'anthropic') {
        const url = normalizeUrl(provider.base_url, '/v1/messages')
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.api_key || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: provider.model,
            max_tokens: 2048,
            messages: messages.filter(m => m.role !== 'system'),
            system: messages.find(m => m.role === 'system')?.content,
          }),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }
        const data = await response.json() as Record<string, unknown>
        const content = data.content as Array<{text: string}> | undefined
        responseText = content?.[0]?.text || 'No response'

      } else if (provider.provider_type === 'ollama') {
        const url = normalizeUrl(provider.base_url, '/api/chat')
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: provider.model, messages, stream: false }),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }
        const data = await response.json() as Record<string, unknown>
        const msg = data.message as { content: string } | undefined
        responseText = msg?.content || 'No response'

      } else {
        // OpenAI-compatible
        const url = normalizeUrl(provider.base_url, '/v1/chat/completions')
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
          },
          body: JSON.stringify({ model: provider.model, messages, max_tokens: 2048 }),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }
        const data = await response.json() as Record<string, unknown>
        const choices = data.choices as Array<{message: {content: string}}> | undefined
        responseText = choices?.[0]?.message?.content || 'No response'
      }

      aiQueries.addMessage(conversationId, 'assistant', responseText)
      console.log('[AI] response saved')
      return { success: true, content: responseText, title: generatedTitle }

    } catch (err) {
      console.error('[AI] ERROR:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // ─── AI Stream Message (for real streaming) ─────────────────────────────────
  // This uses IPC events for streaming
  ipcMain.on('ai:startStream', async (event, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string}, isFirstMessage: boolean = false) => {
    const sendChunk = (chunk: string) => event.sender.send('ai:streamChunk', conversationId, chunk)
    const sendError = (error: string) => event.sender.send('ai:streamError', conversationId, error)
    const sendEnd = (title?: string) => event.sender.send('ai:streamEnd', conversationId, title)

    try {
      const lastMsg = messages[messages.length - 1]
      aiQueries.addMessage(conversationId, lastMsg.role, lastMsg.content)

      // Generate title if it's the first message
      let generatedTitle: string | null = null
      if (isFirstMessage && lastMsg.role === 'user') {
        generatedTitle = await generateTitleFromMessage(lastMsg.content, provider)
        if (generatedTitle && generatedTitle !== 'New Conversation') {
          const db = getDb()
          db.prepare('UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?').run(generatedTitle, new Date().toISOString(), conversationId)
        }
      }

      let responseText = ''

      if (provider.provider_type === 'ollama') {
        // Ollama native streaming
        const url = normalizeUrl(provider.base_url, '/api/chat')
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: provider.model, messages, stream: true }),
        })

        if (!response.ok) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value)
            const lines = chunk.split('\n').filter(line => line.trim())
            for (const line of lines) {
              try {
                const data = JSON.parse(line) as Record<string, unknown>
                if (data.message && typeof (data.message as {content: string}).content === 'string') {
                  const content = (data.message as {content: string}).content
                  responseText += content
                  sendChunk(content)
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
      } else if (provider.provider_type === 'openai' || provider.provider_type === 'custom') {
        // OpenAI-compatible streaming
        const url = normalizeUrl(provider.base_url, '/v1/chat/completions')
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
          },
          body: JSON.stringify({ model: provider.model, messages, stream: true }),
        })

        if (!response.ok) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value)
            const lines = chunk.split('\n').filter(line => line.trim())
            for (const line of lines) {
              const dataLine = line.replace(/^data: /, '')
              if (dataLine === '[DONE]') continue
              try {
                const data = JSON.parse(dataLine) as Record<string, unknown>
                const choices = data.choices as Array<{delta?: {content?: string}}> | undefined
                const content = choices?.[0]?.delta?.content
                if (content) {
                  responseText += content
                  sendChunk(content)
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
      } else {
        // Non-streaming fallback for Anthropic
        const url = normalizeUrl(provider.base_url, '/v1/messages')
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.api_key || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: provider.model,
            max_tokens: 2048,
            messages: messages.filter(m => m.role !== 'system'),
            system: messages.find(m => m.role === 'system')?.content,
          }),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }
        const data = await response.json() as Record<string, unknown>
        const content = data.content as Array<{text: string}> | undefined
        responseText = content?.[0]?.text || 'No response'
        sendChunk(responseText)
      }

      aiQueries.addMessage(conversationId, 'assistant', responseText)
      sendEnd(generatedTitle || undefined)

    } catch (err) {
      console.error('[AI] Stream ERROR:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      sendError(message)
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
      title: 'Export Aura GTD Data',
      defaultPath: join(app.getPath('documents'), `aura-gtd-export-${new Date().toISOString().split('T')[0]}.json`),
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
}
