export type ViewType = 'start' | 'next-actions' | 'schedule' | 'habit' | 'resource' | 'archive' | 'projects' | 'waiting' | 'someday' | 'weekly-review' | 'ai-chat' | 'settings'

export interface AppSettings {
  app_name: string
  review_day: number          // 0=Sun ... 6=Sat
  default_capture_status: 'inbox' | 'next'
  contexts: string[]          // custom @context list
  language: 'en' | 'zh'
}

export interface Task {
  id: string
  title: string
  notes?: string
  context?: string
  due_date?: string
  project_id?: string
  status: 'inbox' | 'next' | 'waiting' | 'someday' | 'done'
  waiting_for?: string
  priority?: 'high' | 'medium' | 'low'
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  title: string
  description?: string
  outcome?: string
  status: 'active' | 'on-hold' | 'completed' | 'someday'
  taskCount?: number
  created_at: string
  updated_at: string
}

export interface WaitingItem {
  id: string
  title: string
  waiting_for: string
  since: string
  project_id?: string
  notes?: string
  created_at: string
}

export interface SomedayItem {
  id: string
  title: string
  notes?: string
  horizon: 'soon' | '1month' | '3months' | '1year' | 'someday'
  created_at: string
}

export interface ReviewItem {
  id: string
  category: string
  title: string
  completed: number
  review_date?: string
}

export interface AIProvider {
  id: string
  name: string
  provider_type: 'openai' | 'anthropic' | 'ollama' | 'custom'
  base_url: string
  model: string
  api_key?: string
  system_prompt?: string
  temperature?: number
  max_tokens?: number
  is_active: number
  created_at: string
}

export interface ChatConversation {
  id: string
  title: string
  provider_id?: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id?: string
  conversation_id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at?: string
}