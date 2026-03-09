import { create } from 'zustand'
import type {
  ViewType,
  Task,
  Project,
  WaitingItem,
  SomedayItem,
  ReviewItem,
  AIProvider,
  ChatConversation,
  ChatMessage,
  AppSettings,
} from '../types'

interface AppStore {
  // ─── Navigation ────────────────────────────────────────────────────────────
  currentView: ViewType
  setView: (view: ViewType) => void

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: Task[]
  loadTasks: (status?: string) => Promise<void>
  addTask: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>
  removeTask: (id: string) => Promise<void>

  // ─── Projects ──────────────────────────────────────────────────────────────
  projects: Project[]
  selectedProjectId: string | null
  loadProjects: () => Promise<void>
  addProject: (project: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'taskCount'>) => Promise<void>
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>
  removeProject: (id: string) => Promise<void>
  setSelectedProject: (id: string | null) => void

  // ─── Waiting ───────────────────────────────────────────────────────────────
  waitingItems: WaitingItem[]
  loadWaiting: () => Promise<void>
  addWaiting: (item: Omit<WaitingItem, 'id' | 'created_at'>) => Promise<void>
  removeWaiting: (id: string) => Promise<void>

  // ─── Someday ───────────────────────────────────────────────────────────────
  somedayItems: SomedayItem[]
  loadSomeday: () => Promise<void>
  addSomeday: (item: Omit<SomedayItem, 'id' | 'created_at'>) => Promise<void>
  removeSomeday: (id: string) => Promise<void>

  // ─── Review ────────────────────────────────────────────────────────────────
  reviewItems: ReviewItem[]
  loadReview: () => Promise<void>
  toggleReviewItem: (id: string, completed: boolean) => Promise<void>
  resetReview: () => Promise<void>

  // ─── AI ────────────────────────────────────────────────────────────────────
  providers: AIProvider[]
  activeProvider: AIProvider | null
  conversations: ChatConversation[]
  currentConversationId: string | null
  messages: ChatMessage[]
  isAILoading: boolean
  loadProviders: () => Promise<void>
  saveProvider: (provider: Omit<AIProvider, 'id' | 'created_at'>) => Promise<void>
  setActiveProvider: (id: string) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  sendChatMessage: (content: string) => Promise<void>

  // ─── UI ────────────────────────────────────────────────────────────────────
  isCapturing: boolean
  setCapturing: (v: boolean) => void

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: AppSettings
  loadSettings: () => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

export const useStore = create<AppStore>((set, get) => ({
  // ─── Navigation ────────────────────────────────────────────────────────────
  currentView: 'next-actions',
  setView: (view) => set({ currentView: view }),

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: [],
  loadTasks: async (status) => {
    const tasks = await window.api.getTasks(status)
    set({ tasks })
  },
  addTask: async (task) => {
    await window.api.createTask(task)
    await get().loadTasks(task.status)
  },
  updateTask: async (id, updates) => {
    await window.api.updateTask(id, updates)
    const currentView = get().currentView
    const status = currentView === 'next-actions' ? 'next' : undefined
    await get().loadTasks(status)
  },
  removeTask: async (id) => {
    await window.api.deleteTask(id)
    const tasks = get().tasks.filter(t => t.id !== id)
    set({ tasks })
  },

  // ─── Projects ──────────────────────────────────────────────────────────────
  projects: [],
  selectedProjectId: null,
  loadProjects: async () => {
    const projects = await window.api.getProjects()
    set({ projects })
  },
  addProject: async (project) => {
    await window.api.createProject(project)
    await get().loadProjects()
  },
  updateProject: async (id, updates) => {
    await window.api.updateProject(id, updates)
    await get().loadProjects()
  },
  removeProject: async (id) => {
    await window.api.deleteProject(id)
    const projects = get().projects.filter(p => p.id !== id)
    set({ projects, selectedProjectId: get().selectedProjectId === id ? null : get().selectedProjectId })
  },
  setSelectedProject: (id) => set({ selectedProjectId: id }),

  // ─── Waiting ───────────────────────────────────────────────────────────────
  waitingItems: [],
  loadWaiting: async () => {
    const waitingItems = await window.api.getWaiting()
    set({ waitingItems })
  },
  addWaiting: async (item) => {
    await window.api.createWaiting(item)
    await get().loadWaiting()
  },
  removeWaiting: async (id) => {
    await window.api.deleteWaiting(id)
    const waitingItems = get().waitingItems.filter(w => w.id !== id)
    set({ waitingItems })
  },

  // ─── Someday ───────────────────────────────────────────────────────────────
  somedayItems: [],
  loadSomeday: async () => {
    const somedayItems = await window.api.getSomeday()
    set({ somedayItems })
  },
  addSomeday: async (item) => {
    await window.api.createSomeday(item)
    await get().loadSomeday()
  },
  removeSomeday: async (id) => {
    await window.api.deleteSomeday(id)
    const somedayItems = get().somedayItems.filter(s => s.id !== id)
    set({ somedayItems })
  },

  // ─── Review ────────────────────────────────────────────────────────────────
  reviewItems: [],
  loadReview: async () => {
    const reviewItems = await window.api.getReview()
    set({ reviewItems })
  },
  toggleReviewItem: async (id, completed) => {
    await window.api.updateReviewItem(id, completed)
    const reviewItems = get().reviewItems.map(r => r.id === id ? { ...r, completed: completed ? 1 : 0 } : r)
    set({ reviewItems })
  },
  resetReview: async () => {
    await window.api.resetReview()
    const reviewItems = get().reviewItems.map(r => ({ ...r, completed: 0 }))
    set({ reviewItems })
  },

  // ─── AI ────────────────────────────────────────────────────────────────────
  providers: [],
  activeProvider: null,
  conversations: [],
  currentConversationId: null,
  messages: [],
  isAILoading: false,

  loadProviders: async () => {
    const providers = await window.api.getProviders()
    const activeProvider = providers.find(p => p.is_active) || null
    set({ providers, activeProvider })
  },
  saveProvider: async (provider) => {
    await window.api.saveProvider(provider)
    await get().loadProviders()
  },
  setActiveProvider: async (id) => {
    await window.api.setActiveProvider(id)
    await get().loadProviders()
  },
  deleteProvider: async (id) => {
    await window.api.deleteProvider(id)
    await get().loadProviders()
  },
  loadConversations: async () => {
    const conversations = await window.api.getConversations()
    set({ conversations })
  },
  selectConversation: async (id) => {
    const messages = await window.api.getMessages(id)
    set({ currentConversationId: id, messages })
  },
  newConversation: async () => {
    const { activeProvider } = get()
    if (!activeProvider) return
    const id = await window.api.createConversation('New Conversation', activeProvider.id)
    await get().loadConversations()
    set({ currentConversationId: id, messages: [] })
  },
  deleteConversation: async (id) => {
    await window.api.deleteConversation(id)
    const conversations = get().conversations.filter(c => c.id !== id)
    const currentId = get().currentConversationId === id ? null : get().currentConversationId
    set({ conversations, currentConversationId: currentId, messages: currentId ? get().messages : [] })
  },
  sendChatMessage: async (content) => {
    const { currentConversationId, messages, activeProvider } = get()
    if (!currentConversationId || !activeProvider) return

    const userMsg: ChatMessage = { role: 'user', content }
    const updatedMessages = [...messages, userMsg]
    set({ messages: updatedMessages, isAILoading: true })

    const result = await window.api.sendMessage(currentConversationId, updatedMessages, activeProvider)

    if (result.success && result.content) {
      const assistantMsg: ChatMessage = { role: 'assistant', content: result.content }
      set({ messages: [...updatedMessages, assistantMsg], isAILoading: false })
    } else {
      const errorMsg: ChatMessage = { role: 'assistant', content: `Error: ${result.error || 'Unknown error'}` }
      set({ messages: [...updatedMessages, errorMsg], isAILoading: false })
    }
  },

  // ─── UI ────────────────────────────────────────────────────────────────────
  isCapturing: false,
  setCapturing: (v) => set({ isCapturing: v }),

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: {
    app_name: 'Aura',
    review_day: 0,
    default_capture_status: 'inbox',
    contexts: ['@Email', '@Office', '@Deep Work', '@Design', '@Admin', '@Phone', '@Errands', '@Computer', '@Home'],
  },
  loadSettings: async () => {
    const raw = await window.api.getSettings()
    set({
      settings: {
        app_name: raw.app_name ?? 'Aura',
        review_day: Number(raw.review_day ?? 0),
        default_capture_status: (raw.default_capture_status as AppSettings['default_capture_status']) ?? 'inbox',
        contexts: raw.contexts ? JSON.parse(raw.contexts) : [],
      },
    })
  },
  updateSetting: async (key, value) => {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value)
    await window.api.setSetting(key, serialized)
    set(state => ({ settings: { ...state.settings, [key]: value } }))
  },
}))
