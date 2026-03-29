import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Plus, Pencil, Trash2 } from 'lucide-react'
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

  // Group tasks by date
  const groupTasksByDate = () => {
    const groups: Record<string, typeof scheduleTasks> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dayAfterTomorrow = new Date(today)
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)

    scheduleTasks.forEach(task => {
      if (!task.due_date) {
        // Tasks without due_date go to 'unscheduled' group
        if (!groups['unscheduled']) groups['unscheduled'] = []
        groups['unscheduled'].push(task)
        return
      }
      const taskDate = new Date(task.due_date)
      taskDate.setHours(0, 0, 0, 0)

      let key: string
      if (taskDate.getTime() === today.getTime()) {
        key = 'today'
      } else if (taskDate.getTime() === tomorrow.getTime()) {
        key = 'tomorrow'
      } else if (taskDate.getTime() > today.getTime()) {
        key = task.due_date
      } else {
        key = 'past'
      }

      if (!groups[key]) groups[key] = []
      groups[key].push(task)
    })

    return groups
  }

  const groupedTasks = groupTasksByDate()

  const getDateLabel = (key: string) => {
    if (key === 'today') return { date: isZh ? '今天' : 'Today', day: new Date().toLocaleDateString(lang, { month: 'long', day: 'numeric' }) }
    if (key === 'tomorrow') return { date: isZh ? '明天' : 'Tomorrow', day: new Date(Date.now() + 86400000).toLocaleDateString(lang, { month: 'long', day: 'numeric' }) }
    if (key === 'past') return { date: isZh ? '已过期' : 'Past', day: '' }
    if (key === 'unscheduled') return { date: isZh ? '未安排' : 'Unscheduled', day: '' }
    return { date: new Date(key).toLocaleDateString(lang, { month: 'long', day: 'numeric' }), day: '' }
  }

  const formatTime = (date?: string) => {
    if (!date) return { start: '--:--', end: '--:--' }
    const d = new Date(date)
    return {
      start: d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }),
      end: ''
    }
  }

  const handleEditTask = (task: any) => {
    setSelectedEditingTask(task)
    setEditingSidebarVisible(true)
  }

  const handleDeleteTask = async (taskId: string) => {
    await removeTask(taskId)
  }

  const sectionOrder = ['today', 'tomorrow', 'past', 'unscheduled']

  // Collect all future date keys and sort them
  const allKeys = Object.keys(groupedTasks)
  const futureDateKeys = allKeys
    .filter(key => key !== 'today' && key !== 'tomorrow' && key !== 'past' && key !== 'unscheduled')
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  const orderedKeys = [...sectionOrder.filter(key => groupedTasks[key]), ...futureDateKeys]

  return (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{isZh ? '日程' : 'Schedule'}</h1>
        <div className="page-subtitle">{isZh ? '计划中的任务' : 'Scheduled Tasks'}</div>
      </div>

      <div className="schedule-container">
        {Object.keys(groupedTasks).length === 0 ? (
          <div style={{ fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', fontSize: '1.2rem', color: 'var(--muted-foreground)', fontStyle: 'italic', paddingTop: '2rem', textAlign: 'center' }}>
            {isZh ? '暂无日程任务' : 'No scheduled tasks yet'}
          </div>
        ) : (
          orderedKeys.map(key => (
            <div key={key} className="schedule-section">
              <div className="schedule-header">
                <div className="schedule-date">{getDateLabel(key).date}</div>
                {getDateLabel(key).day && <div className="schedule-day">{getDateLabel(key).day}</div>}
              </div>

              {groupedTasks[key].map(task => {
                const time = formatTime(task.due_date)
                return (
                  <div key={task.id} className="event-card" data-media-type="banani-button">
                    <div className="event-time">
                      <div className="time-start">{time.start}</div>
                      {time.end && <div className="time-end">{time.end}</div>}
                    </div>
                    <div className="event-content">
                      <div className="event-title">{task.title}</div>
                      {task.context && (
                        <div className="event-meta">
                          <span>{task.context}</span>
                        </div>
                      )}
                    </div>
                    <div className="event-actions">
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
                )
              })}
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