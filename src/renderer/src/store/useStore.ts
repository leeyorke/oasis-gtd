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
  Note,
  Habit,
  HabitDetail,
  Resource,
} from '../types'

interface AppStore {
  // ─── Navigation ────────────────────────────────────────────────────────────
  currentView: ViewType
  previousView: ViewType
  setView: (view: ViewType) => void
  goBack: () => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  showAddThought: boolean
  setShowAddThought: (show: boolean) => void

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
  updateSomeday: (id: string, updates: Partial<SomedayItem>) => Promise<void>
  removeSomeday: (id: string) => Promise<void>

  // ─── Notes ─────────────────────────────────────────────────────────────────
  notes: Note[]
  loadNotes: () => Promise<void>
  addNote: (note: Omit<Note, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  removeNote: (id: string) => Promise<void>
  searchNotes: (keyword: string) => Promise<void>

  // ─── Resources ─────────────────────────────────────────────────────────────
  resources: Resource[]
  loadResources: () => Promise<void>
  addResource: (resource: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateResource: (id: string, updates: Partial<Resource>) => Promise<void>
  removeResource: (id: string) => Promise<void>

  // ─── Habits ────────────────────────────────────────────────────────────────
  habits: Habit[]
  loadHabits: () => Promise<void>
  selectedHabitId: string | null
  selectedHabit: HabitDetail | null
  loadHabitById: (id: string) => Promise<void>
  addHabit: (habit: Omit<Habit, 'id' | 'created_at' | 'updated_at' | 'streak' | 'completedToday' | 'todayCount' | 'weekRecords'>) => Promise<void>
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>
  removeHabit: (id: string) => Promise<void>
  toggleHabitComplete: (habitId: string, date: string, completed: boolean) => Promise<void>
  incrementHabitCount: (habitId: string, date: string) => Promise<void>
  decrementHabitCount: (habitId: string, date: string) => Promise<void>

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
  streamingMessageId: string | null
  streamingContent: string
  streamCleanup: (() => void) | null
  streamUpdatedMessages: ChatMessage[] | null
  loadProviders: () => Promise<void>
  saveProvider: (provider: Omit<AIProvider, 'id' | 'created_at'> & { id?: string }) => Promise<void>
  setActiveProvider: (id: string) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  updateConversationModel: (id: string, model: string) => Promise<void>
  sendChatMessage: (content: string) => Promise<void>
  stopStreaming: () => void

  // ─── UI ────────────────────────────────────────────────────────────────────
  isCapturing: boolean
  setCapturing: (v: boolean) => void

  // ─── Reminder ──────────────────────────────────────────────────────────────
  showReminder: boolean
  lastReminderDate: string | null
  loadLastReminderDate: () => Promise<void>
  checkReminderScheduled: () => Promise<void>
  dismissReminder: () => Promise<void>

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: AppSettings
  loadSettings: () => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

function logError(context: string, err: unknown): void {
  console.error(`[Store] ${context}:`, err instanceof Error ? err.message : err)
}

function parseModelList(model: string): string[] {
  try {
    const parsed = JSON.parse(model)
    return Array.isArray(parsed) ? parsed : [model]
  } catch {
    return model ? [model] : []
  }
}

export const useStore = create<AppStore>((set, get) => ({
  // ─── Navigation ────────────────────────────────────────────────────────────
  currentView: 'start',
  previousView: 'next-actions',
  setView: (view) => set(state => ({ previousView: state.currentView, currentView: view })),
  goBack: () => set(state => ({ currentView: state.previousView })),
  sidebarCollapsed: false,
  toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  showAddThought: false,
  setShowAddThought: (show) => set({ showAddThought: show }),

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: [],
  loadTasks: async (status) => {
    try {
      const tasks = await window.api.getTasks(status)
      set({ tasks })
    } catch (err) { logError('loadTasks', err) }
  },
  addTask: async (task) => {
    try {
      await window.api.createTask(task)
      await get().loadTasks()
    } catch (err) { logError('addTask', err) }
  },
  updateTask: async (id, updates) => {
    try {
      await window.api.updateTask(id, updates)
      // 全量拉取任务，跨视图（NextActions ↔ Projects ↔ Kanban）状态保持一致
      await get().loadTasks()
    } catch (err) {
      logError('updateTask', err)
      throw err
    }
  },
  removeTask: async (id) => {
    try {
      await window.api.deleteTask(id)
      const tasks = get().tasks.filter(t => t.id !== id)
      set({ tasks })
    } catch (err) { logError('removeTask', err) }
  },

  // ─── Projects ──────────────────────────────────────────────────────────────
  projects: [],
  selectedProjectId: null,
  loadProjects: async () => {
    try {
      const projects = await window.api.getProjects()
      set({ projects })
    } catch (err) { logError('loadProjects', err) }
  },
  addProject: async (project) => {
    try {
      await window.api.createProject(project)
      await get().loadProjects()
    } catch (err) { logError('addProject', err) }
  },
  updateProject: async (id, updates) => {
    try {
      await window.api.updateProject(id, updates)
      await get().loadProjects()
    } catch (err) { logError('updateProject', err) }
  },
  removeProject: async (id) => {
    try {
      await window.api.deleteProject(id)
      const projects = get().projects.filter(p => p.id !== id)
      set({ projects, selectedProjectId: get().selectedProjectId === id ? null : get().selectedProjectId })
    } catch (err) { logError('removeProject', err) }
  },
  setSelectedProject: (id) => set({ selectedProjectId: id }),

  // ─── Waiting ───────────────────────────────────────────────────────────────
  waitingItems: [],
  loadWaiting: async () => {
    try {
      const waitingItems = await window.api.getWaiting()
      set({ waitingItems })
    } catch (err) { logError('loadWaiting', err) }
  },
  addWaiting: async (item) => {
    try {
      await window.api.createWaiting(item)
      await get().loadWaiting()
    } catch (err) { logError('addWaiting', err) }
  },
  removeWaiting: async (id) => {
    try {
      await window.api.deleteWaiting(id)
      const waitingItems = get().waitingItems.filter(w => w.id !== id)
      set({ waitingItems })
    } catch (err) { logError('removeWaiting', err) }
  },

  // ─── Someday ───────────────────────────────────────────────────────────────
  somedayItems: [],
  loadSomeday: async () => {
    try {
      const somedayItems = await window.api.getSomeday()
      set({ somedayItems })
    } catch (err) { logError('loadSomeday', err) }
  },
  addSomeday: async (item) => {
    try {
      await window.api.createSomeday(item)
      await get().loadSomeday()
    } catch (err) { logError('addSomeday', err) }
  },
  updateSomeday: async (id, updates) => {
    try {
      await window.api.updateSomeday(id, updates)
      await get().loadSomeday()
    } catch (err) { logError('updateSomeday', err) }
  },
  removeSomeday: async (id) => {
    try {
      await window.api.deleteSomeday(id)
      const somedayItems = get().somedayItems.filter(s => s.id !== id)
      set({ somedayItems })
    } catch (err) { logError('removeSomeday', err) }
  },

  // ─── Notes ─────────────────────────────────────────────────────────────────
  notes: [],
  loadNotes: async () => {
    try {
      const notes = await window.api.getNotes()
      set({ notes })
    } catch (err) { logError('loadNotes', err) }
  },
  addNote: async (note) => {
    try {
      await window.api.createNote(note)
      await get().loadNotes()
    } catch (err) { logError('addNote', err) }
  },
  updateNote: async (id, updates) => {
    try {
      await window.api.updateNote(id, updates)
      await get().loadNotes()
    } catch (err) { logError('updateNote', err) }
  },
  removeNote: async (id) => {
    try {
      await window.api.deleteNote(id)
      const notes = get().notes.filter(n => n.id !== id)
      set({ notes })
    } catch (err) { logError('removeNote', err) }
  },
  searchNotes: async (keyword) => {
    try {
      const notes = await window.api.searchNotes(keyword)
      set({ notes })
    } catch (err) { logError('searchNotes', err) }
  },

  // ─── Resources ─────────────────────────────────────────────────────────────
  resources: [],
  loadResources: async () => {
    try {
      const resources = await window.api.getResources()
      set({ resources })
    } catch (err) { logError('loadResources', err) }
  },
  addResource: async (resource) => {
    try {
      await window.api.createResource(resource)
      await get().loadResources()
    } catch (err) { logError('addResource', err) }
  },
  updateResource: async (id, updates) => {
    try {
      await window.api.updateResource(id, updates)
      await get().loadResources()
    } catch (err) { logError('updateResource', err) }
  },
  removeResource: async (id) => {
    try {
      await window.api.deleteResource(id)
      const resources = get().resources.filter(r => r.id !== id)
      set({ resources })
    } catch (err) { logError('removeResource', err) }
  },

  // ─── Habits ────────────────────────────────────────────────────────────────
  habits: [],
  selectedHabitId: null,
  selectedHabit: null,
  loadHabits: async () => {
    try {
      const habits = await window.api.getHabits()
      set({ habits })
    } catch (err) { logError('loadHabits', err) }
  },
  loadHabitById: async (id) => {
    try {
      const habit = await window.api.getHabitById(id)
      set({ selectedHabit: habit, selectedHabitId: id })
    } catch (err) { logError('loadHabitById', err) }
  },
  addHabit: async (habit) => {
    try {
      await window.api.createHabit(habit)
      await get().loadHabits()
    } catch (err) { logError('addHabit', err) }
  },
  updateHabit: async (id, updates) => {
    try {
      await window.api.updateHabit(id, updates)
      await get().loadHabits()
    } catch (err) { logError('updateHabit', err) }
  },
  removeHabit: async (id) => {
    try {
      await window.api.deleteHabit(id)
      const habits = get().habits.filter(h => h.id !== id)
      set({ habits })
    } catch (err) { logError('removeHabit', err) }
  },
  toggleHabitComplete: async (habitId, date, completed) => {
    try {
      await window.api.toggleHabitComplete(habitId, date, completed)
      await get().loadHabits()
    } catch (err) { logError('toggleHabitComplete', err) }
  },
  incrementHabitCount: async (habitId, date) => {
    try {
      await window.api.incrementHabitCount(habitId, date)
      await get().loadHabits()
    } catch (err) { logError('incrementHabitCount', err) }
  },
  decrementHabitCount: async (habitId, date) => {
    try {
      await window.api.decrementHabitCount(habitId, date)
      await get().loadHabits()
    } catch (err) { logError('decrementHabitCount', err) }
  },

  // ─── Review ────────────────────────────────────────────────────────────────
  reviewItems: [],
  loadReview: async () => {
    try {
      const reviewItems = await window.api.getReview()
      set({ reviewItems })
    } catch (err) { logError('loadReview', err) }
  },
  toggleReviewItem: async (id, completed) => {
    try {
      await window.api.updateReviewItem(id, completed)
      const reviewItems = get().reviewItems.map(r => r.id === id ? { ...r, completed: completed ? 1 : 0 } : r)
      set({ reviewItems })
    } catch (err) { logError('toggleReviewItem', err) }
  },
  resetReview: async () => {
    try {
      await window.api.resetReview()
      const reviewItems = get().reviewItems.map(r => ({ ...r, completed: 0 }))
      set({ reviewItems })
    } catch (err) { logError('resetReview', err) }
  },

  // ─── AI ────────────────────────────────────────────────────────────────────
  providers: [],
  activeProvider: null,
  conversations: [],
  currentConversationId: null,
  messages: [],
  isAILoading: false,
  streamingMessageId: null,
  streamingContent: '',
  streamCleanup: null,
  streamUpdatedMessages: null,

  loadProviders: async () => {
    try {
      const providers = await window.api.getProviders()
      const activeProvider = providers.find(p => p.is_active) || null
      set({ providers, activeProvider })
    } catch (err) { logError('loadProviders', err) }
  },
  saveProvider: async (provider) => {
    try {
      await window.api.saveProvider(provider)
      await get().loadProviders()
    } catch (err) { logError('saveProvider', err) }
  },
  setActiveProvider: async (id) => {
    try {
      await window.api.setActiveProvider(id)
      await get().loadProviders()
    } catch (err) { logError('setActiveProvider', err) }
  },
  deleteProvider: async (id) => {
    try {
      await window.api.deleteProvider(id)
      await get().loadProviders()
    } catch (err) { logError('deleteProvider', err) }
  },
  loadConversations: async () => {
    try {
      const conversations = await window.api.getConversations()
      set({ conversations })
    } catch (err) { logError('loadConversations', err) }
  },
  selectConversation: async (id) => {
    try {
      const messages = await window.api.getMessages(id)
      set({ currentConversationId: id, messages, streamingMessageId: null, streamingContent: '' })
    } catch (err) { logError('selectConversation', err) }
  },
  newConversation: async () => {
    try {
      const { activeProvider } = get()
      if (!activeProvider) return
      // Extract first model from provider's model field (may be JSON array)
      const models = parseModelList(activeProvider.model)
      const defaultModel = models[0] || activeProvider.model
      const id = await window.api.createConversation('New Conversation', activeProvider.id, defaultModel)
      await get().loadConversations()
      set({ currentConversationId: id, messages: [], streamingMessageId: null, streamingContent: '' })
    } catch (err) { logError('newConversation', err) }
  },
  deleteConversation: async (id) => {
    try {
      await window.api.deleteConversation(id)
      const conversations = get().conversations.filter(c => c.id !== id)
      const currentId = get().currentConversationId === id ? null : get().currentConversationId
      set({ conversations, currentConversationId: currentId, messages: currentId ? get().messages : [], streamingMessageId: null, streamingContent: '' })
    } catch (err) { logError('deleteConversation', err) }
  },
  renameConversation: async (id, title) => {
    try {
      await window.api.renameConversation(id, title)
      const conversations = get().conversations.map(c => c.id === id ? { ...c, title } : c)
      set({ conversations })
    } catch (err) { logError('renameConversation', err) }
  },
  updateConversationModel: async (id, model) => {
    try {
      await window.api.updateConversationModel(id, model)
      const conversations = get().conversations.map(c => c.id === id ? { ...c, model } : c)
      set({ conversations })
    } catch (err) { logError('updateConversationModel', err) }
  },
  sendChatMessage: async (content) => {
    const { currentConversationId, messages: currentMessages, activeProvider, conversations } = get()
    if (!currentConversationId || !activeProvider) return

    // Clean up any existing listeners first
    const cleanup = () => {
      window.api.offAIStreamStart(onStreamStart)
      window.api.offAIStreamChunk(onStreamChunk)
      window.api.offAIStreamEnd(onStreamEnd)
      window.api.offAIStreamError(onStreamError)
    }

    // Add user message immediately
    const userMsg: ChatMessage = { role: 'user', content }
    const updatedMessages = [...currentMessages, userMsg]
    const tempAssistantId = Date.now().toString()
    set({
      messages: updatedMessages,
      isAILoading: true,
      streamingMessageId: tempAssistantId,
      streamingContent: '',
      streamCleanup: cleanup,
      streamUpdatedMessages: updatedMessages,
    })

    // Event handlers
    const onStreamStart = (_event: any, data: { conversationId: string }) => {
      if (data.conversationId !== currentConversationId) return
    }

    // RAF 节流：合并同一帧内的多个 chunk，减少 React 重渲染频率
    let rawBuffer = ''
    let rafScheduled = false

    const flushBuffer = () => {
      if (rawBuffer) {
        set(state => ({
          streamingContent: state.streamingContent + rawBuffer,
        }))
        rawBuffer = ''
      }
      rafScheduled = false
    }

    const onStreamChunk = (_event: any, data: { conversationId: string; content: string }) => {
      if (data.conversationId !== currentConversationId) return
      rawBuffer += data.content
      if (!rafScheduled) {
        rafScheduled = true
        requestAnimationFrame(flushBuffer)
      }
    }

    const onStreamEnd = (_event: any, data: { conversationId: string; content: string; title?: string; aborted?: boolean }) => {
      if (data.conversationId !== currentConversationId) return

      // Use the streamed content if available, otherwise use what was passed
      const finalContent = data.aborted ? get().streamingContent : data.content
      const streamedContent = get().streamingContent

      // If aborted and we have partial content, use that; otherwise use the data content
      const assistantContent = data.aborted && streamedContent ? streamedContent : data.content

      if (assistantContent) {
        const assistantMsg: ChatMessage = { role: 'assistant', content: assistantContent }
        set(state => ({
          messages: [...updatedMessages, assistantMsg],
          isAILoading: false,
          streamingMessageId: null,
          streamingContent: '',
          streamCleanup: null,
          streamUpdatedMessages: null,
        }))
      } else {
        set({
          isAILoading: false,
          streamingMessageId: null,
          streamingContent: '',
          streamCleanup: null,
          streamUpdatedMessages: null,
        })
      }

      // Update conversation title if one was generated
      if (data.title) {
        set(state => ({
          conversations: state.conversations.map(c =>
            c.id === currentConversationId ? { ...c, title: data.title } : c
          ),
        }))
      }

      cleanup()
    }

    const onStreamError = (_event: any, data: { conversationId: string; error: string }) => {
      if (data.conversationId !== currentConversationId) return

      const errorMsg: ChatMessage = { role: 'assistant', content: `Error: ${data.error}` }
      set(state => ({
        messages: [...updatedMessages, errorMsg],
        isAILoading: false,
        streamingMessageId: null,
        streamingContent: '',
        streamCleanup: null,
        streamUpdatedMessages: null,
      }))

      cleanup()
    }

    // Register listeners
    window.api.onAIStreamStart(onStreamStart)
    window.api.onAIStreamChunk(onStreamChunk)
    window.api.onAIStreamEnd(onStreamEnd)
    window.api.onAIStreamError(onStreamError)

    // Start streaming — use conversation's model if set
    const currentConv = conversations.find(c => c.id === currentConversationId)
    const providerWithModel = currentConv?.model
      ? { ...activeProvider, model: currentConv.model }
      : activeProvider
    // Strip DB metadata fields before sending to AI
    const cleanMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }))
    window.api.sendMessageStream(currentConversationId, cleanMessages, providerWithModel)

    // Also reload conversations to get any updated list
    try {
      await get().loadConversations()
    } catch (err) { logError('sendChatMessage/loadConversations', err) }
  },

  stopStreaming: () => {
    const { currentConversationId, isAILoading, streamingContent, streamCleanup, streamUpdatedMessages } = get()
    if (!currentConversationId || !isAILoading) return

    // 1. Call API to stop the stream
    window.api.stopStream(currentConversationId)

    // 2. Clean up event listeners
    if (streamCleanup) streamCleanup()

    // 3. If we have partial content, save it as a message
    if (streamingContent.trim() && streamUpdatedMessages) {
      const assistantMsg: ChatMessage = { role: 'assistant', content: streamingContent }
      set({
        messages: [...streamUpdatedMessages, assistantMsg],
        isAILoading: false,
        streamingContent: '',
        streamingMessageId: null,
        streamCleanup: null,
        streamUpdatedMessages: null,
      })
    } else {
      set({
        isAILoading: false,
        streamingContent: '',
        streamingMessageId: null,
        streamCleanup: null,
        streamUpdatedMessages: null,
      })
    }
  },

  // ─── UI ────────────────────────────────────────────────────────────────────
  isCapturing: false,
  setCapturing: (v) => set({ isCapturing: v }),

  // ─── Reminder ──────────────────────────────────────────────────────────────
  showReminder: false,
  lastReminderDate: null,
  loadLastReminderDate: async () => {
    // Always show reminder on app start (first launch & restart)
    set({ showReminder: true })
  },
  checkReminderScheduled: async () => {
    // For 8:00 AM scheduled check — only show if not dismissed today
    try {
      const raw = await window.api.getSettings()
      const date = raw.last_reminder_date || null
      const today = new Date().toISOString().split('T')[0]
      if (date !== today) {
        set({ showReminder: true, lastReminderDate: date })
      }
    } catch (err) { logError('checkReminderScheduled', err) }
  },
  dismissReminder: async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      await window.api.setSetting('last_reminder_date', today)
      set({ showReminder: false, lastReminderDate: today })
    } catch (err) { logError('dismissReminder', err) }
  },

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: {
    app_name: 'Oasis',
    review_day: 0,
    default_capture_status: 'inbox',
    contexts: ['@Email', '@Office', '@Deep Work', '@Design', '@Admin', '@Phone', '@Errands', '@Computer', '@Home'],
    language: 'en',
    shortcuts: { toggleSidebar: 'Ctrl+\\', newThought: 'Ctrl+N' },
    proxy_host: '',
    proxy_port: 0,
  },
  loadSettings: async () => {
    try {
      const raw = await window.api.getSettings()
      const autoLaunch = await window.api.getAutoLaunch()
      set({
        settings: {
          app_name: raw.app_name ?? 'Oasis',
          review_day: Number(raw.review_day ?? 0),
          default_capture_status: (raw.default_capture_status as AppSettings['default_capture_status']) ?? 'inbox',
          contexts: raw.contexts ? JSON.parse(raw.contexts) : [],
          language: (raw.language as AppSettings['language']) ?? 'en',
          auto_launch: autoLaunch ?? false,
          shortcuts: raw.shortcuts ? JSON.parse(raw.shortcuts) : { toggleSidebar: 'Ctrl+\\', newThought: 'Ctrl+N' },
          proxy_host: raw.proxy_host ?? '',
          proxy_port: Number(raw.proxy_port ?? 0),
        },
      })
    } catch (err) { logError('loadSettings', err) }
  },
  updateSetting: async (key, value) => {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value)
      await window.api.setSetting(key, serialized)
      // Sync auto_launch to OS login items
      if (key === 'auto_launch') {
        await window.api.setAutoLaunch(value as boolean)
      }
      // Sync quick capture shortcut to globalShortcut
      if (key === 'shortcuts') {
        const shortcuts = value as Record<string, string>
        const combo = shortcuts.newThought || 'Ctrl+N'
        window.api.registerQuickCaptureShortcut(combo)
      }
      // Sync proxy settings to main process session
      if (key === 'proxy_host' || key === 'proxy_port') {
        const state = get()
        const host = key === 'proxy_host' ? (value as string) : state.settings.proxy_host
        const port = key === 'proxy_port' ? (value as number) : state.settings.proxy_port
        window.api.setProxy(host, port)
      }
      set(state => ({ settings: { ...state.settings, [key]: value } }))
    } catch (err) { logError('updateSetting', err) }
  },
}))
