import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'

const CONTEXTS = ['@Email', '@Office', '@Deep Work', '@Design', '@Admin', '@Phone', '@Errands', '@Computer', '@Home']

interface AddTaskModalProps {
  onClose: () => void
  defaultStatus?: 'next' | 'inbox' | 'waiting' | 'someday'
}

export default function AddTaskModal({ onClose, defaultStatus = 'next' }: AddTaskModalProps) {
  const { addTask, projects, loadTasks } = useStore()
  const t = useT()
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<'next' | 'inbox' | 'waiting' | 'someday'>(defaultStatus)

  const activeProjects = projects.filter(p => p.status === 'active')

  const handleSubmit = async () => {
    if (!title.trim()) return
    await addTask({ title: title.trim(), context: context || undefined, due_date: dueDate || undefined, project_id: projectId || undefined, notes: notes || undefined, status })
    await loadTasks(status)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet fade-in">
        <div className="modal-title">{t.modal_newAction}</div>

        <div className="form-field">
          <label className="form-label">{t.modal_actionLabel}</label>
          <input className="form-input" placeholder={t.modal_actionPlaceholder} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-field">
            <label className="form-label">{t.modal_context}</label>
            <select className="form-select" value={context} onChange={e => setContext(e.target.value)}>
              <option value="">{t.modal_noContext}</option>
              {CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">{t.modal_status}</label>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
              <option value="next">{t.modal_statusNext}</option>
              <option value="inbox">{t.modal_statusInbox}</option>
              <option value="someday">{t.modal_statusSomeday}</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-field">
            <label className="form-label">{t.modal_dueDate}</label>
            <input className="form-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">{t.modal_project}</label>
            <select className="form-select" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">{t.modal_noProject}</option>
              {activeProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">{t.modal_notes}</label>
          <textarea className="form-textarea" placeholder={t.modal_notesPlaceholder} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button className="btn-text" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primary" onClick={handleSubmit}>{t.modal_captureAction}</button>
        </div>
      </div>
    </div>
  )
}