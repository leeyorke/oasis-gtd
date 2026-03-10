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
} from '../db/database'

// Helper: safely parse JSON, returning null on empty/invalid body
const safeJson = async (res: Response): Promise<Record<string, unknown> | null> => {
  const text = await res.text()
  if (!text.trim()) return null
  try { return JSON.parse(text) } catch { return { __raw: text } }
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
  provider: {provider_type: string; base_url: string; model: string; api_key?: string},
  messages: Array<{role: string; content: string}>,
  conversationId: string,
  isTitleCall: boolean
): Promise<string> {
  const url = `${provider.base_url}/v1/chat/completions`
  const maxTokens = isTitleCall ? 30 : 2048

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
      stream: true,
    }),
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
  provider: {provider_type: string; base_url: string; model: string; api_key?: string},
  messages: Array<{role: string; content: string}>,
  conversationId: string,
  isTitleCall: boolean
): Promise<string> {
  const url = `${provider.base_url}/v1/messages`
  const maxTokens = isTitleCall ? 30 : 2048

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
      messages: messages.filter(m => m.role !== 'system'),
      system: messages.find(m => m.role === 'system')?.content,
      stream: true,
    }),
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
  provider: {provider_type: string; base_url: string; model: string; api_key?: string},
  messages: Array<{role: string; content: string}>,
  conversationId: string,
  isTitleCall: boolean
): Promise<string> {
  const url = `${provider.base_url}/api/chat`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: provider.model, messages, stream: true }),
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
  ipcMain.handle('chat:getMessages', (_, conversationId: string) =>
    aiQueries.getMessages(conversationId)
  )
  ipcMain.handle('chat:deleteConversation', (_, id: string) => aiQueries.deleteConversation(id))
  ipcMain.handle('chat:renameConversation', (_, id: string, title: string) =>
    aiQueries.renameConversation(id, title)
  )

  // ─── AI Send Message (Non-streaming for backwards compatibility & title generation) ───────────────────
  ipcMain.handle('ai:sendMessage', async (_, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string}) => {
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
      const maxTokens = isTitleCall ? 30 : 2048

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
            messages: messages.filter(m => m.role !== 'system'),
            system: messages.find(m => m.role === 'system')?.content,
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
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: provider.model, messages, stream: false }),
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
          body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens }),
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
  ipcMain.on('ai:sendMessageStream', async (event, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string}) => {
    const webContents = event.sender
    const isTitleCall = conversationId === '__title__'

    if (!isTitleCall) {
      console.log('\n[AI] ── sendMessageStream called ──────────────────────')
      console.log('[AI] conversationId:', conversationId)
      console.log('[AI] provider_type:', provider.provider_type)
    }

    try {
      // Save user message first
      if (!isTitleCall) {
        const lastMsg = messages[messages.length - 1]
        aiQueries.addMessage(conversationId, lastMsg.role, lastMsg.content)
        console.log('[AI] user message saved to DB')
      }

      let fullContent = ''

      if (provider.provider_type === 'anthropic') {
        fullContent = await streamAnthropic(webContents, provider, messages, conversationId, isTitleCall)
      } else if (provider.provider_type === 'ollama') {
        fullContent = await streamOllama(webContents, provider, messages, conversationId, isTitleCall)
      } else {
        fullContent = await streamOpenAICompatible(webContents, provider, messages, conversationId, isTitleCall)
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
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (!isTitleCall) console.error('[AI] ERROR:', message)
      webContents.send('ai:streamError', { conversationId, error: message })
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
