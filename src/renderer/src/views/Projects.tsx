import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useParallax } from '../hooks/useParallax'
import AddTaskModal from '../components/AddTaskModal'

const STATUS_LABELS = {
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
  someday: 'Someday',
}

export default function Projects() {
  const { projects, tasks, addProject, removeProject, selectedProjectId, setSelectedProject } = useStore()
  const mouse = useParallax()
  const [showNewProject, setShowNewProject] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newOutcome, setNewOutcome] = useState('')

  const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0] || null
  const projectTasks = tasks.filter(t => t.project_id === selectedProject?.id && t.status !== 'done')
  const activeProjects = projects.filter(p => p.status === 'active')

  const handleCreateProject = async () => {
    if (!newTitle.trim()) return
    await addProject({
      title: newTitle.trim(),
      outcome: newOutcome || undefined,
      status: 'active',
    })
    setNewTitle('')
    setNewOutcome('')
    setShowNewProject(false)
  }

  return (
    <div className="composition">
      {/* ─── Main Sheet ─────────────────────────────────────────── */}
      <main
        className="sheet-main"
        style={{ transform: `translate(${mouse.x * 5}px, ${mouse.y * 5}px)` }}
      >
        <div className="list-container" style={{ marginTop: '44vh' }}>
          <div className="list-header" style={{ gridTemplateColumns: '2fr 0.8fr 0.6fr 0.5fr' }}>
            <div>Project</div>
            <div>Status</div>
            <div>Actions</div>
            <div></div>
          </div>

          <div className="task-list">
            {projects.length === 0 ? (
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                color: 'var(--ink-secondary)',
                fontStyle: 'italic',
                paddingTop: '1.5rem'
              }}>
                No projects yet.
              </div>
            ) : (
              projects.map((project, i) => (
                <div
                  key={project.id}
                  className="task-row fade-in"
                  style={{
                    gridTemplateColumns: '2fr 0.8fr 0.6fr 0.5fr',
                    animationDelay: `${i * 0.05}s`,
                    background: selectedProject?.id === project.id ? 'rgba(255,255,255,0.2)' : undefined,
                  }}
                  onClick={() => setSelectedProject(project.id)}
                >
                  <div className="task-title">{project.title}</div>
                  <div className="task-meta">
                    <span className="task-tag">{STATUS_LABELS[project.status] || project.status}</span>
                  </div>
                  <div className="task-meta">{project.taskCount ?? 0} open</div>
                  <div className="task-meta" style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="btn-text"
                      onClick={e => { e.stopPropagation(); removeProject(project.id) }}
                      title="Delete project"
                    >×</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <footer className="sheet-footer">
          <div className="footer-logo">Plan</div>
          <div className="footer-block">
            <div className="footer-title">Projects</div>
            <div className="footer-text">{activeProjects.length} Active</div>
            <div className="footer-text">{projects.length} Total</div>
          </div>
          <div className="footer-block">
            <div className="footer-title">Actions</div>
            <div className="footer-text">
              <button className="btn-text" onClick={() => setShowNewProject(true)} style={{ paddingLeft: 0 }}>
                + New Project
              </button>
            </div>
          </div>
        </footer>
      </main>

      {/* ─── Blue Sheet: Project Stats ───────────────────────────── */}
      <div
        className="sheet-blue"
        style={{ transform: `translate(${mouse.x * -10}px, ${mouse.y * -10}px)` }}
      >
        <div style={{
          position: 'relative', zIndex: 3, padding: '2rem',
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          {selectedProject ? (
            <>
              <div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(244,243,239,0.5)', marginBottom: '0.8rem' }}>
                  Selected Project
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--ink-light)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {selectedProject.title}
                </div>
                {selectedProject.outcome && (
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.68rem', color: 'rgba(244,243,239,0.6)', marginTop: '0.8rem', lineHeight: 1.5, fontStyle: 'italic' }}>
                    {selectedProject.outcome}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'rgba(244,243,239,0.8)', lineHeight: 1 }}>
                    {projectTasks.length}
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(244,243,239,0.4)' }}>
                    Open Actions
                  </div>
                </div>
                <div>
                  <button
                    className="btn-text"
                    onClick={() => setShowAddTask(true)}
                    style={{ color: 'rgba(244,243,239,0.6)', marginTop: '0.5rem' }}
                  >
                    + Add Action
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'rgba(244,243,239,0.4)', fontStyle: 'italic' }}>
              Select a project
            </div>
          )}
        </div>
      </div>

      {/* ─── White Card: Project Detail ──────────────────────────── */}
      <div className="sheet-white" style={{ transform: `rotate(-1.5deg) translate(${mouse.x * 15}px, ${mouse.y * 15}px)` }}>
        <svg className="paperclip" viewBox="0 0 32 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 94C10.4772 94 6 89.5228 6 84V26C6 18.268 12.268 12 20 12C27.732 12 34 18.268 34 26V78C34 81.3137 31.3137 84 28 84C24.6863 84 22 81.3137 22 78V30C22 28.8954 21.1046 28 20 28C18.8954 28 18 28.8954 18 30V78C18 83.5228 22.4772 88 28 88C33.5228 88 38 83.5228 38 78V26C38 16.0589 29.9411 8 20 8C10.0589 8 2 16.0589 2 26V84C2 91.732 8.268 98 16 98C23.732 98 30 91.732 30 84V30" stroke="#1A1C20" strokeWidth="2" strokeLinecap="round"/>
        </svg>

        <div className="capture-header">
          <span>New Project</span>
          <span>Active</span>
        </div>

        {showNewProject ? (
          <>
            <input
              className="capture-input"
              placeholder="Project title..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              style={{ fontSize: '1.3rem', marginTop: 0, flex: '0 0 auto', background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-primary)', fontFamily: 'var(--font-display)', width: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
              autoFocus
            />
            <input
              placeholder="Desired outcome..."
              value={newOutcome}
              onChange={e => setNewOutcome(e.target.value)}
              style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(20,28,58,0.1)', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--ink-secondary)', padding: '0.4rem 0', width: '100%', marginBottom: '1rem', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            />
            <div className="capture-actions" style={{ marginTop: 'auto' }}>
              <button className="btn-text" onClick={handleCreateProject}>Create</button>
              <button className="btn-text" style={{ marginLeft: 'auto' }} onClick={() => setShowNewProject(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {selectedProject ? (
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--ink-secondary)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                    Next action for
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--ink-primary)', marginBottom: '1rem' }}>
                    {selectedProject.title}
                  </div>
                  {projectTasks[0] ? (
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                      {projectTasks[0].title}
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', color: 'rgba(20,28,58,0.2)', fontStyle: 'italic' }}>
                      No open actions
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'rgba(20,28,58,0.15)', fontStyle: 'italic' }}>
                  Select a project
                </div>
              )}
            </div>
            <div className="capture-actions">
              <button className="btn-text" onClick={() => setShowNewProject(true)}>New Project</button>
            </div>
          </>
        )}

        <div className="emboss-text">plan</div>
      </div>

      {showAddTask && selectedProject && (
        <AddTaskModal
          onClose={() => setShowAddTask(false)}
          defaultStatus="next"
        />
      )}
    </div>
  )
}
