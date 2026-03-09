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

  // ─── AI Send Message ────────────────────────────────────────────────────────
  ipcMain.handle('ai:sendMessage', async (_, conversationId: string, messages: Array<{role: string; content: string}>, provider: {provider_type: string; base_url: string; model: string; api_key?: string}) => {
    try {
      // Save user message
      const lastMsg = messages[messages.length - 1]
      aiQueries.addMessage(conversationId, lastMsg.role, lastMsg.content)

      let responseText = ''

      if (provider.provider_type === 'anthropic') {
        const response = await fetch(`${provider.base_url}/v1/messages`, {
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
        const data = await response.json() as { content: Array<{text: string}> }
        responseText = data.content?.[0]?.text || 'No response'

      } else if (provider.provider_type === 'ollama') {
        const response = await fetch(`${provider.base_url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: provider.model,
            messages,
            stream: false,
          }),
        })
        const data = await response.json() as { message: { content: string } }
        responseText = data.message?.content || 'No response'

      } else {
        // OpenAI-compatible
        const response = await fetch(`${provider.base_url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            max_tokens: 2048,
          }),
        })
        const data = await response.json() as { choices: Array<{message: {content: string}}> }
        responseText = data.choices?.[0]?.message?.content || 'No response'
      }

      // Save assistant response
      aiQueries.addMessage(conversationId, 'assistant', responseText)
      return { success: true, content: responseText }
    } catch (err) {
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
