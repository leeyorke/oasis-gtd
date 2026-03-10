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
} from '../db/database'

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

  // ─── AI Send Message ────────────────────────────────────────────────────────
  ipcMain.handle('ai:sendMessage', async (_, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string}) => {
    const isTitleCall = conversationId === '__title__'

    if (!isTitleCall) {
      console.log('\n[AI] ── sendMessage called ──────────────────────────')
      console.log('[AI] conversationId:', conversationId)
      console.log('[AI] provider_type:', provider.provider_type)
      console.log('[AI] base_url:', provider.base_url)
      console.log('[AI] model:', provider.model)
      console.log('[AI] api_key set:', !!provider.api_key)
      console.log('[AI] messages count:', messages.length)
      console.log('[AI] last message:', messages[messages.length - 1])
    }

    try {
      // Save user message — skip for ephemeral title generation calls
      if (!isTitleCall) {
        const lastMsg = messages[messages.length - 1]
        aiQueries.addMessage(conversationId, lastMsg.role, lastMsg.content)
        console.log('[AI] user message saved to DB')
      }

      // Helper: safely parse JSON, returning null on empty/invalid body
      const safeJson = async (res: Response): Promise<Record<string, unknown> | null> => {
        const text = await res.text()
        if (!text.trim()) return null
        try { return JSON.parse(text) } catch { return { __raw: text } }
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
        if (!isTitleCall) console.log('[AI] Anthropic HTTP status:', response.status, response.statusText)
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
        }
        const data = await safeJson(response)
        if (!isTitleCall) console.log('[AI] Anthropic response:', JSON.stringify(data).slice(0, 300))
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
        if (!isTitleCall) console.log('[AI] Ollama HTTP status:', response.status, response.statusText)
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
        }
        const data = await safeJson(response)
        if (!isTitleCall) console.log('[AI] Ollama response:', JSON.stringify(data).slice(0, 300))
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
        if (!isTitleCall) console.log('[AI] OpenAI HTTP status:', response.status, response.statusText)
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
        }
        const data = await safeJson(response)
        if (!isTitleCall) console.log('[AI] OpenAI response:', JSON.stringify(data).slice(0, 300))
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