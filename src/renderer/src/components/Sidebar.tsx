import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import type { ViewType } from '../types'
import {
  Zap,
  ArrowRight,
  Calendar,
  Folder,
  Hourglass,
  Repeat,
  Inbox,
  FileText,
  Archive,
  RefreshCw,
  MessageSquare,
  Settings,
  Menu
} from 'lucide-react'

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { currentView, setView, goBack, tasks, projects, waitingItems, settings } = useStore()
  const t = useT()

  const lang = settings.language === 'zh' ? 'zh-CN' : 'en-US'
  const now = new Date()
  const dateStr = now.toLocaleDateString(lang, { weekday: 'long', month: 'short', day: 'numeric' })

  const NAV_ITEMS: { id: ViewType; label: string; icon: React.ElementType }[] = [
    { id: 'start',         label: t.nav_start,          icon: Zap },
    { id: 'next-actions',  label: t.nav_nextActions,    icon: ArrowRight },
    { id: 'schedule',      label: t.nav_schedule,       icon: Calendar },
    { id: 'projects',      label: t.nav_projects,       icon: Folder },
    { id: 'waiting',       label: t.nav_waiting,        icon: Hourglass },
    { id: 'habit',         label: t.nav_habit,          icon: Repeat },
    { id: 'someday',       label: t.nav_someday,        icon: Inbox },
    { id: 'resource',      label: t.nav_resource,       icon: FileText },
    { id: 'archive',       label: t.nav_archive,        icon: Archive },
    { id: 'weekly-review', label: t.nav_weeklyReview,   icon: RefreshCw },
    { id: 'ai-chat',       label: t.nav_aiChat,         icon: MessageSquare },
  ]

  const BOTTOM_ITEMS: { id: ViewType; label: string; icon: React.ElementType }[] = [
    { id: 'settings', label: t.nav_settings, icon: Settings },
  ]

  const nextCount = tasks.filter(tk => tk.status === 'next').length
  const activeCount = projects.filter(p => p.status === 'active').length

  return (
    <nav className={`nav-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div>
        <div className="nav-brand-wrapper">
          <div className="nav-brand">Oasis</div>
          <button
            className="sidebar-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <Menu size={18} />
          </button>
        </div>
        <ul className="nav-links">
          {NAV_ITEMS.map(item => (
            <li key={item.id}>
              <button
                className={`nav-link ${currentView === item.id ? 'active' : ''}`}
                onClick={() => { console.log('Navigation button clicked:', item.id); setView(item.id); }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
              >
                <item.icon size={18} />
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <ul className="nav-links" style={{ marginBottom: '0' }}>
          {BOTTOM_ITEMS.map(item => (
            <li key={item.id}>
              <button
                className={`nav-link ${currentView === item.id ? 'active' : ''}`}
                onClick={() => {
                  console.log('Settings button clicked, current view:', currentView);
                  if (currentView === 'settings') {
                    console.log('Already on settings view, going back to previous view');
                    goBack();
                  } else {
                    setView(item.id);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}
              >
                <item.icon size={18} />
              </button>
            </li>
          ))}
        </ul>

      </div>
    </nav>
  )
}