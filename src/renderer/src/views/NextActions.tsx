import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Plus, Pencil, Trash2, Check, RefreshCw, Clock } from 'lucide-react'
import QuickAddTaskModal from '../components/QuickAddTaskModal'
import TaskEditSidebar from '../components/TaskEditSidebar'

export default function NextActions() {
  const { tasks, projects, removeTask, loadTasks, settings, updateTask } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'
  const [showAddModal, setShowAddModal] = useState(false)
  // Edit Task Sidebar state
  const [editingSidebarVisible, setEditingSidebarVisible] = useState(false)
  const [selectedEditingTask, setSelectedEditingTask] = useState<any>(null)

  const nextTasks = tasks.filter(tk => tk.status === 'next')
  // 把 projects 数组转成 { id -> title } 查找表，避免渲染时 N+1
  const projectMap = new Map(projects.map(p => [p.id, p.title]))
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
  const lang = settings.language === 'zh' ? 'zh-CN' : 'en-US'

  const formatDate = (date?: string) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString(lang, { month: 'short', day: 'numeric' })
  }

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 1) return isZh ? '刚刚' : 'Just now'
    if (diffMins < 60) return isZh ? `${diffMins}分钟前` : `${diffMins}m ago`
    if (diffHours < 24) return isZh ? `${diffHours}小时前` : `${diffHours}h ago`
    if (diffDays < 7) return isZh ? `${diffDays}天前` : `${diffDays}d ago`
    return date.toLocaleDateString(lang, { month: 'short', day: 'numeric' })
  }

  const getPriorityLabel = (priority?: string) => {
    const labels: Record<string, string> = {
      high: isZh ? '高优先级' : 'High',
      medium: isZh ? '中优先级' : 'Medium',
      low: isZh ? '低优先级' : 'Low',
    }
    return labels[priority || 'medium'] || labels.medium
  }

  const handleComplete = async (id: string) => {
    setCompletingTaskId(id)
    setTimeout(async () => {
      try {
        await window.api.updateTask(id, { status: 'done' })
        await loadTasks()
      } catch (err) {
        console.error('Failed to complete task', id, err)
      }
    }, 100)
  }

  const handleEditTask = (task: any) => {
    setSelectedEditingTask(task)
    setEditingSidebarVisible(true)
  }

  const handleDeleteTask = async (taskId: string) => {
    console.log('Deleting task:', taskId)
    try {
      await removeTask(taskId)
      console.log('Task deleted successfully')
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  return (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{isZh ? '下一步行动' : 'Next Actions'}</h1>
        <div className="page-subtitle">{isZh ? '等待处理的行动项' : 'Actions to Process'}</div>
      </div>

      <div className="task-list">
        {nextTasks.length === 0 ? (
          <div style={{ fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', fontSize: '1.2rem', color: 'var(--muted-foreground)', fontStyle: 'italic', paddingTop: '2rem', textAlign: 'center' }}>
            {isZh ? '暂无下一步行动' : 'No next actions yet'}
          </div>
        ) : (
          nextTasks.map(task => (
            <div key={task.id} className="task-card" data-media-type="banani-button">
              <div className="task-main">
                <div
                  className={`task-checkbox ${completingTaskId === task.id ? 'checked' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleComplete(task.id)
                  }}
                >
                  <Check size={12} style={{ opacity: completingTaskId === task.id ? 1 : 0 }} />
                </div>
                <div className="task-content">
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    {task.context && <span>{task.context}</span>}
                    {task.context && task.due_date && <span className="meta-dot"></span>}
                    {task.due_date && <span>{formatDate(task.due_date)}</span>}
                    {task.context || task.due_date ? <span className="meta-dot"></span> : null}
                    <span className={`priority-dot priority-${task.priority || 'medium'}`}></span>
                    <span>{getPriorityLabel(task.priority)}</span>
                    <span className="meta-dot"></span>
                    <Clock size={10} />
                    <span>{formatTimeAgo(task.created_at)}</span>
                    {task.project_id && projectMap.get(task.project_id) && (
                      <>
                        <span className="meta-dot"></span>
                        <span title={projectMap.get(task.project_id)}>
                          {projectMap.get(task.project_id)}
                        </span>
                      </>
                    )}
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
          defaultCategory="next"
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