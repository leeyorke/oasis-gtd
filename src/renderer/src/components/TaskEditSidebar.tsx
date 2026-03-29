import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { X, Clock } from 'lucide-react'

interface TaskEditSidebarProps {
  task: any
  onClose: () => void
}

export default function TaskEditSidebar({ task, onClose }: TaskEditSidebarProps) {
  const { updateTask, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'
  const [taskTitle, setTaskTitle] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  const [taskPriority, setTaskPriority] = useState<'high' | 'medium' | 'low'>('medium')

  useEffect(() => {
    if (task) {
      setTaskTitle(task.title)
      setTaskNotes(task.notes || '')
      setTaskPriority(task.priority || 'medium')
    }
  }, [task])

  const handlePriorityChange = async (newPriority: 'high' | 'medium' | 'low') => {
    setTaskPriority(newPriority)
    if (task) {
      await updateTask(task.id, {
        title: taskTitle.trim(),
        notes: taskNotes.trim(),
        priority: newPriority
      })
    }
  }

  const handleSave = async () => {
    try {
      if (task && taskTitle.trim()) {
        await updateTask(task.id, {
          title: taskTitle.trim(),
          notes: taskNotes.trim(),
          priority: taskPriority
        })
      }
    } catch (e) {
      console.error('Update failed:', e)
    }
    onClose()
  }

  // 格式化任务创建时间
  const formatTimeAgo = (createdAt: string) => {
    if (!createdAt) return ''
    const now = new Date()
    const created = new Date(createdAt)
    const diffMs = now.getTime() - created.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return isZh ? '刚刚' : 'Just now'
    if (diffMins < 60) return isZh ? `${diffMins} 分钟前` : `${diffMins} min ago`
    if (diffHours < 24) return isZh ? `${diffHours} 小时前` : `${diffHours} hours ago`
    if (diffDays < 7) return isZh ? `${diffDays} 天前` : `${diffDays} days ago`
    return created.toLocaleDateString()
  }

  // 获取优先级标签
  const getPriorityLabel = () => {
    const priority = task?.priority || 'medium'
    const labels: Record<string, string> = {
      high: isZh ? '高优先级' : 'High Priority',
      medium: isZh ? '中优先级' : 'Medium Priority',
      low: isZh ? '低优先级' : 'Low Priority',
    }
    return labels[priority] || labels.medium
  }

  return (
    <>
      {/* 遮罩层 */}
      <div className="sidebar-overlay" onClick={handleSave} />
      {/* 侧边栏 - Task Detail Panel */}
      <aside className="task-detail-sidebar">
        {/* Panel Header */}
        <div className="detail-header">
          <span className="detail-header-label">{isZh ? '任务详情' : 'Task Detail'}</span>
          <button className="detail-close-btn" onClick={handleSave}>
            <X size={18} />
          </button>
        </div>

        {/* Panel Content */}
        <div className="detail-content">
          {/* Priority Badge & Timestamp */}
          <div className="detail-meta-row">
            <span className={`priority-dot priority-${taskPriority}`}></span>
            <select
              className="priority-select"
              value={taskPriority}
              onChange={(e) => handlePriorityChange(e.target.value as 'high' | 'medium' | 'low')}
            >
              <option value="high">{isZh ? '高优先级' : 'High'}</option>
              <option value="medium">{isZh ? '中优先级' : 'Medium'}</option>
              <option value="low">{isZh ? '低优先级' : 'Low'}</option>
            </select>
            <span className="meta-separator">·</span>
            <Clock size={12} />
            <time className="task-timestamp">
              {formatTimeAgo(task?.created_at)}
            </time>
          </div>

          {/* Task Title - 使用 font-headline (Newsreader) */}
          <input
            type="text"
            className="detail-task-title-input"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder={isZh ? '无标题任务' : 'Untitled Task'}
          />

          {/* Description Section */}
          <div className="detail-section">
            <h3 className="detail-section-title">{isZh ? '描述' : 'Description'}</h3>
            <textarea
              className="detail-description-input"
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              placeholder={isZh ? '暂无描述...' : 'No description yet...'}
              rows={4}
            />
          </div>

          {/* Action Button */}
          <button className="detail-action-btn" onClick={handleSave}>
            {isZh ? '更新' : 'Update'}
          </button>
        </div>
      </aside>
    </>
  )
}
