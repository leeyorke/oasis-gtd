import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'

interface KanbanCardProps {
  id: string
  type: 'task' | 'project' | 'waiting' | 'someday'
  title: string
  context?: string
  dueDate?: string
  projectName?: string
  completed?: boolean
  onComplete: (id: string, type: KanbanCardProps['type']) => void
}

function KanbanCard({ id, type, title, context, dueDate, projectName, completed, onComplete }: KanbanCardProps) {
  const [isRemoving, setIsRemoving] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (completed) return
    setIsRemoving(true)
    setTimeout(() => {
      onComplete(id, type)
    }, 500)
  }

  return (
    <div className={`kanban-card ${completed || isRemoving ? 'done' : ''}`} onClick={handleClick}>
      <div className="kanban-card-header">
        <div className="kanban-checkbox">
          {(completed || isRemoving) && (
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
              <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <div className="kanban-card-title">{title}</div>
      </div>
      <div className="kanban-card-meta">
        {projectName && <span className="kanban-tag project">{projectName}</span>}
        {context && <span className="kanban-tag">{context}</span>}
        {dueDate && <span className="kanban-tag due">{dueDate}</span>}
      </div>
    </div>
  )
}

interface KanbanColumnProps {
  title: string
  count: number
  items: React.ReactNode
  collapsed?: boolean
  onToggleCollapse?: () => void
}

function KanbanColumn({ title, count, items, collapsed, onToggleCollapse }: KanbanColumnProps) {
  const t = useT()

  return (
    <div className={`kanban-column ${collapsed ? 'collapsed' : ''}`}>
      <div className="kanban-column-header">
        <span className="kanban-column-title">{title}</span>
        <span className="kanban-column-count">{count}</span>
      </div>
      {collapsed ? (
        <div className="kanban-column-collapsed" onClick={onToggleCollapse}>
          {t.db_collapsed}
        </div>
      ) : (
        <div className="kanban-column-content">
          {items}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { tasks, projects, waitingItems, somedayItems, settings, loadTasks, loadProjects, loadWaiting, loadSomeday } = useStore()
  const t = useT()

  const lang = settings.language === 'zh' ? 'zh-CN' : 'en-US'
  const [doneCollapsed, setDoneCollapsed] = useState(true)

  const inboxTasks = tasks.filter(t => t.status === 'inbox')
  const nextTasks = tasks.filter(t => t.status === 'next')
  const doneTasks = tasks.filter(t => t.status === 'done')
  const activeProjects = projects.filter(p => p.status === 'active')

  const formatDate = (date?: string) => {
    if (!date) return undefined
    return new Date(date).toLocaleDateString(lang, { month: 'short', day: 'numeric' })
  }

  const getProjectName = (projectId?: string) => {
    if (!projectId) return undefined
    const project = projects.find(p => p.id === projectId)
    return project?.title
  }

  const handleComplete = async (id: string, type: KanbanCardProps['type']) => {
    if (type === 'task') {
      await window.api.updateTask(id, { status: 'done' })
      await loadTasks()
    } else if (type === 'project') {
      await window.api.updateProject(id, { status: 'completed' })
      await loadProjects()
    } else if (type === 'waiting') {
      await window.api.deleteWaiting(id)
      await loadWaiting()
    } else if (type === 'someday') {
      await window.api.deleteSomeday(id)
      await loadSomeday()
    }
  }

  const renderTaskCards = (taskList: typeof tasks) => {
    if (taskList.length === 0) {
      return <div className="kanban-empty">{t.db_empty}</div>
    }
    return taskList.map(task => (
      <KanbanCard
        key={task.id}
        id={task.id}
        type="task"
        title={task.title}
        context={task.context}
        dueDate={formatDate(task.due_date)}
        projectName={getProjectName(task.project_id)}
        completed={task.status === 'done'}
        onComplete={handleComplete}
      />
    ))
  }

  const renderProjectCards = () => {
    if (activeProjects.length === 0) {
      return <div className="kanban-empty">{t.db_empty}</div>
    }
    return activeProjects.map(project => (
      <KanbanCard
        key={project.id}
        id={project.id}
        type="project"
        title={project.title}
        completed={project.status === 'completed'}
        onComplete={handleComplete}
      />
    ))
  }

  const renderWaitingCards = () => {
    if (waitingItems.length === 0) {
      return <div className="kanban-empty">{t.db_empty}</div>
    }
    return waitingItems.map(item => (
      <KanbanCard
        key={item.id}
        id={item.id}
        type="waiting"
        title={item.title}
        context={item.waiting_for}
        dueDate={formatDate(item.since)}
        projectName={getProjectName(item.project_id)}
        onComplete={handleComplete}
      />
    ))
  }

  const renderSomedayCards = () => {
    if (somedayItems.length === 0) {
      return <div className="kanban-empty">{t.db_empty}</div>
    }
    return somedayItems.map(item => (
      <KanbanCard
        key={item.id}
        id={item.id}
        type="someday"
        title={item.title}
        onComplete={handleComplete}
      />
    ))
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>{t.nav_dashboard}</h1>
      </div>
      <div className="kanban-board">
        <KanbanColumn
          title={t.db_colInbox}
          count={inboxTasks.length}
          items={renderTaskCards(inboxTasks)}
        />
        <KanbanColumn
          title={t.db_colNextActions}
          count={nextTasks.length}
          items={renderTaskCards(nextTasks)}
        />
        <KanbanColumn
          title={t.db_colProjects}
          count={activeProjects.length}
          items={renderProjectCards()}
        />
        <KanbanColumn
          title={t.db_colWaiting}
          count={waitingItems.length}
          items={renderWaitingCards()}
        />
        <KanbanColumn
          title={t.db_colSomeday}
          count={somedayItems.length}
          items={renderSomedayCards()}
        />
        <KanbanColumn
          title={t.db_colDone}
          count={doneTasks.length}
          items={renderTaskCards(doneTasks)}
          collapsed={doneCollapsed}
          onToggleCollapse={() => setDoneCollapsed(!doneCollapsed)}
        />
      </div>
    </div>
  )
}