import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  deleteSomeday: (id: string) => ipcRenderer.invoke('someday:delete', id),

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

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

  // Data management
  getStats: () => ipcRenderer.invoke('data:getStats'),
  getDbPath: () => ipcRenderer.invoke('data:getDbPath'),
  clearCompleted: () => ipcRenderer.invoke('data:clearCompleted'),
  clearChatHistory: () => ipcRenderer.invoke('data:clearChatHistory'),
  exportJSON: () => ipcRenderer.invoke('data:exportJSON'),
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