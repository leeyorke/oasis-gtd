import { useState } from 'react'
import { useStore } from '../store/useStore'

const CONTEXTS = ['@Email', '@Office', '@Deep Work', '@Design', '@Admin', '@Phone', '@Errands', '@Computer', '@Home']

interface AddTaskModalProps {
  onClose: () => void
  defaultStatus?: 'next' | 'inbox' | 'waiting' | 'someday'
}

export default function AddTaskModal({ onClose, defaultStatus = 'next' }: AddTaskModalProps) {
  const { addTask, projects, loadTasks } = useStore()
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<'next' | 'inbox' | 'waiting' | 'someday'>(defaultStatus)

  const activeProjects = projects.filter(p => p.status === 'active')

  const handleSubmit = async () => {
    if (!title.trim()) return
    await addTask({
      title: title.trim(),
      context: context || undefined,
      due_date: dueDate || undefined,
      project_id: projectId || undefined,
      notes: notes || undefined,
      status,
    })
    await loadTasks(status)
    onClose()
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-sheet fade-in">
        <div className="modal-title">New Action</div>

        <div className="form-field">
          <label className="form-label">Action</label>
          <input
            className="form-input"
            placeholder="What is the next physical action?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-field">
            <label className="form-label">Context</label>
            <select className="form-select" value={context} onChange={e => setContext(e.target.value)}>
              <option value="">No context</option>
              {CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Status</label>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
              <option value="next">Next Action</option>
              <option value="inbox">Inbox</option>
              <option value="someday">Someday</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-field">
            <label className="form-label">Due Date</label>
            <input
              className="form-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Project</label>
            <select className="form-select" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {activeProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            placeholder="Additional notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn-text" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit}>Capture Action</button>
        </div>
      </div>
    </div>
  )
}
