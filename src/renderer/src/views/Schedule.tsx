import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Plus, Pencil, Trash2, Check, RefreshCw } from 'lucide-react'
import QuickAddTaskModal from '../components/QuickAddTaskModal'
import TaskEditSidebar from '../components/TaskEditSidebar'

export default function Schedule() {
  const { tasks, removeTask, loadTasks, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'
  const [showAddModal, setShowAddModal] = useState(false)
  // Edit Task Sidebar state
  const [editingSidebarVisible, setEditingSidebarVisible] = useState(false)
  const [selectedEditingTask, setSelectedEditingTask] = useState<any>(null)

  // Filter tasks with status 'schedule'
  const scheduleTasks = tasks.filter(tk => tk.status === 'schedule')
  const lang = settings.language === 'zh' ? 'zh-CN' : 'en-US'

  const formatDate = (date?: string) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString(lang, { month: 'short', day: 'numeric' })
  }

  const handleComplete = async (id: string) => {
    await window.api.updateTask(id, { status: 'done' })
    await loadTasks('schedule')
  }

  const handleEditTask = (task: any) => {
    setSelectedEditingTask(task)
    setEditingSidebarVisible(true)
  }

  const handleDeleteTask = async (taskId: string) => {
    await removeTask(taskId)
  }

  return (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{isZh ? '日程' : 'Schedule'}</h1>
        <div className="page-subtitle">{isZh ? '计划中的任务' : 'Scheduled Tasks'}</div>
      </div>

      <div className="task-list">
        {scheduleTasks.length === 0 ? (
          <div style={{ fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', fontSize: '1.2rem', color: 'var(--muted-foreground)', fontStyle: 'italic', paddingTop: '2rem', textAlign: 'center' }}>
            {isZh ? '暂无日程任务' : 'No scheduled tasks yet'}
          </div>
        ) : (
          scheduleTasks.map(task => (
            <div key={task.id} className="task-card" data-media-type="banani-button">
              <div className="task-main">
                <div
                  className="task-checkbox"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleComplete(task.id)
                  }}
                >
                  <Check size={12} style={{ opacity: 0 }} />
                </div>
                <div className="task-content">
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    {task.context && <span>{task.context}</span>}
                    {task.context && task.due_date && <span className="meta-dot"></span>}
                    {task.due_date && <span>{formatDate(task.due_date)}</span>}
                  </div>
                </div>
              </div>
              <div className="task-actions">
                <button
                  className="task-action-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEditTask(task)
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
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

      {/* Add FAB Button */}
      <button
        className="fab-button"
        data-media-type="banani-button"
        onClick={() => setShowAddModal(true)}
      >
        <Plus size={14} />
      </button>

      {/* Add Task Modal */}
      {showAddModal && (
        <QuickAddTaskModal
          onClose={() => {
            setShowAddModal(false)
          }}
          defaultCategory="schedule"
        />
      )}

      {/* Edit Task Sidebar */}
      {editingSidebarVisible && selectedEditingTask && (
        <TaskEditSidebar
          task={selectedEditingTask}
          onClose={() => {
            setEditingSidebarVisible(false)
            setSelectedEditingTask(null)
          }}
        />
      )}
    </main>
  )
}