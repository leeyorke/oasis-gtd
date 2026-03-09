import { useStore } from '../store/useStore'
import type { ViewType } from '../types'

const NAV_ITEMS: { id: ViewType; label: string }[] = [
  { id: 'next-actions',  label: 'Next Actions' },
  { id: 'projects',      label: 'Projects' },
  { id: 'waiting',       label: 'Waiting For' },
  { id: 'someday',       label: 'Someday' },
  { id: 'weekly-review', label: 'Weekly Review' },
  { id: 'ai-chat',       label: 'AI Assistant' },
]

export default function Sidebar() {
  const { currentView, setView, tasks, projects, waitingItems } = useStore()

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const nextCount = tasks.filter(t => t.status === 'next').length
  const activeCount = projects.filter(p => p.status === 'active').length

  return (
    <nav className="nav-sidebar">
      <div>
        <div className="nav-brand">Aura</div>
        <ul className="nav-links">
          {NAV_ITEMS.map(item => (
            <li key={item.id}>
              <button
                className={`nav-link ${currentView === item.id ? 'active' : ''}`}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="nav-meta">
        {nextCount} Actions<br />
        {activeCount} Projects<br />
        {waitingItems.length} Waiting<br />
        <span style={{ opacity: 0.5, marginTop: '0.5rem', display: 'block' }}>{dateStr}</span>
      </div>
    </nav>
  )
}
