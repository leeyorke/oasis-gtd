import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { X, Calendar, Flag, Zap, ArrowRight, Calendar as CalendarIcon, Folder, Hourglass, Repeat, Inbox, FileText } from 'lucide-react'

// Mock tasks data - will be replaced with real data from store
const mockTasks = [
  {
    id: 1,
    title: '完善 Oasis 设计系统的排版细节',
    project: 'Branding',
    due: 'Due Today',
    completed: false
  },
  {
    id: 2,
    title: '发送 Q3 进度报告给投资人',
    project: 'Strategy',
    due: '2:00 PM',
    completed: false
  },
  {
    id: 3,
    title: '预定周五晚上的餐厅',
    project: 'Personal',
    due: 'Priority 2',
    completed: false
  },
  {
    id: 4,
    title: '整理摄影集素材',
    project: 'Creative',
    due: 'Evening',
    completed: false
  }
]

export default function Start() {
  const { tasks, settings, addTask } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  // Add Task Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('next')

  // Get high priority tasks (status: 'next')
  const priorityTasks = tasks.filter(task => task.status === 'next')
  const displayTasks = priorityTasks.length > 0 ? priorityTasks : mockTasks

  const categories = [
    { id: 'next', label: isZh ? '立即做' : 'Priority Focus', icon: Zap },
    { id: 'next-actions', label: isZh ? '下一步行动' : 'Next Actions', icon: ArrowRight },
    { id: 'schedule', label: isZh ? '日程' : 'Schedule', icon: CalendarIcon },
    { id: 'projects', label: isZh ? '项目' : 'Projects', icon: Folder },
    { id: 'waiting', label: isZh ? '等待' : 'Waiting', icon: Hourglass },
    { id: 'habit', label: isZh ? '习惯' : 'Habit', icon: Repeat },
    { id: 'someday', label: isZh ? '将来做' : 'Someday', icon: Inbox },
    { id: 'resource', label: isZh ? '资源' : 'Resource', icon: FileText },
  ]

  const handleSaveTask = async () => {
    if (!taskTitle.trim()) return
    await addTask({
      title: taskTitle.trim(),
      description: taskNotes.trim(),
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
            <div className="task-checkbox"></div>
            <div className="task-content">
              <div className="task-title">{task.title}</div>
              <div className="task-meta">
                <span>{task.project || 'Project'}</span>
                <span className="meta-dot"></span>
                <span>{task.due || 'No due date'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FAB Button */}
      <button
        className="fab-button"
        data-media-type="banani-button"
        onClick={() => setShowAddModal(true)}
      >
        <div style={{ width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      </button>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="add-task-modal" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div className="header-label">{isZh ? '添加待办' : 'Add Task'}</div>
              <div
                className="close-btn"
                data-media-type="banani-button"
                onClick={() => setShowAddModal(false)}
              >
                <X size={16} />
              </div>
            </div>

            {/* Content */}
            <div className="modal-content">
              <input
                type="text"
                className="task-title-input"
                placeholder={isZh ? '准备做什么？' : 'What needs to be done?'}
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                autoFocus
              />
              <textarea
                className="task-notes-input"
                placeholder={isZh ? '添加备注或详细描述...' : 'Add notes or detailed description...'}
                value={taskNotes}
                onChange={e => setTaskNotes(e.target.value)}
              />

              <div className="quick-actions">
                <div className="action-btn" data-media-type="banani-button">
                  <Calendar size={14} />
                  {isZh ? '设置日期' : 'Set Date'}
                </div>
                <div className="action-btn" data-media-type="banani-button">
                  <Flag size={14} />
                  {isZh ? '优先级' : 'Priority'}
                </div>
              </div>

              <div className="divider"></div>

              <div className="section-title">{isZh ? '分类' : 'Category'}</div>
              <div className="chips-container">
                {categories.map(category => (
                  <div
                    key={category.id}
                    className={`chip ${selectedCategory === category.id ? 'active' : ''}`}
                    data-media-type="banani-button"
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    <category.icon size={14} />
                    {category.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                data-media-type="banani-button"
                onClick={() => setShowAddModal(false)}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                data-media-type="banani-button"
                onClick={handleSaveTask}
              >
                {isZh ? '保存任务' : 'Save Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
