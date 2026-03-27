import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useParallax } from '../hooks/useParallax'
import { useT } from '../i18n/useT'
import QuickCapture from '../components/QuickCapture'
import AddTaskModal from '../components/AddTaskModal'

export default function Habit() {
  const { tasks, removeTask, loadTasks, settings } = useStore()
  const mouse = useParallax()
  const t = useT()
  const [showAddModal, setShowAddModal] = useState(false)

  // Filter tasks with status 'habit'
  const habitTasks = tasks.filter(tk => tk.status === 'habit')
  const lang = settings.language === 'zh' ? 'zh-CN' : 'en-US'

  const formatDate = (date?: string) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString(lang, { month: 'short', day: 'numeric' })
  }

  const handleComplete = async (id: string) => {
    await window.api.updateTask(id, { status: 'done' })
    await loadTasks('habit')
  }

  return (
    <div className="composition">
      <main className="sheet-main" style={{ transform: `translate(${mouse.x * 5}px, ${mouse.y * 5}px)` }}>
        <div className="list-container">
          <div className="list-header">
            <div>{t.na_colAction}</div>
            <div>{t.na_colContext}</div>
            <div>{t.na_colDue}</div>
          </div>

          <div className="task-list">
            {habitTasks.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--ink-secondary)', fontStyle: 'italic', paddingTop: '1.5rem' }}>
                {t.na_empty}
              </div>
            ) : (
              habitTasks.map((task, i) => (
                <div key={task.id} className="task-row fade-in" style={{ animationDelay: `${i * 0.05}s` }} title={task.notes || ''}>
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">{task.context && <span className="task-tag">{task.context}</span>}</div>
                  <div className="task-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{formatDate(task.due_date)}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-text" onClick={e => { e.stopPropagation(); handleComplete(task.id) }} title="Mark done" style={{ fontSize: '0.7rem' }}>✓</button>
                      <button className="btn-text" onClick={e => { e.stopPropagation(); removeTask(task.id) }} title="Delete" style={{ fontSize: '0.7rem' }}>×</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <footer className="sheet-footer">
          <div className="footer-logo">{t.na_footerLogo}</div>
          <div className="footer-block">
            <div className="footer-title">{t.na_footerStatus}</div>
            <div className="footer-text">{t.na_count(habitTasks.length)}</div>
            <div className="footer-text">
              <button className="btn-text" onClick={() => setShowAddModal(true)} style={{ color: 'var(--ink-secondary)', paddingLeft: 0 }}>
                {t.na_addAction}
              </button>
            </div>
          </div>
          <div className="footer-block">
            <div className="footer-title">{t.na_footerCtxs}</div>
            {Array.from(new Set(habitTasks.map(tk => tk.context).filter(Boolean))).slice(0, 3).map(ctx => (
              <div key={ctx} className="footer-text">{ctx}</div>
            ))}
          </div>
        </footer>
      </main>

      <div className="sheet-blue" style={{ transform: `translate(${mouse.x * -10}px, ${mouse.y * -10}px)` }}>
        <div style={{ position: 'relative', zIndex: 3, width: '100%', height: '100%', backgroundImage: `url('https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=2070&auto=format&fit=crop')`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.6, mixBlendMode: 'multiply', filter: 'grayscale(100%) contrast(1.2)', transition: 'transform 2s var(--ease-out), opacity 0.8s ease' }} />
        <div style={{ position: 'absolute', bottom: '1.5rem', left: '2rem', color: 'rgba(244,243,239,0.5)', fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.2em', zIndex: 4 }}>
          {t.nav_habit} — {habitTasks.length} items
        </div>
      </div>

      <QuickCapture style={{ transform: `rotate(-2deg) translate(${mouse.x * 15}px, ${mouse.y * 15}px)` }} />
      {showAddModal && <AddTaskModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}