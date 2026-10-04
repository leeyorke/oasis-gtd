import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import type { ViewType } from '../types'
import {
  Feather,
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
  PanelLeft,
  Kanban,
  Timer,
  ChevronDown
} from 'lucide-react'

type NavSlot = 'top' | 'gtd' | 'tail'

/**
 * Icons and grouping are language-independent, so they live outside the
 * component. Keeping this stable is what lets the auto-expand effect below
 * depend on a Set whose identity never changes — otherwise the effect re-runs
 * on every render and snaps the group straight back open.
 *
 * `iconSize` optically normalises the row: every icon renders into the same
 * 18px box, but each icon's artwork fills a different part of lucide's 24×24
 * grid, so the drawn shape ends up anywhere from 12px to 16.5px wide. See
 * ICON_WIDTHS below for the measured values these sizes are derived from.
 */
const NAV_DEFS: {
  id: ViewType
  icon: React.ElementType
  slot: NavSlot
  iconSize?: number
}[] = [
  //                              artwork in the 24×24 grid
  { id: 'thoughts',      icon: Feather,      slot: 'top' },                    // 18.3 wide
  { id: 'kanban',        icon: Kanban,       slot: 'top',    iconSize: 20 },   // 16.0 wide
  { id: 'start',         icon: Zap,          slot: 'gtd',    iconSize: 18 },   // 16.4 wide
  { id: 'next-actions',  icon: ArrowRight,   slot: 'gtd',    iconSize: 18 },   // 18.0 wide
  { id: 'schedule',      icon: Calendar,     slot: 'gtd',    iconSize: 18 },   // 18.0 wide
  { id: 'projects',      icon: Folder,       slot: 'gtd',    iconSize: 18 },   // 18.0 wide
  { id: 'waiting',       icon: Hourglass,    slot: 'gtd',    iconSize: 18 },   // 18.0 wide
  { id: 'habit',         icon: Repeat,       slot: 'gtd',    iconSize: 18 },   // 18.0 wide
  { id: 'resource',      icon: FileText,     slot: 'gtd',    iconSize: 18 },   // 17.0 wide
  { id: 'someday',       icon: Inbox,        slot: 'gtd',    iconSize: 18 },   // 18.0 wide
  { id: 'archive',       icon: Archive,      slot: 'gtd',    iconSize: 18 },   // 18.0 wide
  { id: 'weekly-review', icon: RefreshCw,    slot: 'gtd',    iconSize: 18 },   // 17.4 wide
  { id: 'pomodoro',      icon: Timer,        slot: 'tail',   iconSize: 18 },   // 18.0 wide
  { id: 'ai-chat',       icon: MessageSquare, slot: 'tail',   iconSize: 15 },   // 22.0 wide
]

/** Stable identity — a module constant, never rebuilt per render. */
const GTD_VIEW_IDS: ReadonlySet<ViewType> = new Set(
  NAV_DEFS.filter(def => def.slot === 'gtd').map(def => def.id)
)

type NavItem = (typeof NAV_DEFS)[number] & { label: string }

export default function Sidebar() {
  const { currentView, setView, goBack, sidebarCollapsed, toggleSidebar } = useStore()
  const t = useT()
  const [gtdExpanded, setGtdExpanded] = useState(false)
  // Collapsed-rail hover flyout.
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  // A short close delay bridges the gap between the trigger and the flyout so the
  // pointer can travel there without the panel vanishing underneath it.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openFlyout = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setFlyoutOpen(true)
  }

  const scheduleCloseFlyout = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      setFlyoutOpen(false)
    }, 180)
  }

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  // Labels are the only language-dependent part of the nav, so they are
  // resolved here rather than baked into NAV_DEFS.
  const labels: Partial<Record<ViewType, string>> = {
    'thoughts': t.nav_thoughts,
    'kanban': t.nav_kanban,
    'start': t.nav_start,
    'next-actions': t.nav_nextActions,
    'schedule': t.nav_schedule,
    'projects': t.nav_projects,
    'waiting': t.nav_waiting,
    'habit': t.nav_habit,
    'resource': t.nav_resource,
    'someday': t.nav_someday,
    'archive': t.nav_archive,
    'weekly-review': t.nav_weeklyReview,
    'pomodoro': t.nav_pomodoro,
    'ai-chat': t.nav_aiChat,
  }

  const NAV_ITEMS: NavItem[] = NAV_DEFS.map(def => ({ ...def, label: labels[def.id] ?? '' }))
  const topItems = NAV_ITEMS.filter(i => i.slot === 'top')
  const gtdItems = NAV_ITEMS.filter(i => i.slot === 'gtd')
  const tailItems = NAV_ITEMS.filter(i => i.slot === 'tail')

  // Navigating into a GTD view from anywhere (sidebar, shortcut, reminder)
  // must reveal it instead of leaving the active item hidden inside a closed
  // group. Depends only on `currentView`: toggling the header must never be
  // undone by this effect, so its dependencies have to stay referentially
  // stable across renders.
  useEffect(() => {
    if (GTD_VIEW_IDS.has(currentView)) setGtdExpanded(true)
  }, [currentView])

  // The icon-only rail has no room for the group's children, so they move into
  // a hover flyout instead of rendering inline.
  const showGtdItems = !sidebarCollapsed && gtdExpanded
  const showFlyout = sidebarCollapsed && flyoutOpen

  // Highlight the group itself while one of its views is the active one, so the
  // breadcrumb still reads correctly when the group's children are hidden.
  const gtdActive = GTD_VIEW_IDS.has(currentView)

  // Escape closes the flyout from anywhere inside the group.
  useEffect(() => {
    if (!showFlyout) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlyoutOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showFlyout])

  // Expanding the rail must not leave an orphaned flyout behind.
  useEffect(() => {
    if (!sidebarCollapsed) {
      setFlyoutOpen(false)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [sidebarCollapsed])

  const renderLink = (item: NavItem, onNavigate?: () => void) => (
    <li key={item.id}>
      <button
        className={`nav-link ${currentView === item.id ? 'active' : ''}`}
        data-label={item.label}
        onClick={() => { console.log('Navigation button clicked:', item.id); setView(item.id); onNavigate?.() }}
      >
        <item.icon size={item.iconSize ?? 18} />
        <span className="nav-link-text">{item.label}</span>
      </button>
    </li>
  )

  const BOTTOM_ITEMS: { id: ViewType; label: string; icon: React.ElementType }[] = [
    { id: 'settings', label: t.nav_settings, icon: Settings },
  ]

  return (
    <nav className={`nav-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div>
        <div className="nav-brand-wrapper">
          <div className="logo-icon"><i className="ph-fill ph-plant" /></div>
          <button
            className="sidebar-toggle"
            onClick={() => toggleSidebar()}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <PanelLeft size={18} />
          </button>
        </div>
        <ul className="nav-links">
          {topItems.map(item => renderLink(item))}
        </ul>

        <div className="nav-group">
          <button
            className={`nav-group-header ${gtdActive ? 'active' : ''}`}
            data-label="GTD"
            onClick={() => {
              // Collapsed: the header is the flyout trigger. Expanded: it toggles
              // the inline group.
              if (sidebarCollapsed) setFlyoutOpen(v => !v)
              else setGtdExpanded(v => !v)
            }}
            onMouseEnter={() => { if (sidebarCollapsed) openFlyout() }}
            onMouseLeave={() => { if (sidebarCollapsed) scheduleCloseFlyout() }}
            aria-expanded={sidebarCollapsed ? showFlyout : showGtdItems}
            // Native title only in the expanded rail; the collapsed rail gets a
            // styled tooltip, and both at once would double up.
            title={sidebarCollapsed ? undefined : showGtdItems ? '收起 GTD' : '展开 GTD'}
          >
            <span className="nav-group-heading">
              <i className="ph ph-tray nav-group-icon" aria-hidden="true" />
              <span className="nav-group-label">GTD</span>
            </span>
            <ChevronDown size={14} className={`nav-group-chevron ${showGtdItems ? '' : 'is-collapsed'}`} />
          </button>

          {showGtdItems && (
            <ul className="nav-links nav-group-items">
              {gtdItems.map(item => renderLink(item))}
            </ul>
          )}

          {showFlyout && (
            <div
              className="nav-flyout"
              onMouseEnter={openFlyout}
              onMouseLeave={scheduleCloseFlyout}
            >
              <ul className="nav-links">
                {gtdItems.map(item => renderLink(item, () => setFlyoutOpen(false)))}
              </ul>
            </div>
          )}
        </div>

        <ul className="nav-links nav-links-tail">
          {tailItems.map(item => renderLink(item))}
        </ul>
      </div>

      <div>
        <ul className="nav-links" style={{ marginBottom: '0' }}>
          {BOTTOM_ITEMS.map(item => (
            <li key={item.id}>
              <button
                className={`nav-link ${currentView === item.id ? 'active' : ''}`}
                data-label={item.label}
                onClick={() => {
                  console.log('Settings button clicked, current view:', currentView);
                  if (currentView === 'settings') {
                    console.log('Already on settings view, going back to previous view');
                    goBack();
                  } else {
                    setView(item.id);
                  }
                }}
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