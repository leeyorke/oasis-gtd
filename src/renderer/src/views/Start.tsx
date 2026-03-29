import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Pencil, Trash2, RefreshCw, Plus, Check } from 'lucide-react'
import QuickAddTaskModal from '../components/QuickAddTaskModal'
import TaskEditSidebar from '../components/TaskEditSidebar'

export default function Start() {
  const { tasks, settings, addTask, updateTask, removeTask, loadTasks } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  // Add Task Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  // Edit Task Sidebar state
  const [editingSidebarVisible, setEditingSidebarVisible] = useState(false)
  const [selectedEditingTask, setSelectedEditingTask] = useState<any>(null)

  // Get priority focus tasks (status: 'priority')
  const displayTasks = tasks.filter(task => task.status === 'priority')
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)

  const handleEditTask = (task: any) => {
    setSelectedEditingTask(task)
    setEditingSidebarVisible(true)
  }

  const handleComplete = async (id: string) => {
    setCompletingTaskId(id)
    setTimeout(async () => {
      await window.api.updateTask(id, { status: 'archive' })
      await loadTasks()
    }, 100)
  }

  const handleDeleteTask = async (taskId: string) => {
    await removeTask(taskId)
  }

  const handleSaveTask = async () => {
    if (!taskTitle.trim()) return
    await addTask({
      title: taskTitle.trim(),
      notes: taskNotes.trim(),
      status: selectedCategory as any
    })
    // Reset form
    setTaskTitle('')
    setTaskNotes('')
    setSelectedCategory('next')
    setShowAddModal(false)
  }

  return (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{isZh ? '立即做' : 'Priority Focus'}</h1>
        <div className="page-subtitle">{isZh ? '高优先级任务' : 'High Priority Focus'}</div>
      </div>

      <div className="task-list">
        {displayTasks.map(task => (
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
                  <span>{task.project || 'Project'}</span>
                  <span className="meta-dot"></span>
                  <span>{task.due || 'No due date'}</span>
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
        ))}
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
          defaultCategory="priority"
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
