import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Plus, Edit2, Trash2, Check } from 'lucide-react'
import QuickAddTaskModal from '../components/QuickAddTaskModal'
import TaskEditSidebar from '../components/TaskEditSidebar'
import type { Task } from '../types'

export default function Kanban() {
  const { tasks, updateTask, removeTask, projects, waitingItems, habits, somedayItems, resources, setView } = useStore()
  const t = useT()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // 跳转到对应页面
  const goToPage = (categoryId: string) => {
    const pageMap: Record<string, ViewType> = {
      start: 'start',
      next: 'next-actions',
      schedule: 'schedule',
      projects: 'projects',
      waiting: 'waiting',
      habit: 'habit',
      someday: 'someday',
      resource: 'resource'
    }
    if (pageMap[categoryId]) {
      setView(pageMap[categoryId])
    }
  }

  // 各分类数据
  const categoryData = {
    start: tasks.filter(t => t.status === 'priority').slice(0, 5),
    next: tasks.filter(t => t.status === 'next').slice(0, 5),
    schedule: tasks.filter(t => t.due_date).slice(0, 5),
    projects: projects.filter(p => p.status === 'active').slice(0, 5),
    waiting: waitingItems.slice(0, 5),
    habit: habits.filter(h => !h.is_archived).slice(0, 5),
    someday: somedayItems.slice(0, 5),
    resource: resources.slice(0, 5)
  }

  // 分组配置 - 和设计稿一致的8个分类
  const groups = [
    { id: 'start', label: t.nav_start, subtitle: 'TODAY\'S PRIORITY' },
    { id: 'next', label: t.nav_nextActions, subtitle: 'NEXT ACTIONS' },
    { id: 'schedule', label: t.nav_schedule, subtitle: 'CALENDAR & FIXED' },
    { id: 'projects', label: t.nav_projects, subtitle: 'ACTIVE PROJECTS' },
    { id: 'waiting', label: t.nav_waiting, subtitle: 'WAITING FOR' },
    { id: 'habit', label: t.nav_habit, subtitle: 'ROUTINES' },
    { id: 'someday', label: t.nav_someday, subtitle: 'SOMEDAY / MAYBE' },
    { id: 'resource', label: t.nav_resource, subtitle: 'REFERENCE MATERIAL' }
  ]

  // 处理任务完成
  const handleToggleComplete = (task: Task) => {
    const newStatus = task.status === 'done' ? 'next' : 'done'
    updateTask(task.id, { status: newStatus })
  }

  // 处理任务删除
  const handleDeleteTask = (id: string) => {
    removeTask(id)
  }

  return (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{t.nav_kanban}</h1>
        <div className="page-subtitle">TASK BOARD WITH COUNTERS</div>
      </div>

      <div className="kanban-board">
        {groups.map(group => (
          <div key={group.id} className="kanban-card">
            <div className="kanban-card-header">
              <div className="kanban-card-title">
                <span>{group.label}</span>
                <span className="kanban-card-count">{categoryData[group.id as keyof typeof categoryData].length}</span>
              </div>
              <div className="kanban-card-subtitle">
                {group.id === 'inbox' && 'INBOX ITEMS'}
                {group.id === 'next' && 'NEXT ACTIONS'}
                {group.id === 'waiting' && 'WAITING FOR'}
                {group.id === 'done' && 'COMPLETED TASKS'}
              </div>
            </div>

            <div className="kanban-card-content">
              {categoryData[group.id as keyof typeof categoryData].map((item: any) => (
                <div key={item.id} className="kanban-task-item">
                  <div className="kanban-task-main">
                    {/* 任务类型显示复选框 */}
                    {['start', 'next', 'schedule'].includes(group.id) && (
                      <button
                        className={`kanban-task-checkbox ${item.status === 'done' ? 'checked' : ''}`}
                        onClick={() => handleToggleComplete(item)}
                      >
                        {item.status === 'done' && <Check size={12} />}
                      </button>
                    )}
                    {/* 其他类型显示圆点图标 */}
                    {group.id === 'projects' && <div className="kanban-item-dot" style={{ backgroundColor: '#1976d2' }} />}
                    {group.id === 'waiting' && <div className="kanban-item-dot" style={{ backgroundColor: '#43a047' }} />}
                    {group.id === 'habit' && <div className="kanban-item-dot" style={{ backgroundColor: '#9c27b0' }} />}
                    {group.id === 'someday' && <div className="kanban-item-dot" style={{ backgroundColor: '#ff9800' }} />}
                    {group.id === 'resource' && <div className="kanban-item-dot" style={{ backgroundColor: '#795548' }} />}

                    <div className="kanban-task-content">
                      <div className="kanban-task-title">{item.title}</div>
                      {/* 显示对应的元信息 */}
                      {group.id === 'schedule' && item.due_date && (
                        <div className="kanban-task-meta">
                          <span className="kanban-task-context">{item.due_date}</span>
                        </div>
                      )}
                      {group.id === 'waiting' && item.waiting_for && (
                        <div className="kanban-task-meta">
                          <span className="kanban-task-context">@{item.waiting_for}</span>
                        </div>
                      )}
                      {group.id === 'resource' && item.type && (
                        <div className="kanban-task-meta">
                          <span className="kanban-task-context">{item.type}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="kanban-card-footer">
              <button
                className="kanban-view-all"
                onClick={() => goToPage(group.id)}
              >
                {categoryData[group.id as keyof typeof categoryData].length > 5
                  ? `VIEW ALL (${categoryData[group.id as keyof typeof categoryData].length})`
                  : 'VIEW ALL'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 悬浮添加按钮 */}
      <button className="fab-button" onClick={() => setShowAddModal(true)}>
        <Plus size={14} />
      </button>

      {/* 快速添加模态框 */}
      {showAddModal && (
        <QuickAddTaskModal
          onClose={() => setShowAddModal(false)}
          defaultStatus="next"
        />
      )}

      {/* 任务编辑侧边栏 */}
      {editingTask && (
        <TaskEditSidebar
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </main>
  )
}
