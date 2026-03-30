import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Search, MoreHorizontal, Plus, Sun, Cloud, CloudDrizzle, Wind } from 'lucide-react'

const WEATHER_ICONS: Record<string, React.ElementType> = {
  '晴朗': Sun,
  '多云': Cloud,
  '小雨': CloudDrizzle,
  '大风': Wind,
}

export default function Thoughts() {
  const { notes, addNote, searchNotes, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeTag, setActiveTag] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteTags, setNewNoteTags] = useState('')

  // 从所有笔记中提取唯一的标签列表
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    notes.forEach(note => {
      note.tags?.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet)
  }, [notes])

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
    if (activeTag !== 'all' && (!note.tags || !note.tags.includes(activeTag))) {
      return false
    }
    // 搜索过滤
    if (searchKeyword && !note.content.includes(searchKeyword) &&
        (!note.tags || !note.tags.some(tag => tag.includes(searchKeyword)))) {
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
                    <MoreHorizontal size={16} />
                  </div>
                </div>
                <div className="thought-body">
                  {note.content}
                </div>
                <div className="thought-footer">
                  <div className="thought-tags">
                    {note.tags?.map(tag => (
                      <span key={tag} className="thought-tag">
                        {tag}
                      </span>
                    ))}
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
        <Plus size={20} />
      </button>

      {/* 添加随想弹窗 */}
      {showAddModal && (
        <div className="thought-modal-overlay" onClick={() => setShowAddModal(false)}>
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
                {isZh ? '标签（多个用逗号分隔）' : 'Tags (separate with commas)'}
              </label>
              <input
                type="text"
                className="thought-modal-input"
                placeholder={isZh ? '例如：感悟, 灵感, 工作' : 'e.g. insight, inspiration, work'}
                value={newNoteTags}
                onChange={e => setNewNoteTags(e.target.value)}
              />
            </div>
            <div className="thought-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddModal(false)
                  setNewNoteContent('')
                  setNewNoteTags('')
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

                  // 处理标签：逗号分隔，去除空格，过滤空值
                  const tags = newNoteTags
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0)

                  await addNote({
                    content: newNoteContent.trim(),
                    tags: tags.length > 0 ? tags : undefined
                  })

                  setShowAddModal(false)
                  setNewNoteContent('')
                  setNewNoteTags('')
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
    </main>
  )
}