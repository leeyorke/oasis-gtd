export type ViewType = 'start' | 'next-actions' | 'schedule' | 'habit' | 'habit-detail' | 'resource' | 'archive' | 'projects' | 'waiting' | 'someday' | 'weekly-review' | 'ai-chat' | 'settings' | 'thoughts' | 'kanban' | 'daily-reminder'

export interface AppSettings {
  app_name: string
  review_day: number          // 0=Sun ... 6=Sat
  default_capture_status: 'inbox' | 'next'
  contexts: string[]          // custom @context list
  language: 'en' | 'zh'
  auto_launch: boolean        // start at OS login
  shortcuts: Record<string, string>  // key combos, e.g. { toggleSidebar: 'Ctrl+\\', newThought: 'Ctrl+N' }
  proxy_host: string          // proxy server address, e.g. '127.0.0.1'
  proxy_port: number          // proxy server port, e.g. 7890
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
  status: 'active' | 'on-hold'
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
  category: string
  created_at: string
}

export type SomedayCategory = string

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
  model?: string
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

export interface Note {
  id: string
  content: string
  tags?: string[]
  weather?: string
  created_at: string
  updated_at: string
}

export interface Habit {
  id: string
  title: string
  description?: string
  frequency: 'daily' | 'weekly'
  time_of_day?: string
  color?: string
  created_at: string
  updated_at: string
  is_archived: number
  target: number              // 每日目标次数
  is_quantitative: number     // 0=普通习惯，1=可量化习惯
  streak: number              // 连续打卡天数
  completedToday: boolean     // 今日是否已完成（count >= target）
  todayCount: number          // 今日已打卡次数
  weekRecords: Record<string, number>  // 本周每天打卡次数
}

export interface HabitDetail extends Habit {
  longestStreak: number       // 最长连续打卡天数
  totalSessions: number       // 总打卡次数
  completionRate: number      // 完成率百分比
  allRecords: Record<string, number>   // 12个月每天打卡次数
}

export interface Resource {
  id: string
  title: string
  type: 'document' | 'link' | 'spreadsheet' | 'image' | 'collection'
  description?: string
  fileSize?: string
  url?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}