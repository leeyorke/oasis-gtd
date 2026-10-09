import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import type { ViewType } from '../types'

type GroupId = 'overview' | 'gtd' | 'tools'

interface NavItemDef {
  id: ViewType
  /** Phosphor icon class (e.g. 'ph-lightning'). Glyphs are declared in index.css. */
  icon: string
  /** Live count badge — `thoughts` = note count, `priority` = focus-task count. */
  badge?: 'thoughts' | 'priority'
  /** Accent (orange) badge, used for the high-priority focus count. */
  accent?: boolean
}

interface NavGroupDef {
  id: GroupId
  items: NavItemDef[]
}

/**
 * Rail structure and icons are language-independent, so they live outside the
 * component — labels are resolved per render via the translation keys.
 *
 * Grouping and icons follow the Variant reference design:
 *   总览 (overview) · GTD 系统 (gtd) · 效率工具 (tools)
 */
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'overview',
    items: [
      { id: 'thoughts', icon: 'ph-envelope-simple', badge: 'thoughts' },
      { id: 'kanban', icon: 'ph-squares-four' },
    ],
  },
  {
    id: 'gtd',
    items: [
      { id: 'start', icon: 'ph-lightning', badge: 'priority', accent: true },
      { id: 'next-actions', icon: 'ph-arrow-right' },
      { id: 'schedule', icon: 'ph-calendar-blank' },
      { id: 'projects', icon: 'ph-stack' },
      { id: 'waiting', icon: 'ph-hourglass-high' },
      { id: 'habit', icon: 'ph-repeat' },
      { id: 'resource', icon: 'ph-folder-open' },
      { id: 'someday', icon: 'ph-cloud-sun' },
      { id: 'archive', icon: 'ph-archive' },
      { id: 'weekly-review', icon: 'ph-chart-bar' },
    ],
  },
  {
    id: 'tools',
    items: [
      { id: 'pomodoro', icon: 'ph-timer' },
      { id: 'ai-chat', icon: 'ph-sparkle' },
    ],
  },
]

type ExpandedGroups = Record<GroupId, boolean>

const ALL_EXPANDED: ExpandedGroups = { overview: true, gtd: true, tools: true }

/** Stable identity for the auto-expand effect — never rebuilt per render. */
const GROUP_OF_VIEW: Partial<Record<ViewType, GroupId>> = {}
for (const group of NAV_GROUPS) {
  for (const item of group.items) GROUP_OF_VIEW[item.id] = group.id
}

export default function Sidebar() {
  const { currentView, setView, goBack, sidebarCollapsed, toggleSidebar, notes, tasks } = useStore()
  const t = useT()
  // Every group starts open, matching the reference design's resting state.
  const [expanded, setExpanded] = useState<ExpandedGroups>(ALL_EXPANDED)

  // Badge counts: 随想 = captured notes, 立即做 = priority focus tasks.
  // The DB stores a 'priority' status that the Task union doesn't declare —
  // Start.tsx and Kanban.tsx filter on the same value, so compare as string.
  const thoughtsCount = notes.length
  const priorityCount = tasks.filter(task => (task.status as string) === 'priority').length

  // Navigating into a view from anywhere (sidebar, shortcut, reminder) must
  // reveal it instead of leaving the active item hidden inside a closed group.
  // Depends only on the active group so toggling a header is never undone.
  const activeGroup = GROUP_OF_VIEW[currentView]
  useEffect(() => {
    if (!activeGroup) return
    setExpanded(prev => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }))
  }, [activeGroup])

  const groupLabels: Record<GroupId, string> = {
    overview: t.nav_group_overview,
    gtd: t.nav_group_gtd,
    tools: t.nav_group_tools,
  }

  const labels: Partial<Record<ViewType, string>> = {
    thoughts: t.nav_thoughts,
    kanban: t.nav_kanban,
    start: t.nav_start,
    'next-actions': t.nav_nextActions,
    schedule: t.nav_schedule,
    projects: t.nav_projects,
    waiting: t.nav_waiting,
    habit: t.nav_habit,
    resource: t.nav_resource,
    someday: t.nav_someday,
    archive: t.nav_archive,
    'weekly-review': t.nav_weeklyReview,
    pomodoro: t.nav_pomodoro,
    'ai-chat': t.nav_aiChat,
  }

  const badgeCount = (item: NavItemDef): number => {
    if (item.badge === 'thoughts') return thoughtsCount
    if (item.badge === 'priority') return priorityCount
    return 0
  }

  const renderLink = (item: NavItemDef) => {
    const label = labels[item.id] ?? ''
    const count = badgeCount(item)
    return (
      <li key={item.id}>
        <button
          className={`nav-link ${currentView === item.id ? 'active' : ''}`}
          data-label={label}
          onClick={() => setView(item.id)}
        >
          <i className={`ph ${item.icon} nav-link-icon`} aria-hidden="true" />
          <span className="nav-link-text">{label}</span>
          {count > 0 && (
            <span className={`nav-badge ${item.accent ? 'nav-badge-accent' : ''}`}>{count}</span>
          )}
        </button>
      </li>
    )
  }

  return (
    <nav className={`nav-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="nav-sidebar-body">
        <div className="nav-brand-wrapper">
          <div className="nav-brand">
            <i className="ph-fill ph-plant nav-brand-icon" aria-hidden="true" />
            <span className="nav-brand-text">Oasis</span>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => toggleSidebar()}
            title={sidebarCollapsed ? t.nav_expandSidebar : t.nav_collapseSidebar}
          >
            <i className="ph ph-sidebar-simple" aria-hidden="true" />
          </button>
        </div>

        <div className="nav-scroll-area">
          {NAV_GROUPS.map(group => {
            const isOpen = expanded[group.id]
            // The collapsed rail has no room for group headers — every item
            // renders as a bare icon regardless of the group's open state.
            const showItems = sidebarCollapsed || isOpen
            const groupActive = group.items.some(item => item.id === currentView)
            const label = groupLabels[group.id]
            return (
              <div className={`nav-group ${isOpen ? '' : 'collapsed-group'}`} key={group.id}>
                <button
                  className={`nav-group-header ${groupActive ? 'active' : ''}`}
                  data-label={label}
                  onClick={() => setExpanded(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                  aria-expanded={showItems}
                  title={isOpen ? t.nav_collapseGroup : t.nav_expandGroup}
                >
                  <span className="nav-group-label">{label}</span>
                  <i className="ph ph-caret-down nav-group-caret" aria-hidden="true" />
                </button>
                {showItems && (
                  <ul className="nav-links nav-sub">
                    {group.items.map(item => renderLink(item))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="nav-sidebar-footer">
        <ul className="nav-links">
          <li>
            <button
              className={`nav-link ${currentView === 'settings' ? 'active' : ''}`}
              data-label={t.nav_settings}
              onClick={() => {
                if (currentView === 'settings') {
                  goBack()
                } else {
                  setView('settings')
                }
              }}
            >
              <i className="ph ph-gear-six nav-link-icon" aria-hidden="true" />
              <span className="nav-link-text">{t.nav_settings}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  )
}
