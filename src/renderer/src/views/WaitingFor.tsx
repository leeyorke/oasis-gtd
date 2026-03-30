import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Plus, Check, Trash2 } from 'lucide-react'

export default function WaitingFor() {
  const { waitingItems, addWaiting, removeWaiting, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    waiting_for: '',
    since: new Date().toISOString().split('T')[0],
    project_id: '',
    notes: ''
  })

  const handleAdd = async () => {
    if (!form.title.trim() || !form.waiting_for.trim()) return
    await addWaiting({
      title: form.title.trim(),
      waiting_for: form.waiting_for.trim(),
      since: form.since,
      project_id: form.project_id || undefined,
      notes: form.notes || undefined
    })
    setForm({ title: '', waiting_for: '', since: new Date().toISOString().split('T')[0], project_id: '', notes: '' })
    setShowForm(false)
  }

  const formatSince = (date: string) => {
    const d = new Date(date)
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return t.today
    if (diff === 1) return t.yesterday
    if (diff < 7) return t.days_ago(diff)
    if (diff < 30) return t.weeks_ago(Math.floor(diff / 7))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <main className="main-content">
      <div className="page-header">
        <h1 className="page-title">{isZh ? '等待中' : 'Waiting For'}</h1>
        <div className="page-subtitle">{isZh ? '委托给他人的项目追踪' : 'Track items delegated to others'}</div>
      </div>

        <div className="waiting-page-list">
          {waitingItems.length === 0 ? (
            <div className="waiting-page-empty">
              <div className="waiting-page-empty-text">{t.wait_empty}</div>
            </div>
          ) : (
            waitingItems.map((item, i) => (
              <div key={item.id} className="waiting-page-card fade-in">
                <div className="waiting-page-card-main">
                  <div className="waiting-page-card-content">
                    <div className="waiting-page-card-title">{item.title}</div>
                    <div className="waiting-page-card-meta">
                      <span>{item.waiting_for}</span>
                      <span className="waiting-page-meta-dot"></span>
                      <span>{formatSince(item.since)}</span>
                    </div>
                  </div>
                </div>
                <div className="waiting-page-card-actions">
                  <button
                    className="waiting-page-action-btn resolve"
                    onClick={() => removeWaiting(item.id)}
                    title={isZh ? '完成' : 'Resolve'}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className="waiting-page-action-btn delete"
                    onClick={() => removeWaiting(item.id)}
                    title={isZh ? '删除' : 'Delete'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* FAB Button */}
        <button
          className="waiting-page-fab"
          onClick={() => setShowForm(true)}
        >
          <Plus size={14} />
        </button>

        {/* Add Item Modal */}
        {showForm && (
          <div className="waiting-page-modal-overlay" onClick={() => setShowForm(false)}>
            <div className="waiting-page-modal" onClick={e => e.stopPropagation()}>
              <div className="waiting-page-modal-header">
                <span className="header-label">{isZh ? '追踪新项目' : 'Track New Item'}</span>
                <button className="close-btn" onClick={() => setShowForm(false)}>×</button>
              </div>
              <div className="waiting-page-modal-content">
                <div className="waiting-page-form-group">
                  <label className="waiting-page-label">{isZh ? '等待事项' : 'What are you waiting for?'}</label>
                  <input
                    type="text"
                    className="waiting-page-input"
                    placeholder={t.wait_whatPlaceholder}
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="waiting-page-form-group">
                  <label className="waiting-page-label">{isZh ? '委托给' : 'Delegated To'}</label>
                  <input
                    type="text"
                    className="waiting-page-input"
                    placeholder={t.wait_whoPlaceholder}
                    value={form.waiting_for}
                    onChange={e => setForm(f => ({ ...f, waiting_for: e.target.value }))}
                  />
                </div>
                <div className="waiting-page-form-group">
                  <label className="waiting-page-label">{isZh ? '开始日期' : 'Since'}</label>
                  <input
                    type="date"
                    className="waiting-page-input"
                    value={form.since}
                    onChange={e => setForm(f => ({ ...f, since: e.target.value }))}
                  />
                </div>
              </div>
              <div className="waiting-page-modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowForm(false)}>
                  {t.cancel}
                </button>
                <button className="btn btn-primary" onClick={handleAdd}>
                  {t.add}
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  )
}
