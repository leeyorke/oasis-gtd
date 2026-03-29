import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { X, Calendar, Flag, Zap, ArrowRight, Calendar as CalendarIcon, Folder, Hourglass, Repeat, Inbox, FileText } from 'lucide-react'

interface QuickAddTaskModalProps {
  onClose: () => void
  editingTask?: any
  defaultCategory?: string
}

export default function QuickAddTaskModal({ onClose, editingTask, defaultCategory = 'next' }: QuickAddTaskModalProps) {
  const { addTask, updateTask, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  const [taskTitle, setTaskTitle] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory)

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

  useEffect(() => {
    if (editingTask) {
      setTaskTitle(editingTask.title)
      setTaskNotes(editingTask.notes || '')
      setSelectedCategory(editingTask.status || defaultCategory)
    } else {
      setTaskTitle('')
      setTaskNotes('')
      setSelectedCategory(defaultCategory)
    }
  }, [editingTask, defaultCategory])

  const handleSaveTask = async () => {
    if (!taskTitle.trim()) return
    if (editingTask) {
      await updateTask(editingTask.id, {
        title: taskTitle.trim(),
        notes: taskNotes.trim(),
        status: selectedCategory as any
      })
    } else {
      await addTask({
        title: taskTitle.trim(),
        notes: taskNotes.trim(),
        status: selectedCategory as any
      })
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={() => onClose()}>
      <div className="add-task-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="header-label">{editingTask ? (isZh ? '编辑事项' : 'Edit Item') : (isZh ? '添加事项' : 'Add Item')}</div>
          <div
            className="close-btn"
            data-media-type="banani-button"
            onClick={() => onClose()}
          >
            <X size={16} />
          </div>
        </div>

        {/* Content */}
        <div className="modal-content">
          <input
            type="text"
            className="task-title-input"
            placeholder={isZh ? '想记录什么？' : 'What do you want to record?'}
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

          <div className="quick-actions" style={{ marginTop: '20px' }}>
            <div className="action-btn" data-media-type="banani-button">
              <Calendar size={14} />
              {isZh ? '设置日期' : 'Set Date'}
            </div>
            <div className="action-btn" data-media-type="banani-button">
              <Flag size={14} />
              {isZh ? '优先级' : 'Priority'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            data-media-type="banani-button"
            onClick={() => onClose()}
          >
            {isZh ? '取消' : 'Cancel'}
          </button>
          <button
            className="btn btn-primary"
            data-media-type="banani-button"
            onClick={handleSaveTask}
          >
            {isZh ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}