import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Search, Plus, FileText, Link, FileSpreadsheet, Image, Bookmark, Trash2, Pencil, ExternalLink } from 'lucide-react'
import type { Resource } from '../types'

const TYPE_ICONS: Record<string, React.ElementType> = {
  document: FileText,
  link: Link,
  spreadsheet: FileSpreadsheet,
  image: Image,
  collection: Bookmark,
}

const TYPE_LABELS: Record<string, string> = {
  document: 'PDF',
  link: 'Link',
  spreadsheet: 'Sheet',
  image: 'Image',
  collection: 'List',
}

const TAG_COLORS = [
  { name: 'gray', bg: '#cccccc', text: '#333333', border: '#cccccc' },
  { name: 'red', bg: '#cc3333', text: '#ffffff', border: '#cc3333' },
  { name: 'orange', bg: '#ff6600', text: '#ffffff', border: '#ff6600' },
  { name: 'yellow', bg: '#ffff00', text: '#333333', border: '#ffff00' },
  { name: 'green', bg: '#669933', text: '#ffffff', border: '#669933' },
  { name: 'blue', bg: '#3399cc', text: '#ffffff', border: '#3399cc' },
  { name: 'purple', bg: '#9966cc', text: '#ffffff', border: '#9966cc' },
  { name: 'pink', bg: '#ff99cc', text: '#333333', border: '#ff99cc' },
]

export default function Resource() {
  const { resources, loadResources, addResource, updateResource, removeResource, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeTag, setActiveTag] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)

  // New resource form state
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<'document' | 'link' | 'spreadsheet' | 'image' | 'collection'>('document')
  const [newDescription, setNewDescription] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newTags, setNewTags] = useState<{ name: string; color: string }[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].name)
  const [showNewTagColorPicker, setShowNewTagColorPicker] = useState(false)
  const [showNewTagDropdown, setShowNewTagDropdown] = useState(false)

  // Edit resource form state
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<'document' | 'link' | 'spreadsheet' | 'image' | 'collection'>('document')
  const [editDescription, setEditDescription] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editTags, setEditTags] = useState<{ name: string; color: string }[]>([])
  const [editTagInput, setEditTagInput] = useState('')
  const [editTagColor, setEditTagColor] = useState(TAG_COLORS[0].name)
  const [showEditTagColorPicker, setShowEditTagColorPicker] = useState(false)
  const [showEditTagDropdown, setShowEditTagDropdown] = useState(false)

  // Load resources on mount
  useState(() => {
    loadResources()
  })

  // Parse tag name (remove color suffix)
  const parseTagName = (tag: string) => tag.split('|')[0]

  // Get tag color
  const getTagColor = (tag: string) => {
    const parts = tag.split('|')
    if (parts.length === 2) {
      return TAG_COLORS.find(c => c.name === parts[1]) || TAG_COLORS[0]
    }
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return TAG_COLORS[hash % TAG_COLORS.length]
  }

  // Extract all unique tags from resources
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    resources.forEach(resource => {
      resource.tags?.forEach(tag => tagSet.add(parseTagName(tag)))
    })
    return Array.from(tagSet)
  }, [resources])

  // Tag filter options (predefined + dynamic)
  const tagOptions = useMemo(() => {
    const predefined = [
      { key: 'all', label: isZh ? '全部' : t.resource_filterAll },
      { key: 'design', label: isZh ? '设计' : t.resource_filterDesign },
      { key: 'reference', label: isZh ? '参考' : t.resource_filterRef },
      { key: 'document', label: isZh ? '文档' : t.resource_filterDoc },
      { key: 'link', label: isZh ? '链接' : t.resource_filterLink },
    ]

    // Add dynamic tags that don't already exist in predefined
    const existingKeys = new Set(predefined.map(p => p.key))
    const dynamicTags = availableTags
      .filter(tag => !existingKeys.has(tag))
      .map(tag => ({ key: tag, label: tag }))

    return [...predefined, ...dynamicTags]
  }, [availableTags, isZh, t])

  // Format date
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

  // Filter resources
  const filteredResources = resources.filter(resource => {
    // Tag filter
    if (activeTag !== 'all') {
      // Check if resource has the tag OR if the tag matches the predefined filter
      const hasTag = resource.tags?.some(tag => parseTagName(tag) === activeTag)
      const isTypeMatch = resource.type === activeTag
      if (!hasTag && !isTypeMatch) return false
    }
    // Search filter
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      const matchesTitle = resource.title.toLowerCase().includes(keyword)
      const matchesDesc = resource.description?.toLowerCase().includes(keyword)
      const matchesTags = resource.tags?.some(tag => parseTagName(tag).toLowerCase().includes(keyword))
      if (!matchesTitle && !matchesDesc && !matchesTags) return false
    }
    return true
  })

  const handleAddResource = async () => {
    if (!newTitle.trim()) return

    // Convert display format to stored format
    const storedTags = newTags.map(t => t.color !== 'gray' ? `${t.name}|${t.color}` : t.name)

    await addResource({
      title: newTitle.trim(),
      type: newType,
      description: newDescription.trim() || undefined,
      url: newUrl.trim() || undefined,
      tags: storedTags,
    })

    // Reset form
    setNewTitle('')
    setNewType('document')
    setNewDescription('')
    setNewUrl('')
    setNewTags([])
    setNewTagInput('')
    setShowAddModal(false)
  }

  const handleEditResource = (resource: Resource) => {
    // Convert stored tags to display format with colors
    const displayTags = (resource.tags || []).map(tag => {
      const parts = tag.split('|')
      return {
        name: parts[0],
        color: parts[1] || 'gray'
      }
    })
    setEditingResource(resource)
    setEditTitle(resource.title)
    setEditType(resource.type)
    setEditDescription(resource.description || '')
    setEditUrl(resource.url || '')
    setEditTags(displayTags)
    setEditTagInput('')
    setEditTagColor(TAG_COLORS[0].name)
  }

  const handleUpdateResource = async () => {
    if (!editingResource || !editTitle.trim()) return

    // Convert display format to stored format
    const storedTags = editTags.map(t => t.color !== 'gray' ? `${t.name}|${t.color}` : t.name)

    await updateResource(editingResource.id, {
      title: editTitle.trim(),
      type: editType,
      description: editDescription.trim() || undefined,
      url: editUrl.trim() || undefined,
      tags: storedTags,
    })

    setEditingResource(null)
  }

  const handleDeleteResource = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (window.confirm(isZh ? '确定删除此资源？' : t.resource_deleteConfirm)) {
      await removeResource(id)
    }
  }

  const handleOpenLink = (e: React.MouseEvent, url: string) => {
    e.stopPropagation()
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleResourceClick = (resource: Resource) => {
    if (resource.type === 'link' && resource.url) {
      window.open(resource.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <main className="main-content">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">{isZh ? '资源' : 'Resources'}</h1>
        <div className="page-subtitle">
          {isZh ? '参考资料与存档' : 'Reference Materials & Archives'}
        </div>
      </div>

      {/* Toolbar */}
      <div className="resource-toolbar">
        <div className="resource-search-box">
          <Search size={18} />
          <input
            type="text"
            className="resource-search-placeholder"
            placeholder={isZh ? '搜索资源、笔记、链接或附件...' : t.resource_search}
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              color: 'var(--foreground)'
            }}
          />
        </div>
      </div>

      {/* List Header */}
      <section className="resource-list-section">
        <div className="resource-list-header">
          <div>{isZh ? '资源' : t.resource_colName}</div>
          <div>{isZh ? '更新时间' : t.resource_colDate}</div>
          <div></div>
        </div>

        {/* Resource List */}
        <div className="resource-list">
          {filteredResources.length === 0 ? (
            <div className="resource-empty">
              <div className="resource-empty-text">
                {isZh ? '还没有任何资源，点击右下角按钮开始添加' : 'No resources yet. Click the button below to add one.'}
              </div>
            </div>
          ) : (
            filteredResources.map(resource => {
              const IconComponent = TYPE_ICONS[resource.type] || FileText
              return (
                <div
                  key={resource.id}
                  className="resource-item"
                  data-type={resource.type}
                  onClick={() => handleResourceClick(resource)}
                  style={{ cursor: resource.type === 'link' ? 'pointer' : 'default' }}
                >
                  <div className="resource-main">
                    <div className="resource-icon">
                      <IconComponent size={20} />
                    </div>
                    <div className="resource-text">
                      <div className="resource-name">
                        {resource.title}
                        {resource.type === 'link' && resource.url && (
                          <ExternalLink size={14} style={{ marginLeft: '8px', opacity: 0.5 }} />
                        )}
                      </div>
                      <div className="resource-tags" style={{ marginTop: '4px' }}>
                        {resource.tags?.map(tag => {
                          const tagName = parseTagName(tag)
                          const color = getTagColor(tag)
                          return (
                            <span
                              key={tag}
                              className="resource-tag"
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
                      <div className="resource-meta">
                        <span>{TYPE_LABELS[resource.type]}</span>
                        {resource.description && (
                          <>
                            <span className="resource-meta-dot"></span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                              {resource.description}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="resource-date">
                    {formatDate(resource.updatedAt)}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', justifySelf: 'end' }}>
                    <button
                      className="resource-delete"
                      onClick={e => { e.stopPropagation(); handleEditResource(resource) }}
                      title={isZh ? '编辑' : 'Edit'}
                      style={{ background: 'var(--secondary)' }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="resource-delete"
                      onClick={e => handleDeleteResource(e, resource.id)}
                      title={isZh ? '删除' : 'Delete'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* FAB Button */}
      <button
        className="fab-button"
        onClick={() => setShowAddModal(true)}
      >
        <Plus size={14} />
      </button>

      {/* Add Resource Modal */}
      {showAddModal && (
        <div className="resource-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="resource-modal" onClick={e => e.stopPropagation()}>
            <div className="resource-modal-header">
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                {isZh ? '新建资源' : t.resource_newTitle}
              </span>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  background: 'var(--sidebar-bg)',
                  border: 'none'
                }}
              >
                ×
              </button>
            </div>
            <div className="resource-modal-content">
              {/* Title */}
              <div className="resource-form-group">
                <input
                  type="text"
                  className="resource-form-input"
                  placeholder={isZh ? '资源标题...' : t.resource_titlePlaceholder}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Type */}
              <div className="resource-form-group">
                <label className="resource-form-label">
                  {isZh ? '类型' : t.resource_type}
                </label>
                <div className="resource-type-chips">
                  {(['document', 'link', 'spreadsheet', 'image', 'collection'] as const).map(type => (
                    <div
                      key={type}
                      className={`resource-type-chip ${newType === type ? 'active' : ''}`}
                      onClick={() => setNewType(type)}
                    >
                      {type === 'document' && (isZh ? '文档' : 'Doc')}
                      {type === 'link' && (isZh ? '链接' : 'Link')}
                      {type === 'spreadsheet' && (isZh ? '表格' : 'Sheet')}
                      {type === 'image' && (isZh ? '图片' : 'Image')}
                      {type === 'collection' && (isZh ? '收藏' : 'Collection')}
                    </div>
                  ))}
                </div>
              </div>

              {/* URL (for link type) */}
              {newType === 'link' && (
                <div className="resource-form-group">
                  <input
                    type="text"
                    className="resource-form-input"
                    placeholder={isZh ? 'https://...' : t.resource_urlPlaceholder}
                    value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                  />
                </div>
              )}

              {/* Description */}
              <div className="resource-form-group">
                <textarea
                  className="resource-form-textarea"
                  placeholder={isZh ? '添加描述...' : t.resource_descPlaceholder}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                />
              </div>

              {/* Tags */}
              <div className="resource-form-group">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {newTags.map(tag => {
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
                          onClick={() => setNewTags(newTags.filter(t => t.name !== tag.name))}
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
                    className="resource-form-input"
                    placeholder={isZh ? '输入标签后按回车添加' : 'Type a tag and press Enter to add'}
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    onFocus={() => setShowNewTagDropdown(true)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newTagInput.trim()) {
                        e.preventDefault()
                        if (!newTags.some(t => t.name === newTagInput.trim())) {
                          setNewTags([...newTags, { name: newTagInput.trim(), color: newTagColor }])
                        }
                        setNewTagInput('')
                      }
                    }}
                  />
                  {showNewTagDropdown && (
                    <>
                      {availableTags.filter(tag => !newTags.some(t => t.name === tag) && tag.includes(newTagInput)).length > 0 && (
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
                          {availableTags.filter(tag => !newTags.some(t => t.name === tag) && tag.includes(newTagInput)).map(tag => {
                            const color = getTagColor(tag)
                            return (
                              <div
                                key={tag}
                                onClick={() => {
                                  setNewTags([...newTags, { name: tag, color: color.border === '#cccccc' ? 'gray' : color.name }])
                                  setNewTagInput('')
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
                          setNewTagColor(color.name)
                        }}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: color.bg,
                          border: `2px solid ${color.border}`,
                          cursor: 'pointer',
                          outline: newTagColor === color.name ? `2px solid ${color.text}` : 'none',
                          outlineOffset: '2px'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="resource-modal-footer">
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                {isZh ? '取消' : t.resource_cancel}
              </button>
              <button
                onClick={handleAddResource}
                disabled={!newTitle.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: newTitle.trim() ? 'var(--foreground)' : 'var(--muted-foreground)',
                  color: 'var(--primary-foreground)',
                  cursor: newTitle.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                {isZh ? '保存资源' : t.resource_save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Resource Modal */}
      {editingResource && (
        <div className="resource-modal-overlay" onClick={() => setEditingResource(null)}>
          <div className="resource-modal" onClick={e => e.stopPropagation()}>
            <div className="resource-modal-header">
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                {isZh ? '编辑资源' : 'Edit Resource'}
              </span>
              <button
                onClick={() => setEditingResource(null)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  background: 'var(--sidebar-bg)',
                  border: 'none'
                }}
              >
                ×
              </button>
            </div>
            <div className="resource-modal-content">
              {/* Title */}
              <div className="resource-form-group">
                <input
                  type="text"
                  className="resource-form-input"
                  placeholder={isZh ? '资源标题...' : t.resource_titlePlaceholder}
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Type */}
              <div className="resource-form-group">
                <label className="resource-form-label">
                  {isZh ? '类型' : t.resource_type}
                </label>
                <div className="resource-type-chips">
                  {(['document', 'link', 'spreadsheet', 'image', 'collection'] as const).map(type => (
                    <div
                      key={type}
                      className={`resource-type-chip ${editType === type ? 'active' : ''}`}
                      onClick={() => setEditType(type)}
                    >
                      {type === 'document' && (isZh ? '文档' : 'Doc')}
                      {type === 'link' && (isZh ? '链接' : 'Link')}
                      {type === 'spreadsheet' && (isZh ? '表格' : 'Sheet')}
                      {type === 'image' && (isZh ? '图片' : 'Image')}
                      {type === 'collection' && (isZh ? '收藏' : 'Collection')}
                    </div>
                  ))}
                </div>
              </div>

              {/* URL (for link type) */}
              {editType === 'link' && (
                <div className="resource-form-group">
                  <input
                    type="text"
                    className="resource-form-input"
                    placeholder={isZh ? 'https://...' : t.resource_urlPlaceholder}
                    value={editUrl}
                    onChange={e => setEditUrl(e.target.value)}
                  />
                </div>
              )}

              {/* Description */}
              <div className="resource-form-group">
                <textarea
                  className="resource-form-textarea"
                  placeholder={isZh ? '添加描述...' : t.resource_descPlaceholder}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                />
              </div>

              {/* Tags */}
              <div className="resource-form-group">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {editTags.map(tag => {
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
                          onClick={() => setEditTags(editTags.filter(t => t.name !== tag.name))}
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
                    className="resource-form-input"
                    placeholder={isZh ? '输入标签后按回车添加' : 'Type a tag and press Enter to add'}
                    value={editTagInput}
                    onChange={e => setEditTagInput(e.target.value)}
                    onFocus={() => setShowEditTagDropdown(true)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && editTagInput.trim()) {
                        e.preventDefault()
                        if (!editTags.some(t => t.name === editTagInput.trim())) {
                          setEditTags([...editTags, { name: editTagInput.trim(), color: editTagColor }])
                        }
                        setEditTagInput('')
                      }
                    }}
                  />
                  {showEditTagDropdown && (
                    <>
                      {availableTags.filter(tag => !editTags.some(t => t.name === tag) && tag.includes(editTagInput)).length > 0 && (
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
                          {availableTags.filter(tag => !editTags.some(t => t.name === tag) && tag.includes(editTagInput)).map(tag => {
                            const color = getTagColor(tag)
                            return (
                              <div
                                key={tag}
                                onClick={() => {
                                  setEditTags([...editTags, { name: tag, color: color.border === '#cccccc' ? 'gray' : color.name }])
                                  setEditTagInput('')
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
                          setEditTagColor(color.name)
                        }}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: color.bg,
                          border: `2px solid ${color.border}`,
                          cursor: 'pointer',
                          outline: editTagColor === color.name ? `2px solid ${color.text}` : 'none',
                          outlineOffset: '2px'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="resource-modal-footer">
              <button
                onClick={() => setEditingResource(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                {isZh ? '取消' : t.resource_cancel}
              </button>
              <button
                onClick={handleUpdateResource}
                disabled={!editTitle.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: editTitle.trim() ? 'var(--foreground)' : 'var(--muted-foreground)',
                  color: 'var(--primary-foreground)',
                  cursor: editTitle.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                {isZh ? '保存修改' : t.update}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
