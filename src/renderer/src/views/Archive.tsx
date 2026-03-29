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

  const styles = {
    main: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      padding: '72px 80px',
      overflowY: 'auto' as const,
      position: 'relative' as const,
    },
    header: {
      marginBottom: '48px',
    },
    title: {
      fontFamily: '"Songti SC", "Noto Serif CJK SC", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      fontSize: '44px',
      fontWeight: 400,
      color: '#1c1b1a',
      marginBottom: '12px',
      letterSpacing: '2px',
    },
    subtitle: {
      fontSize: '11px',
      textTransform: 'uppercase' as const,
      letterSpacing: '2px',
      color: '#96948f',
      fontWeight: 600,
    },
    list: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      maxWidth: '800px',
      paddingRight: '40px',
    },
    card: {
      backgroundColor: '#fcfbf9',
      border: '1px solid #e6e4df',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
      padding: '24px 32px',
      display: 'flex',
      alignItems: 'center' as const,
      gap: '24px',
      cursor: 'pointer',
      opacity: 0.85,
    },
    checkbox: {
      width: '24px',
      height: '24px',
      border: '1px solid #96948f',
      borderRadius: '50%',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: '#96948f',
      color: '#fcfbf9',
    },
    content: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '6px',
      minWidth: 0,
      flex: 1,
    },
    taskTitle: {
      fontSize: '16px',
      fontWeight: 500,
      color: '#96948f',
      textDecoration: 'line-through' as const,
      letterSpacing: '0.3px',
      lineHeight: 1.4,
    },
    meta: {
      fontSize: '11px',
      textTransform: 'uppercase' as const,
      color: '#96948f',
      letterSpacing: '1px',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center' as const,
      gap: '10px',
    },
    metaDot: {
      width: '4px',
      height: '4px',
      backgroundColor: '#e6e4df',
      borderRadius: '50%',
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flexShrink: 0,
      opacity: 0,
      transition: 'opacity 0.2s ease',
    },
    actionBtn: {
      width: '28px',
      height: '28px',
      border: '1px solid #e6e4df',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#96948f',
      background: '#f0ede8',
      cursor: 'pointer',
    },
  }

  return (
    <main style={styles.main}>
      <div style={styles.header}>
        <h1 style={styles.title}>{isZh ? '归档' : 'Archive'}</h1>
        <div style={styles.subtitle}>{isZh ? '已完成的任务' : 'Past & Completed'}</div>
      </div>

      <div style={styles.list}>
        {archiveTasks.length === 0 ? (
          <div style={{ fontFamily: 'ui-serif, Georgia, serif', fontSize: '1.2rem', color: '#96948f', fontStyle: 'italic', paddingTop: '2rem', textAlign: 'center' }}>
            {isZh ? '暂无归档任务' : 'No archived tasks'}
          </div>
        ) : (
          archiveTasks.map((task, i) => (
            <div
              key={task.id}
              className="archive-task-card"
              style={styles.card}
              onMouseEnter={(e) => {
                const actions = e.currentTarget.querySelector('.archive-task-actions') as HTMLElement
                if (actions) actions.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                const actions = e.currentTarget.querySelector('.archive-task-actions') as HTMLElement
                if (actions) actions.style.opacity = '0'
              }}
            >
              <div style={styles.checkbox}>
                <span style={{ fontSize: '14px' }}>✓</span>
              </div>
              <div style={styles.content}>
                <div style={styles.taskTitle}>{task.title}</div>
                <div style={styles.meta}>
                  {task.context && (
                    <>
                      <span>{task.context}</span>
                      <span style={styles.metaDot}></span>
                    </>
                  )}
                  <span>{formatArchiveDate(task.updated_at)}</span>
                </div>
              </div>
              <div className="archive-task-actions" style={styles.actions}>
                <button
                  style={styles.actionBtn}
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
