import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'

interface AddTaskModalProps {
  onClose: () => void
  /** 父项目 id：若传入，新建任务自动归属到该项目（来自 Projects 视图） */
  projectId?: string
}

export default function AddTaskModal({ onClose, projectId }: AddTaskModalProps) {
  const { addTask } = useStore()
  const t = useT()
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async () => {
    if (!title.trim()) return
    await addTask({
      title: title.trim(),
      notes: notes.trim() || undefined,
      status: 'next',
      project_id: projectId,
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet fade-in">
        <div className="modal-title">{t.modal_newAction}</div>

        <div className="form-field">
          <label className="form-label">{t.modal_actionLabel}</label>
          <input
            className="form-input"
            placeholder={t.modal_actionPlaceholder}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label">{t.modal_notes}</label>
          <textarea
            className="form-textarea"
            placeholder={t.modal_notesPlaceholder}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn-text" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primary" onClick={handleSubmit}>{t.modal_captureAction}</button>
        </div>
      </div>
    </div>
  )
}
