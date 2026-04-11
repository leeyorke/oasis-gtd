import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import AddTaskModal from '../components/AddTaskModal'
import { Task } from '../types'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export default function Projects() {
  const { projects, tasks, addProject, removeProject, updateProject, updateTask, loadTasks } = useStore()
  const t = useT()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newOutcome, setNewOutcome] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const selectedProject = projects.find(p => p.id === selectedProjectId) || null
  const projectTasks = tasks.filter(tk => tk.project_id === selectedProjectId)

  const handleCreateProject = async () => {
    if (!newTitle.trim()) return
    await addProject({ title: newTitle.trim(), description: newOutcome || undefined, status: 'active' })
    setNewTitle('')
    setNewOutcome('')
    setShowNewProject(false)
  }

  const handleToggleTask = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'next' : 'done'
    await updateTask(task.id, { status: newStatus })
  }

  const handleDeleteProject = async (id: string) => {
    await removeProject(id)
    if (selectedProjectId === id) {
      setSelectedProjectId(null)
    }
  }

  const handleOpenEdit = (project: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProject(project)
    setEditTitle(project.title)
    setEditDescription(project.description || '')
    setShowEditProject(true)
  }

  const handleEditProject = async () => {
    if (!editTitle.trim() || !editingProject) return
    await updateProject(editingProject.id, {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
    })
    setShowEditProject(false)
    setEditingProject(null)
    setEditTitle('')
    setEditDescription('')
  }

  const activeProjects = projects.filter(p => p.status === 'active')
  const onHoldProjects = projects.filter(p => p.status === 'on-hold')

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const renderListView = () => (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{t.nav_projects}</h1>
        <div className="page-subtitle">All Active Projects</div>
      </div>

      <div className="projects-grid">
        {projects.length === 0 ? (
          <div className="project-empty-state">
            {t.proj_empty}
          </div>
        ) : (
          projects.map((project) => {
            const taskCount = projectTasks.filter(t => t.project_id === project.id).length
            const doneCount = projectTasks.filter(t => t.project_id === project.id && t.status === 'done').length
            const progress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0

            return (
              <div
                key={project.id}
                className="project-card"
                onClick={() => setSelectedProjectId(project.id)}
              >
                <div className="project-header">
                  <div className="project-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="project-header-right">
                    <div className={`project-status ${project.status === 'active' ? 'active' : ''}`}>
                      {project.status === 'active' ? t.proj_statusActive : t.proj_statusOnHold}
                    </div>
                    <div className="project-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="habit-action-btn"
                        onClick={(e) => handleOpenEdit(project, e)}
                        title={t.edit}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="habit-action-btn delete"
                        onClick={() => handleDeleteProject(project.id)}
                        title={t.delete}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="project-info">
                  <div className="project-title">{project.title}</div>
                  {project.description && (
                    <div className="project-desc">{project.description}</div>
                  )}
                </div>

                <div className="project-footer">
                  <div className="project-meta">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    {taskCount} Tasks
                  </div>
                  <div className="project-progress-wrapper">
                    <span className="project-progress-text">{progress}%</span>
                    <div className="project-progress-bar">
                      <div className="project-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <button className="fab-button" onClick={() => setShowNewProject(true)}>
        <Plus size={14} />
      </button>

      {showNewProject && (
        <div className="project-modal-overlay" onClick={() => setShowNewProject(false)}>
          <div className="project-modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="project-modal-title">
              {t.proj_newProject}
            </h2>
            <input
              className="waiting-page-input project-modal-input-title"
              placeholder={t.proj_titlePlaceholder}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
              autoFocus
            />
            <input
              className="waiting-page-input project-modal-input-outcome"
              placeholder={t.proj_outcomePlaceholder}
              value={newOutcome}
              onChange={e => setNewOutcome(e.target.value)}
            />
            <div className="project-modal-actions">
              <button
                className="btn-text"
                onClick={() => setShowNewProject(false)}
              >
                {t.cancel}
              </button>
              <button
                className="project-modal-create-btn"
                onClick={handleCreateProject}
              >
                {t.create}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditProject && (
        <div className="project-modal-overlay" onClick={() => setShowEditProject(false)}>
          <div className="project-modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="project-modal-title">
              {t.proj_editProject}
            </h2>
            <input
              className="waiting-page-input project-modal-input-title"
              placeholder={t.proj_titlePlaceholder}
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEditProject()}
              autoFocus
            />
            <input
              className="waiting-page-input project-modal-input-outcome"
              placeholder={t.proj_outcomePlaceholder}
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
            />
            <div className="project-modal-actions">
              <button
                className="btn-text"
                onClick={() => setShowEditProject(false)}
              >
                {t.cancel}
              </button>
              <button
                className="project-modal-create-btn"
                onClick={handleEditProject}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )

  const renderDetailView = () => {
    if (!selectedProject) return null

    const todoTasks = projectTasks.filter(t => t.status !== 'done')
    const completedTasks = projectTasks.filter(t => t.status === 'done')
    const totalTasks = projectTasks.length
    const doneCount = completedTasks.length
    const progress = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0

    return (
      <div className="project-detail">
        <div className="page-actions">
          <button className="action-btn" title="Share">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
          <button className="action-btn" title="More">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>

        <div className="breadcrumb" onClick={() => setSelectedProjectId(null)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          {t.proj_breadcrumb_back}
        </div>

        <div className="project-detail-header">
          <div className="project-detail-top">
            <div className="project-detail-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="project-detail-info">
              <h1 className="project-detail-title">{selectedProject.title}</h1>
              <div className="project-detail-meta">
                <div className={`project-status ${selectedProject.status === 'active' ? 'active' : ''}`}>
                  {selectedProject.status === 'active' ? t.proj_statusActive : t.proj_statusOnHold}
                </div>
                <span className="project-detail-date">Started {formatDate(selectedProject.created_at)}</span>
              </div>
            </div>
          </div>

          {selectedProject.description && (
            <div className="project-detail-desc">{selectedProject.description}</div>
          )}

          {selectedProject.outcome && (
            <div className="project-detail-outcome">
              {selectedProject.outcome}
            </div>
          )}

          <div className="project-progress-section">
            <div className="project-progress-wrapper">
              <div className="project-progress-bar">
                <div className="project-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <span className="project-progress-text">{progress}% Complete ({doneCount}/{totalTasks})</span>
          </div>
        </div>

        <div className="tasks-section">
          {todoTasks.length > 0 && (
            <div className="task-group">
              <div className="task-group-title">
                {t.proj_tasks_todo}
                <span className="task-group-count">{todoTasks.length}</span>
              </div>
              <div className="task-list">
                {todoTasks.map(task => (
                  <div
                    key={task.id}
                    className="task-item"
                    onClick={() => handleToggleTask(task)}
                  >
                    <div className="task-checkbox">
                      {task.status === 'done' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="task-title">{task.title}</div>
                    <div className="task-meta">
                      {task.context && <span className="task-tag">{task.context}</span>}
                      {task.due_date && (
                        <span className="task-date">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="task-group">
              <div className="task-group-title">
                {t.proj_tasks_completed}
                <span className="task-group-count">{completedTasks.length}</span>
              </div>
              <div className="task-list">
                {completedTasks.map(task => (
                  <div
                    key={task.id}
                    className="task-item completed"
                    onClick={() => handleToggleTask(task)}
                  >
                    <div className="task-checkbox">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="task-title">{task.title}</div>
                    <div className="task-meta">
                      {task.context && <span className="task-tag">{task.context}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {projectTasks.length === 0 && (
            <div className="project-detail-empty-state">
              {t.proj_noActions}
            </div>
          )}
        </div>

        <button className="fab-button" onClick={() => setShowAddTask(true)}>
          <Plus size={14} />
        </button>

        {showAddTask && selectedProject && (
          <AddTaskModal
            onClose={() => setShowAddTask(false)}
            defaultStatus="next"
          />
        )}
      </div>
    )
  }

  return selectedProjectId ? renderDetailView() : renderListView()
}
