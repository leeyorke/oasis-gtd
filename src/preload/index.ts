import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type AIStreamStartCallback = (event: IpcRendererEvent, data: { conversationId: string }) => void
type AIStreamChunkCallback = (event: IpcRendererEvent, data: { conversationId: string; content: string }) => void
type AIStreamEndCallback = (event: IpcRendererEvent, data: { conversationId: string; content: string; title?: string; aborted?: boolean }) => void
type AIStreamErrorCallback = (event: IpcRendererEvent, data: { conversationId: string; error: string }) => void

const api = {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Tasks
  getTasks: (status?: string) =>
    status ? ipcRenderer.invoke('tasks:getByStatus', status) : ipcRenderer.invoke('tasks:getAll'),
  createTask: (task: unknown) => ipcRenderer.invoke('tasks:create', task),
  updateTask: (id: string, updates: unknown) => ipcRenderer.invoke('tasks:update', id, updates),
  deleteTask: (id: string) => ipcRenderer.invoke('tasks:delete', id),

  // Projects
  getProjects: () => ipcRenderer.invoke('projects:getAll'),
  createProject: (project: unknown) => ipcRenderer.invoke('projects:create', project),
  updateProject: (id: string, updates: unknown) => ipcRenderer.invoke('projects:update', id, updates),
  deleteProject: (id: string) => ipcRenderer.invoke('projects:delete', id),

  // Waiting
  getWaiting: () => ipcRenderer.invoke('waiting:getAll'),
  createWaiting: (item: unknown) => ipcRenderer.invoke('waiting:create', item),
  deleteWaiting: (id: string) => ipcRenderer.invoke('waiting:delete', id),

  // Someday
  getSomeday: () => ipcRenderer.invoke('someday:getAll'),
  createSomeday: (item: unknown) => ipcRenderer.invoke('someday:create', item),
  updateSomeday: (id: string, updates: unknown) => ipcRenderer.invoke('someday:update', id, updates),
  deleteSomeday: (id: string) => ipcRenderer.invoke('someday:delete', id),

  // Notes
  getNotes: () => ipcRenderer.invoke('notes:getAll'),
  getNoteById: (id: string) => ipcRenderer.invoke('notes:getById', id),
  searchNotes: (keyword: string) => ipcRenderer.invoke('notes:search', keyword),
  createNote: (note: unknown) => ipcRenderer.invoke('notes:create', note),
  updateNote: (id: string, updates: unknown) => ipcRenderer.invoke('notes:update', id, updates),
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id),

  // Resources
  getResources: () => ipcRenderer.invoke('resources:getAll'),
  getResourceById: (id: string) => ipcRenderer.invoke('resources:getById', id),
  createResource: (resource: unknown) => ipcRenderer.invoke('resources:create', resource),
  updateResource: (id: string, updates: unknown) => ipcRenderer.invoke('resources:update', id, updates),
  deleteResource: (id: string) => ipcRenderer.invoke('resources:delete', id),

  // Habits
  getHabits: () => ipcRenderer.invoke('habits:getAll'),
  getHabitById: (id: string) => ipcRenderer.invoke('habits:getById', id),
  createHabit: (habit: unknown) => ipcRenderer.invoke('habits:create', habit),
  updateHabit: (id: string, updates: unknown) => ipcRenderer.invoke('habits:update', id, updates),
  deleteHabit: (id: string) => ipcRenderer.invoke('habits:delete', id),
  toggleHabitComplete: (habitId: string, date: string, completed: boolean) =>
    ipcRenderer.invoke('habits:toggleComplete', habitId, date, completed),
  incrementHabitCount: (habitId: string, date: string) =>
    ipcRenderer.invoke('habits:incrementCount', habitId, date),
  decrementHabitCount: (habitId: string, date: string) =>
    ipcRenderer.invoke('habits:decrementCount', habitId, date),

  // Review
  getReview: () => ipcRenderer.invoke('review:getAll'),
  updateReviewItem: (id: string, completed: boolean) => ipcRenderer.invoke('review:updateItem', id, completed),
  resetReview: () => ipcRenderer.invoke('review:resetAll'),

  // AI
  getProviders: () => ipcRenderer.invoke('ai:getProviders'),
  saveProvider: (provider: unknown) => ipcRenderer.invoke('ai:saveProvider', provider),
  setActiveProvider: (id: string) => ipcRenderer.invoke('ai:setActive', id),
  deleteProvider: (id: string) => ipcRenderer.invoke('ai:deleteProvider', id),

  // Chat
  getConversations: () => ipcRenderer.invoke('chat:getConversations'),
  createConversation: (title: string, providerId: string) =>
    ipcRenderer.invoke('chat:createConversation', title, providerId),
  getMessages: (conversationId: string) => ipcRenderer.invoke('chat:getMessages', conversationId),
  deleteConversation: (id: string) => ipcRenderer.invoke('chat:deleteConversation', id),
  renameConversation: (id: string, title: string) => ipcRenderer.invoke('chat:renameConversation', id, title),
  sendMessage: (conversationId: string, messages: unknown[], provider: unknown) =>
    ipcRenderer.invoke('ai:sendMessage', conversationId, messages, provider),

  // AI Streaming
  sendMessageStream: (conversationId: string, messages: unknown[], provider: unknown) =>
    ipcRenderer.send('ai:sendMessageStream', conversationId, messages, provider),
  stopStream: (conversationId: string) =>
    ipcRenderer.send('ai:stopStream', conversationId),
  onAIStreamStart: (callback: AIStreamStartCallback) =>
    ipcRenderer.on('ai:startStream', callback),
  onAIStreamChunk: (callback: AIStreamChunkCallback) =>
    ipcRenderer.on('ai:streamChunk', callback),
  onAIStreamEnd: (callback: AIStreamEndCallback) =>
    ipcRenderer.on('ai:streamEnd', callback),
  onAIStreamError: (callback: AIStreamErrorCallback) =>
    ipcRenderer.on('ai:streamError', callback),
  offAIStreamStart: (callback: AIStreamStartCallback) =>
    ipcRenderer.off('ai:startStream', callback),
  offAIStreamChunk: (callback: AIStreamChunkCallback) =>
    ipcRenderer.off('ai:streamChunk', callback),
  offAIStreamEnd: (callback: AIStreamEndCallback) =>
    ipcRenderer.off('ai:streamEnd', callback),
  offAIStreamError: (callback: AIStreamErrorCallback) =>
    ipcRenderer.off('ai:streamError', callback),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

  // Data management
  getStats: () => ipcRenderer.invoke('data:getStats'),
  getDbPath: () => ipcRenderer.invoke('data:getDbPath'),
  clearCompleted: () => ipcRenderer.invoke('data:clearCompleted'),
  clearChatHistory: () => ipcRenderer.invoke('data:clearChatHistory'),
  exportJSON: () => ipcRenderer.invoke('data:exportJSON'),

  // Chat export
  exportConversationMarkdown: (conversationId: string, title: string, messages: Array<{role: string; content: string}>) =>
    ipcRenderer.invoke('chat:exportMarkdown', conversationId, title, messages),

  // File operations
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
