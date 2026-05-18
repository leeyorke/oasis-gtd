import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Search, MoreHorizontal, Plus, Sun, Cloud, CloudDrizzle, Wind, Pencil, Trash2 } from 'lucide-react'

const WEATHER_ICONS: Record<string, React.ElementType> = {
  '晴朗': Sun,
  '多云': Cloud,
  '小雨': CloudDrizzle,
  '大风': Wind,
}

const TAG_COLORS = [
  { name: 'gray',     bg: '#E9E6E2', text: '#333333', border: '#E9E6E2' },
  { name: 'red',      bg: '#F5C9B0', text: '#333333', border: '#F5C9B0' },
  { name: 'orange',   bg: '#A6B28B', text: '#333333', border: '#A6B28B' },
  { name: 'yellow',   bg: '#1C352D', text: '#ffffff', border: '#1C352D' },
  { name: 'green',    bg: '#3E2C23', text: '#ffffff', border: '#3E2C23' },
  { name: 'blue',     bg: '#35858E', text: '#ffffff', border: '#35858E' },
  { name: 'purple',   bg: '#612D53', text: '#ffffff', border: '#612D53' },
  { name: 'pink',     bg: '#853953', text: '#ffffff', border: '#853953' },
  { name: 'charcoal', bg: '#2C2C2C', text: '#ffffff', border: '#2C2C2C' },
]

export default function Thoughts() {
  const { notes, addNote, updateNote, removeNote, searchNotes, settings, showAddThought, setShowAddThought } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeTag, setActiveTag] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingNote, setEditingNote] = useState<any>(null)
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null)
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteTags, setNewNoteTags] = useState<{ name: string; color: string }[]>([])
  const [newNoteTagInput, setNewNoteTagInput] = useState('')
  const [newNoteTagColor, setNewNoteTagColor] = useState(TAG_COLORS[0].name)
  const [showNewTagColorPicker, setShowNewTagColorPicker] = useState(false)
  const [showNewTagDropdown, setShowNewTagDropdown] = useState(false)
  const [editNoteContent, setEditNoteContent] = useState('')
  const [editNoteTags, setEditNoteTags] = useState<{ name: string; color: string }[]>([])
  const [editNoteTagInput, setEditNoteTagInput] = useState('')
  const [editNoteTagColor, setEditNoteTagColor] = useState(TAG_COLORS[0].name)
  const [showEditTagColorPicker, setShowEditTagColorPicker] = useState(false)
  const [showEditTagDropdown, setShowEditTagDropdown] = useState(false)

  // 从所有笔记中提取唯一的标签列表
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    notes.forEach(note => {
      note.tags?.forEach(tag => {
        const tagName = tag.split('|')[0]
        tagSet.add(tagName)
      })
    })
    return Array.from(tagSet)
  }, [notes])

  // Sync global showAddThought → local showAddModal
  if (showAddThought && !showAddModal) {
    setShowAddModal(true)
    setShowAddThought(false)
  }

  // 获取标签颜色
  const getTagColor = (tag: string) => {
    const parts = tag.split('|')
    if (parts.length === 2) {
      return TAG_COLORS.find(c => c.name === parts[1]) || TAG_COLORS[0]
    }
    // Generate consistent color from tag name
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return TAG_COLORS[hash % TAG_COLORS.length]
  }

  // 解析标签名称（去掉颜色部分）
  const parseTagName = (tag: string) => tag.split('|')[0]

  // 标签列表（包含"全部"选项）
  const tagOptions = useMemo(() => {
    return [
      { key: 'all', label: isZh ? '全部' : 'All' },
      ...availableTags.map(tag => ({ key: tag, label: tag }))
    ]
  }, [availableTags, isZh])

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      return isZh ? '今天' : 'Today'
    } else if (diffDays === 2) {
      return isZh ? '昨天' : 'Yesterday'
    } else if (diffDays <= 7) {
      return isZh ? `${diffDays - 1}天前` : `${diffDays - 1}d ago`
    } else {
      return date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric'
      })
    }
  }

  // 过滤笔记
  const filteredNotes = notes.filter(note => {
    // 标签过滤
    if (activeTag !== 'all' && (!note.tags || !note.tags.some(tag => parseTagName(tag) === activeTag))) {
      return false
    }
    // 搜索过滤
    if (searchKeyword && !note.content.includes(searchKeyword) &&
        (!note.tags || !note.tags.some(tag => parseTagName(tag).includes(searchKeyword)))) {
      return false
    }
    return true
  })

  // 处理搜索
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKeyword(e.target.value)
  }

  // 处理标签切换
  const handleTagClick = (tagKey: string) => {
    setActiveTag(tagKey)
  }

  // 打开编辑弹窗
  const handleOpenEdit = (note: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingNote(note)
    setEditNoteContent(note.content)
    // Convert stored tags to display format with colors
    const displayTags = (note.tags || []).map(tag => {
      const parts = tag.split('|')
      return {
        name: parts[0],
        color: parts[1] || 'gray'
      }
    })
    setEditNoteTags(displayTags)
    setEditNoteTagInput('')
    setEditNoteTagColor(TAG_COLORS[0].name)
    setShowEditModal(true)
  }

  // 处理编辑保存
  const handleEditNote = async () => {
    if (!editNoteContent.trim() || !editingNote) return

    // Convert display format back to stored format
    const storedTags = editNoteTags.map(t => t.color !== 'gray' ? `${t.name}|${t.color}` : t.name)

    await updateNote(editingNote.id, {
      content: editNoteContent.trim(),
      tags: storedTags.length > 0 ? storedTags : undefined
    })

    setShowEditModal(false)
    setEditingNote(null)
    setEditNoteContent('')
    setEditNoteTags([])
    setEditNoteTagInput('')
  }

  // 打开删除确认
  const handleOpenDelete = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteNoteId(noteId)
    setShowDeleteConfirm(true)
  }

  // 处理删除确认
  const handleConfirmDelete = async () => {
    if (!deleteNoteId) return
    await removeNote(deleteNoteId)
    setShowDeleteConfirm(false)
    setDeleteNoteId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false)
    setDeleteNoteId(null)
  }

  return (
    <main className="main-content">
      {/* 页面标题 */}
      <div className="page-header">
        <h1 className="page-title">{isZh ? '随想' : 'Thoughts'}</h1>
        <div className="page-subtitle">
          {isZh ? '日常感悟与随笔' : 'Daily Reflections & Jottings'}
        </div>
      </div>

      {/* 工具栏 */}
      <div className="thoughts-toolbar">
        <div className="thoughts-search-box">
          <Search size={18} />
          <input
            type="text"
            className="thoughts-search-placeholder"
            placeholder={isZh ? '搜索随笔、感悟或字词...' : 'Search notes, insights or keywords...'}
            value={searchKeyword}
            onChange={handleSearch}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              color: 'var(--foreground)'
            }}
          />
        </div>
        <div className="thoughts-tag-filter-row">
          {tagOptions.map(tag => (
            <div
              key={tag.key}
              className={`thoughts-tag-chip ${activeTag === tag.key ? 'active' : ''}`}
              onClick={() => handleTagClick(tag.key)}
            >
              {tag.label}
            </div>
          ))}
        </div>
      </div>

      {/* 笔记网格 */}
      <section className="thoughts-grid">
        {filteredNotes.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '6rem 2rem',
            color: 'var(--muted-foreground)',
            fontStyle: 'italic',
            fontSize: '1.1rem'
          }}>
            {isZh ? '还没有任何随想，点击右下角按钮开始记录吧' : 'No thoughts yet. Click the button below to start writing.'}
          </div>
        ) : (
          filteredNotes.map(note => {
            const WeatherIcon = note.weather ? WEATHER_ICONS[note.weather] : null
            return (
              <div key={note.id} className="thought-card">
                <div className="thought-header">
                  <span className="thought-date">
                    {formatDate(note.created_at)}
                  </span>
                  <div className="thought-action">
                    <button
                      className="thought-action-btn"
                      onClick={(e) => handleOpenEdit(note, e)}
                      title={isZh ? '编辑' : 'Edit'}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="thought-action-btn delete"
                      onClick={(e) => handleOpenDelete(note.id, e)}
                      title={isZh ? '删除' : 'Delete'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="thought-body">
                  {note.content}
                </div>
                <div className="thought-footer">
                  <div className="thought-tags">
                    {note.tags?.map(tag => {
                      const tagName = parseTagName(tag)
                      const color = getTagColor(tag)
                      return (
                        <span
                          key={tag}
                          className="thought-tag"
                          style={{
                            backgroundColor: color.bg,
                            borderColor: color.border,
                            color: color.text,
                            borderRadius: '20px',
                            padding: '0.2rem 0.5rem 0.2rem 0.6rem',
                            border: `1px solid ${color.border}`,
                            fontSize: '0.65rem',
                            fontFamily: 'var(--font-sans)',
                            letterSpacing: '0.04em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          {tagName}
                        </span>
                      )
                    })}
                  </div>
                  {note.weather && WeatherIcon && (
                    <div className="thought-weather">
                      <WeatherIcon size={14} />
                      {note.weather}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </section>

      {/* 悬浮添加按钮 */}
      <button
        className="fab-button"
        onClick={() => setShowAddModal(true)}
      >
        <Plus size={14} />
      </button>

      {/* 添加随想弹窗 */}
      {showAddModal && (
        <div className="thought-modal-overlay" onClick={() => { setShowAddThought(false); setShowAddModal(false) }}>
          <div className="thought-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="thought-modal-title">
              {isZh ? '新建随想' : 'New Thought'}
            </h3>
            <textarea
              className="thought-modal-textarea"
              placeholder={isZh ? '记录你的想法...' : 'Write your thoughts...'}
              value={newNoteContent}
              onChange={e => setNewNoteContent(e.target.value)}
            />
            <div className="thought-modal-tag-input-container">
              <label className="thought-modal-label">
                {isZh ? '标签' : 'Tags'}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {newNoteTags.map(tag => {
                  const color = TAG_COLORS.find(c => c.name === tag.color) || TAG_COLORS[0]
                  return (
                    <div
                      key={tag.name}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        backgroundColor: color.bg,
                        border: `1px solid ${color.border}`,
                        padding: '0.2rem 0.5rem 0.2rem 0.6rem',
                        borderRadius: '20px',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: color.text, letterSpacing: '0.04em' }}>{tag.name}</span>
                      <button
                        onClick={() => setNewNoteTags(newNoteTags.filter(t => t.name !== tag.name))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.text, fontSize: '0.75rem', lineHeight: 1, padding: '0 0.1rem', transition: 'color 0.2s', opacity: 0.6 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                      >×</button>
                    </div>
                  )
                })}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="thought-modal-input"
                  placeholder={isZh ? '输入标签后按回车添加' : 'Type a tag and press Enter to add'}
                  value={newNoteTagInput}
                  onChange={e => setNewNoteTagInput(e.target.value)}
                  onFocus={() => setShowNewTagDropdown(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newNoteTagInput.trim()) {
                      e.preventDefault()
                      if (!newNoteTags.some(t => t.name === newNoteTagInput.trim())) {
                        setNewNoteTags([...newNoteTags, { name: newNoteTagInput.trim(), color: newNoteTagColor }])
                      }
                      setNewNoteTagInput('')
                    }
                  }}
                />
                {showNewTagDropdown && (
                  <>
                    {availableTags.filter(tag => !newNoteTags.some(t => t.name === tag) && tag.includes(newNoteTagInput)).length > 0 && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.4rem',
                        padding: '0.5rem',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 10,
                        marginTop: '0.5rem',
                        maxHeight: '120px',
                        overflowY: 'auto'
                      }}>
                        {availableTags.filter(tag => !newNoteTags.some(t => t.name === tag) && tag.includes(newNoteTagInput)).map(tag => {
                          const color = getTagColor(tag)
                          return (
                            <div
                              key={tag}
                              onClick={() => {
                                setNewNoteTags([...newNoteTags, { name: tag, color: color.border === TAG_COLORS[0].border ? TAG_COLORS[0].name : color.name }])
                                setNewNoteTagInput('')
                                setShowNewTagDropdown(false)
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                backgroundColor: color.bg,
                                border: `1px solid ${color.border}`,
                                padding: '0.2rem 0.5rem 0.2rem 0.6rem',
                                borderRadius: '20px',
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: color.text, letterSpacing: '0.04em' }}>{tag}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
                <div style={{
                  display: 'flex',
                  gap: '0.4rem',
                  padding: '0.5rem',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  marginTop: '0.5rem'
                }}>
                  {TAG_COLORS.map(color => (
                    <div
                      key={color.name}
                      onClick={() => {
                        setNewNoteTagColor(color.name)
                      }}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: color.bg,
                        border: `2px solid ${color.border}`,
                        cursor: 'pointer',
                        outline: newNoteTagColor === color.name ? `2px solid ${color.text}` : 'none',
                        outlineOffset: '2px'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="thought-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddThought(false)
                  setShowAddModal(false)
                  setNewNoteContent('')
                  setNewNoteTags([])
                  setNewNoteTagInput('')
                }}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--foreground)',
                  cursor: 'pointer'
                }}
              >
                {t.cancel}
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!newNoteContent.trim()) return

                  // Convert display format to stored format
                  const storedTags = newNoteTags.map(t => t.color !== 'gray' ? `${t.name}|${t.color}` : t.name)

                  await addNote({
                    content: newNoteContent.trim(),
                    tags: storedTags.length > 0 ? storedTags : undefined
                  })

                  setShowAddThought(false)
                  setShowAddModal(false)
                  setNewNoteContent('')
                  setNewNoteTags([])
                  setNewNoteTagInput('')
                }}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  cursor: 'pointer'
                }}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑随想弹窗 */}
      {showEditModal && (
        <div className="thought-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="thought-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="thought-modal-title">
              {isZh ? '编辑随想' : 'Edit Thought'}
            </h3>
            <textarea
              className="thought-modal-textarea"
              placeholder={isZh ? '记录你的想法...' : 'Write your thoughts...'}
              value={editNoteContent}
              onChange={e => setEditNoteContent(e.target.value)}
            />
            <div className="thought-modal-tag-input-container">
              <label className="thought-modal-label">
                {isZh ? '标签' : 'Tags'}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {editNoteTags.map(tag => {
                  const color = TAG_COLORS.find(c => c.name === tag.color) || TAG_COLORS[0]
                  return (
                    <div
                      key={tag.name}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        backgroundColor: color.bg,
                        border: `1px solid ${color.border}`,
                        padding: '0.2rem 0.5rem 0.2rem 0.6rem',
                        borderRadius: '20px',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: color.text, letterSpacing: '0.04em' }}>{tag.name}</span>
                      <button
                        onClick={() => setEditNoteTags(editNoteTags.filter(t => t.name !== tag.name))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.text, fontSize: '0.75rem', lineHeight: 1, padding: '0 0.1rem', transition: 'color 0.2s', opacity: 0.6 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                      >×</button>
                    </div>
                  )
                })}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="thought-modal-input"
                  placeholder={isZh ? '输入标签后按回车添加' : 'Type a tag and press Enter to add'}
                  value={editNoteTagInput}
                  onChange={e => setEditNoteTagInput(e.target.value)}
                  onFocus={() => setShowEditTagDropdown(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && editNoteTagInput.trim()) {
                      e.preventDefault()
                      if (!editNoteTags.some(t => t.name === editNoteTagInput.trim())) {
                        setEditNoteTags([...editNoteTags, { name: editNoteTagInput.trim(), color: editNoteTagColor }])
                      }
                      setEditNoteTagInput('')
                    }
                  }}
                />
                {showEditTagDropdown && (
                  <>
                    {availableTags.filter(tag => !editNoteTags.some(t => t.name === tag) && tag.includes(editNoteTagInput)).length > 0 && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.4rem',
                        padding: '0.5rem',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 10,
                        marginTop: '0.5rem',
                        maxHeight: '120px',
                        overflowY: 'auto'
                      }}>
                        {availableTags.filter(tag => !editNoteTags.some(t => t.name === tag) && tag.includes(editNoteTagInput)).map(tag => {
                          const color = getTagColor(tag)
                          return (
                            <div
                              key={tag}
                              onClick={() => {
                                setEditNoteTags([...editNoteTags, { name: tag, color: color.border === TAG_COLORS[0].border ? TAG_COLORS[0].name : color.name }])
                                setEditNoteTagInput('')
                                setShowEditTagDropdown(false)
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                backgroundColor: color.bg,
                                border: `1px solid ${color.border}`,
                                padding: '0.2rem 0.5rem 0.2rem 0.6rem',
                                borderRadius: '20px',
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: color.text, letterSpacing: '0.04em' }}>{tag}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
                <div style={{
                  display: 'flex',
                  gap: '0.4rem',
                  padding: '0.5rem',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  marginTop: '0.5rem'
                }}>
                  {TAG_COLORS.map(color => (
                    <div
                      key={color.name}
                      onClick={() => {
                        setEditNoteTagColor(color.name)
                        }}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: color.bg,
                          border: `2px solid ${color.border}`,
                          cursor: 'pointer',
                          outline: editNoteTagColor === color.name ? `2px solid ${color.text}` : 'none',
                          outlineOffset: '2px'
                        }}
                      />
                    ))}
                  </div>
              </div>
            </div>
            <div className="thought-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowEditModal(false)
                  setEditingNote(null)
                  setEditNoteContent('')
                  setEditNoteTags([])
                  setEditNoteTagInput('')
                }}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--foreground)',
                  cursor: 'pointer'
                }}
              >
                {t.cancel}
              </button>
              <button
                className="btn-primary"
                onClick={handleEditNote}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  cursor: 'pointer'
                }}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="thought-modal-overlay" onClick={handleCancelDelete}>
          <div className="thought-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="thought-modal-title">
              {isZh ? '确认删除' : 'Confirm Delete'}
            </h3>
            <p style={{ marginBottom: '1.5rem', color: 'var(--muted-foreground)' }}>
              {isZh ? '确定要删除这条随想吗？此操作无法撤销。' : 'Are you sure you want to delete this thought? This action cannot be undone.'}
            </p>
            <div className="thought-modal-actions">
              <button
                className="btn-secondary"
                onClick={handleCancelDelete}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--foreground)',
                  cursor: 'pointer'
                }}
              >
                {t.cancel}
              </button>
              <button
                className="btn-danger"
                onClick={handleConfirmDelete}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: '#ef4444',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                {isZh ? '删除' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}