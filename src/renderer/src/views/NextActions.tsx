import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useParallax } from '../hooks/useParallax'
import QuickCapture from '../components/QuickCapture'
import AddTaskModal from '../components/AddTaskModal'

export default function NextActions() {
  const { tasks, removeTask, loadTasks } = useStore()
  const mouse = useParallax()
  const [showAddModal, setShowAddModal] = useState(false)

  const nextTasks = tasks.filter(t => t.status === 'next')

  const formatDate = (date?: string) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const handleComplete = async (id: string) => {
    await window.api.updateTask(id, { status: 'done' })
    await loadTasks('next')
  }

  return (
    <div className="composition">
      {/* ─── Main Sheet ─────────────────────────────────────────── */}
      <main
        className="sheet-main"
        style={{ transform: `translate(${mouse.x * 5}px, ${mouse.y * 5}px)` }}
      >
        <div className="list-container">
          <div className="list-header">
            <div>Action Item</div>
            <div>Context</div>
            <div>Due / Defer</div>
          </div>

          <div className="task-list">
            {nextTasks.length === 0 ? (
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                color: 'var(--ink-secondary)',
                fontStyle: 'italic',
                paddingTop: '1.5rem'
              }}>
                All clear. Capture something new.
              </div>
            ) : (
              nextTasks.map((task, i) => (
                <div
                  key={task.id}
                  className="task-row fade-in"
                  style={{ animationDelay: `${i * 0.05}s` }}
                  title={task.notes || ''}
                >
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    {task.context && <span className="task-tag">{task.context}</span>}
                  </div>
                  <div className="task-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{formatDate(task.due_date)}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn-text"
                        onClick={e => { e.stopPropagation(); handleComplete(task.id) }}
                        title="Mark done"
                        style={{ fontSize: '0.7rem' }}
                      >
                        ✓
                      </button>
                      <button
                        className="btn-text"
                        onClick={e => { e.stopPropagation(); removeTask(task.id) }}
                        title="Delete"
                        style={{ fontSize: '0.7rem' }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <footer className="sheet-footer">
          <div className="footer-logo">Focus</div>
          <div className="footer-block">
            <div className="footer-title">System Status</div>
            <div className="footer-text">{nextTasks.length} Next Actions</div>
            <div className="footer-text">
              <button
                className="btn-text"
                onClick={() => setShowAddModal(true)}
                style={{ color: 'var(--ink-secondary)', paddingLeft: 0 }}
              >
                + Add Action
              </button>
            </div>
          </div>
          <div className="footer-block">
            <div className="footer-title">Contexts</div>
            {Array.from(new Set(nextTasks.map(t => t.context).filter(Boolean))).slice(0, 3).map(ctx => (
              <div key={ctx} className="footer-text">{ctx}</div>
            ))}
          </div>
        </footer>
      </main>

      {/* ─── Blue Sheet ─────────────────────────────────────────── */}
      <div
        className="sheet-blue"
        style={{ transform: `translate(${mouse.x * -10}px, ${mouse.y * -10}px)` }}
      >
        <div style={{
          position: 'relative',
          zIndex: 3,
          width: '100%',
          height: '100%',
          backgroundImage: `url('https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=2070&auto=format&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.6,
          mixBlendMode: 'multiply',
          filter: 'grayscale(100%) contrast(1.2)',
          transition: 'transform 2s var(--ease-out), opacity 0.8s ease',
        }} />
        {/* Overlay text */}
        <div style={{
          position: 'absolute',
          bottom: '1.5rem',
          left: '2rem',
          color: 'rgba(244,243,239,0.5)',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.55rem',
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          zIndex: 4,
        }}>
          Next Actions — {nextTasks.length} items
        </div>
      </div>

      {/* ─── White Capture Card ──────────────────────────────────── */}
      <QuickCapture
        style={{ transform: `rotate(-2deg) translate(${mouse.x * 15}px, ${mouse.y * 15}px)` }}
      />

      {showAddModal && <AddTaskModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}
