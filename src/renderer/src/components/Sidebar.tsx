import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import type { ViewType } from '../types'

export default function Sidebar() {
  const { currentView, setView, goBack, tasks, projects, waitingItems, settings } = useStore()
  const t = useT()

  const lang = settings.language === 'zh' ? 'zh-CN' : 'en-US'
  const now = new Date()
  const dateStr = now.toLocaleDateString(lang, { weekday: 'long', month: 'short', day: 'numeric' })

  const NAV_ITEMS: { id: ViewType; label: string }[] = [
    { id: 'next-actions',  label: t.nav_nextActions },
    { id: 'projects',      label: t.nav_projects },
    { id: 'waiting',       label: t.nav_waiting },
    { id: 'someday',       label: t.nav_someday },
    { id: 'weekly-review', label: t.nav_weeklyReview },
    { id: 'ai-chat',       label: t.nav_aiChat },
  ]

  const BOTTOM_ITEMS: { id: ViewType; label: string }[] = [
    { id: 'settings', label: t.nav_settings },
  ]

  const nextCount = tasks.filter(tk => tk.status === 'next').length
  const activeCount = projects.filter(p => p.status === 'active').length

  return (
    <nav className="nav-sidebar">
      <div>
        <div className="nav-brand">Oasis</div>
        <ul className="nav-links">
          {NAV_ITEMS.map(item => (
            <li key={item.id}>
              <button
                className={`nav-link ${currentView === item.id ? 'active' : ''}`}
                onClick={() => { console.log('Navigation button clicked:', item.id); setView(item.id); }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <ul className="nav-links" style={{ marginBottom: '1.2rem' }}>
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
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="nav-meta">
          {nextCount} {t.nav_meta_actions}<br />
          {activeCount} {t.nav_meta_projects}<br />
          {waitingItems.length} {t.nav_meta_waiting}<br />
          <span style={{ opacity: 0.5, marginTop: '0.5rem', display: 'block' }}>{dateStr}</span>
        </div>
      </div>
    </nav>
  )
}