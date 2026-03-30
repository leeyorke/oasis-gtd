import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import type { SomedayItem } from '../types'

type Horizon = SomedayItem['horizon']

const CATEGORY_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316']

function getCategoryColor(name: string): string {
  if (!name) return 'transparent'
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length]
}

export default function Someday() {
  const { somedayItems, addSomeday, updateSomeday, removeSomeday } = useStore()
  const t = useT()
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<SomedayItem | null>(null)
  const [title, setTitle] = useState('')
  const [horizon, setHorizon] = useState<Horizon>('someday')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')

  const HORIZONS: { id: Horizon; label: string; description: string }[] = [
    { id: 'soon', label: t.some_soon, description: t.some_desc_soon },
    { id: '1month', label: t.some_1month, description: t.some_desc_1month },
    { id: '3months', label: t.some_3months, description: t.some_desc_3months },
    { id: '1year', label: t.some_1year, description: t.some_desc_1year },
    { id: 'someday', label: t.some_someday, description: t.some_desc_someday },
  ]

  // Collect all unique categories from items
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    somedayItems.forEach(item => {
      if (item.category) cats.add(item.category)
    })
    return Array.from(cats)
  }, [somedayItems])

  const grouped = HORIZONS.reduce<Record<Horizon, typeof somedayItems>>((acc, h) => {
    acc[h.id] = somedayItems.filter(i => i.horizon === h.id)
    return acc
  }, {} as Record<Horizon, typeof somedayItems>)

  const handleOpenModal = (item?: SomedayItem) => {
    if (item) {
      setEditingItem(item)
      setTitle(item.title)
      setHorizon(item.horizon)
      setCategory(item.category || '')
      setNotes(item.notes || '')
    } else {
      setEditingItem(null)
      setTitle('')
      setHorizon('someday')
      setCategory('')
      setNotes('')
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingItem(null)
    setTitle('')
    setHorizon('someday')
    setCategory('')
    setNotes('')
  }

  const handleSave = async () => {
    if (!title.trim()) return

    if (editingItem) {
      await updateSomeday(editingItem.id, {
        title: title.trim(),
        horizon,
        category,
        notes: notes || undefined,
      })
    } else {
      await addSomeday({
        title: title.trim(),
        horizon,
        category,
        notes: notes || undefined,
      })
    }
    handleCloseModal()
  }

  const handleCheckbox = async (item: SomedayItem) => {
    // Mark as done by removing from someday
    await removeSomeday(item.id)
  }

  const handleCategorySelect = (cat: string) => {
    setCategory(category === cat ? '' : cat)
  }

  return (
    <div className="main-content">
      <div className="someday-page-container">
        <div className="someday-page-header">
          <div className="someday-page-title">将来做 / Someday</div>
          <div className="someday-page-subtitle">{t.some_ideasCaptured(somedayItems.length)}</div>
        </div>

        {somedayItems.length === 0 ? (
          <div className="someday-page-empty">
            <div className="someday-page-empty-text">{t.some_empty}</div>
          </div>
        ) : (
          <div className="someday-page-list">
            {HORIZONS.map(h => {
              const items = grouped[h.id]
              if (items.length === 0) return null
              return (
                <div key={h.id} className="horizon-section fade-in">
                  <div className="horizon-label">{h.label} — {items.length}</div>
                  {items.map((item, i) => (
                    <div
                      key={item.id}
                      className="someday-page-card"
                      style={{ animationDelay: `${i * 0.04}s` }}
                    >
                      <div
                        className="someday-page-checkbox"
                        onClick={() => handleCheckbox(item)}
                      >
                        {item.category && (
                          <div
                            className="someday-page-category-dot"
                            style={{ backgroundColor: getCategoryColor(item.category) }}
                          />
                        )}
                      </div>
                      <div className="someday-page-main" onClick={() => handleOpenModal(item)}>
                        <div className="someday-page-content">
                          <div className="someday-page-task-title">{item.title}</div>
                          <div className="someday-page-meta">
                            <span>{h.label}</span>
                            {item.category && (
                              <>
                                <span className="someday-page-meta-dot" />
                                <span
                                  className="someday-page-category"
                                  style={{
                                    backgroundColor: `${getCategoryColor(item.category)}20`,
                                    color: getCategoryColor(item.category),
                                  }}
                                >
                                  <span
                                    className="someday-page-category-dot"
                                    style={{ backgroundColor: getCategoryColor(item.category) }}
                                  />
                                  {item.category}
                                </span>
                              </>
                            )}
                            <span className="someday-page-meta-dot" />
                            <span>No deadline</span>
                          </div>
                        </div>
                      </div>
                      <div className="someday-page-actions">
                        <button
                          className="someday-page-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeSomeday(item.id)
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <button className="someday-page-fab" onClick={() => handleOpenModal()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {showModal && (
          <div className="someday-page-modal-overlay" onClick={handleCloseModal}>
            <div className="someday-page-modal" onClick={e => e.stopPropagation()}>
              <div className="someday-page-modal-header">
                <span className="header-label">
                  {editingItem ? t.edit : t.some_addIdea}
                </span>
                <button className="close-btn" onClick={handleCloseModal}>×</button>
              </div>
              <div className="someday-page-modal-content">
                <input
                  type="text"
                  className="task-title-input"
                  placeholder={t.some_placeholder}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  autoFocus
                />
                <div className="divider" />
                <div className="section-title">{t.some_cardSub}</div>
                <div className="chips-container">
                  {HORIZONS.map(h => (
                    <span
                      key={h.id}
                      className={`someday-page-chip ${horizon === h.id ? 'active' : ''}`}
                      onClick={() => setHorizon(h.id)}
                    >
                      {h.label}
                    </span>
                  ))}
                </div>
                <div className="divider" />
                <div className="section-title">Category</div>
                <div className="chips-container">
                  {allCategories.map(cat => (
                    <span
                      key={cat}
                      className={`someday-page-chip ${category === cat ? 'active' : ''}`}
                      onClick={() => handleCategorySelect(cat)}
                    >
                      <span
                        className="someday-page-chip-dot"
                        style={{ backgroundColor: getCategoryColor(cat) }}
                      />
                      {cat}
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  className="task-title-input"
                  placeholder={t.some_cat_placeholder}
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{ fontSize: '14px', marginTop: '8px' }}
                />
              </div>
              <div className="someday-page-modal-footer">
                <button className="btn btn-ghost" onClick={handleCloseModal}>
                  {t.cancel}
                </button>
                <button className="btn btn-primary" onClick={handleSave}>
                  {editingItem ? t.update : t.create}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}