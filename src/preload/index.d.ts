import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      minimize: () => void
      maximize: () => void
      close: () => void
      getTasks: (status?: string) => Promise<Task[]>
      createTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => Promise<string>
      updateTask: (id: string, updates: Partial<Task>) => Promise<void>
      deleteTask: (id: string) => Promise<void>
      getProjects: () => Promise<Project[]>
      createProject: (project: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'taskCount'>) => Promise<string>
      updateProject: (id: string, updates: Partial<Project>) => Promise<void>
      deleteProject: (id: string) => Promise<void>
      getWaiting: () => Promise<WaitingItem[]>
      createWaiting: (item: Omit<WaitingItem, 'id' | 'created_at'>) => Promise<string>
      deleteWaiting: (id: string) => Promise<void>
      getSomeday: () => Promise<SomedayItem[]>
      createSomeday: (item: Omit<SomedayItem, 'id' | 'created_at'>) => Promise<string>
      deleteSomeday: (id: string) => Promise<void>
      getReview: () => Promise<ReviewItem[]>
      updateReviewItem: (id: string, completed: boolean) => Promise<void>
      resetReview: () => Promise<void>
      getProviders: () => Promise<AIProvider[]>
      saveProvider: (provider: Omit<AIProvider, 'id' | 'created_at'>) => Promise<string>
      setActiveProvider: (id: string) => Promise<void>
      deleteProvider: (id: string) => Promise<void>
      getConversations: () => Promise<ChatConversation[]>
      createConversation: (title: string, providerId: string) => Promise<string>
      updateConversationTitle: (id: string, title: string) => Promise<void>
      getMessages: (conversationId: string) => Promise<ChatMessage[]>
      deleteConversation: (id: string) => Promise<void>
      sendMessage: (conversationId: string, messages: ChatMessage[], provider: AIProvider, isFirstMessage?: boolean) => Promise<{success: boolean; content?: string; error?: string; title?: string}>
      startStream: (conversationId: string, messages: ChatMessage[], provider: AIProvider, isFirstMessage?: boolean) => void
      onStreamChunk: (callback: (conversationId: string, chunk: string) => void) => void
      onStreamError: (callback: (conversationId: string, error: string) => void) => void
      onStreamEnd: (callback: (conversationId: string, title?: string) => void) => void
      removeStreamListeners: () => void
      // Settings
      getSettings: () => Promise<Record<string, string>>
      setSetting: (key: string, value: string) => Promise<void>
      // Data
      getStats: () => Promise<{tasks: number; nextActions: number; doneTasks: number; projects: number; waitingItems: number; somedayItems: number; conversations: number; messages: number}>
      getDbPath: () => Promise<string>
      clearCompleted: () => Promise<{success: boolean}>
      clearChatHistory: () => Promise<{success: boolean}>
      exportJSON: () => Promise<{success: boolean; path?: string; canceled?: boolean; error?: string}>
    }
  }
}
