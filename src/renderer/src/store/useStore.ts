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
  addHabit: (habit: Omit<Habit, 'id' | 'created_at' | 'updated_at' | 'streak' | 'completedToday' | 'weekRecords'>) => Promise<void>
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>
  removeHabit: (id: string) => Promise<void>
  toggleHabitComplete: (habitId: string, date: string, completed: boolean) => Promise<void>

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
  sendChatMessage: (content: string) => Promise<void>
  stopStreaming: () => void

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
  currentView: 'start',
  previousView: 'next-actions',
  setView: (view) => set(state => ({ previousView: state.currentView, currentView: view })),
  goBack: () => set(state => ({ currentView: state.previousView })),

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: [],
  loadTasks: async (status) => {
    const tasks = await window.api.getTasks(status)
    set({ tasks })
  },
  addTask: async (task) => {
    await window.api.createTask(task)
    await get().loadTasks()
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
  updateSomeday: async (id, updates) => {
    await window.api.updateSomeday(id, updates)
    await get().loadSomeday()
  },
  removeSomeday: async (id) => {
    await window.api.deleteSomeday(id)
    const somedayItems = get().somedayItems.filter(s => s.id !== id)
    set({ somedayItems })
  },

  // ─── Notes ─────────────────────────────────────────────────────────────────
  notes: [],
  loadNotes: async () => {
    const notes = await window.api.getNotes()
    set({ notes })
  },
  addNote: async (note) => {
    await window.api.createNote(note)
    await get().loadNotes()
  },
  updateNote: async (id, updates) => {
    await window.api.updateNote(id, updates)
    await get().loadNotes()
  },
  removeNote: async (id) => {
    await window.api.deleteNote(id)
    const notes = get().notes.filter(n => n.id !== id)
    set({ notes })
  },
  searchNotes: async (keyword) => {
    const notes = await window.api.searchNotes(keyword)
    set({ notes })
  },

  // ─── Resources ─────────────────────────────────────────────────────────────
  resources: [],
  loadResources: async () => {
    const resources = await window.api.getResources()
    set({ resources })
  },
  addResource: async (resource) => {
    await window.api.createResource(resource)
    await get().loadResources()
  },
  updateResource: async (id, updates) => {
    await window.api.updateResource(id, updates)
    await get().loadResources()
  },
  removeResource: async (id) => {
    await window.api.deleteResource(id)
    const resources = get().resources.filter(r => r.id !== id)
    set({ resources })
  },

  // ─── Habits ────────────────────────────────────────────────────────────────
  habits: [],
  selectedHabitId: null,
  selectedHabit: null,
  loadHabits: async () => {
    const habits = await window.api.getHabits()
    set({ habits })
  },
  loadHabitById: async (id) => {
    const habit = await window.api.getHabitById(id)
    set({ selectedHabit: habit, selectedHabitId: id })
  },
  addHabit: async (habit) => {
    await window.api.createHabit(habit)
    await get().loadHabits()
  },
  updateHabit: async (id, updates) => {
    await window.api.updateHabit(id, updates)
    await get().loadHabits()
  },
  removeHabit: async (id) => {
    await window.api.deleteHabit(id)
    const habits = get().habits.filter(h => h.id !== id)
    set({ habits })
  },
  toggleHabitComplete: async (habitId, date, completed) => {
    await window.api.toggleHabitComplete(habitId, date, completed)
    await get().loadHabits()
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
  streamingMessageId: null,
  streamingContent: '',
  streamCleanup: null,
  streamUpdatedMessages: null,

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
    set({ currentConversationId: id, messages, streamingMessageId: null, streamingContent: '' })
  },
  newConversation: async () => {
    const { activeProvider } = get()
    if (!activeProvider) return
    const id = await window.api.createConversation('New Conversation', activeProvider.id)
    await get().loadConversations()
    set({ currentConversationId: id, messages: [], streamingMessageId: null, streamingContent: '' })
  },
  deleteConversation: async (id) => {
    await window.api.deleteConversation(id)
    const conversations = get().conversations.filter(c => c.id !== id)
    const currentId = get().currentConversationId === id ? null : get().currentConversationId
    set({ conversations, currentConversationId: currentId, messages: currentId ? get().messages : [], streamingMessageId: null, streamingContent: '' })
  },
  renameConversation: async (id, title) => {
    await window.api.renameConversation(id, title)
    const conversations = get().conversations.map(c => c.id === id ? { ...c, title } : c)
    set({ conversations })
  },
  sendChatMessage: async (content) => {
    const { currentConversationId, messages: currentMessages, activeProvider } = get()
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

    const onStreamChunk = (_event: any, data: { conversationId: string; content: string }) => {
      if (data.conversationId !== currentConversationId) return
      set(state => ({
        streamingContent: state.streamingContent + data.content,
      }))
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

    // Start streaming
    window.api.sendMessageStream(currentConversationId, updatedMessages, activeProvider)

    // Also reload conversations to get any updated list
    await get().loadConversations()
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

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: {
    app_name: 'Oasis',
    review_day: 0,
    default_capture_status: 'inbox',
    contexts: ['@Email', '@Office', '@Deep Work', '@Design', '@Admin', '@Phone', '@Errands', '@Computer', '@Home'],
    language: 'en',
  },
  loadSettings: async () => {
    const raw = await window.api.getSettings()
    set({
      settings: {
        app_name: raw.app_name ?? 'Oasis',
        review_day: Number(raw.review_day ?? 0),
        default_capture_status: (raw.default_capture_status as AppSettings['default_capture_status']) ?? 'inbox',
        contexts: raw.contexts ? JSON.parse(raw.contexts) : [],
        language: (raw.language as AppSettings['language']) ?? 'en',
      },
    })
  },
  updateSetting: async (key, value) => {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value)
    await window.api.setSetting(key, serialized)
    set(state => ({ settings: { ...state.settings, [key]: value } }))
  },
}))
