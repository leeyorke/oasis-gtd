import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Trash2 } from 'lucide-react'

export default function Archive() {
  const { tasks, removeTask, loadTasks, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  // Filter tasks with status 'archive'
  const archiveTasks = tasks.filter(tk => tk.status === 'archive')

  const formatArchiveDate = (date?: string) => {
    if (!date) return ''
    const d = new Date(date)
    return `Archived ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }

  const handleDeleteTask = async (taskId: string) => {
    await removeTask(taskId)
  }

  return (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{isZh ? '归档' : 'Archive'}</h1>
        <div className="page-subtitle">{isZh ? '已完成的任务' : 'Past & Completed'}</div>
      </div>

      <div className="task-list">
        {archiveTasks.length === 0 ? (
          <div style={{ fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', fontSize: '1.2rem', color: 'var(--muted-foreground)', fontStyle: 'italic', paddingTop: '2rem', textAlign: 'center' }}>
            {isZh ? '暂无归档任务' : 'No archived tasks'}
          </div>
        ) : (
          archiveTasks.map((task, i) => (
            <div key={task.id} className="task-card" data-media-type="banani-button">
              <div className="task-main">
                <div className="task-checkbox checked">
                  <span style={{ fontSize: '12px' }}>✓</span>
                </div>
                <div className="task-content">
                  <div className="task-title completed">{task.title}</div>
                  <div className="task-meta">
                    {task.context && <span>{task.context}</span>}
                    {task.context && <span className="meta-dot"></span>}
                    <span>{formatArchiveDate(task.updated_at)}</span>
                  </div>
                </div>
              </div>
              <div className="task-actions">
                <button
                  type="button"
                  className="task-action-button delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteTask(task.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  )
}
