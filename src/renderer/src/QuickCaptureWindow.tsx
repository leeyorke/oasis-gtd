import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from './store/useStore'
import { useT } from './i18n/useT'

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

export default function QuickCaptureWindow() {
  const { addNote, notes, loadSettings, loadNotes } = useStore()
  const t = useT()

  const [content, setContent] = useState('')
  const [tags, setTags] = useState<{ name: string; color: string }[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagColor, setTagColor] = useState(TAG_COLORS[0].name)
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [ready, setReady] = useState(false)

  // Load settings and notes from DB so translations and tag suggestions work
  useEffect(() => {
    Promise.all([loadSettings(), loadNotes()]).then(() => setReady(true))
  }, [loadSettings, loadNotes])

  // Auto-focus textarea once ready
  useEffect(() => {
    if (ready) {
      textareaRef.current?.focus()
    }
  }, [ready])

  // Extract unique tag names with their colors for suggestions
  const availableTags = useMemo(() => {
    const tagMap = new Map<string, string>()
    notes.forEach(note => {
      note.tags?.forEach(t => {
        const parts = t.split('|')
        const name = parts[0]
        const color = parts[1] || TAG_COLORS[0].name
        if (!tagMap.has(name)) {
          tagMap.set(name, color)
        }
      })
    })
    return Array.from(tagMap, ([name, color]) => ({ name, color }))
  }, [notes])

  const handleClose = () => {
    window.api.closeQuickCapture()
  }

  const handleSave = async () => {
    if (!content.trim()) return
    const storedTags = tags.map(t => t.color !== 'gray' ? `${t.name}|${t.color}` : t.name)
    await addNote({
      content: content.trim(),
      tags: storedTags.length > 0 ? storedTags : undefined,
    })
    handleClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Enter' && tagInput) {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleAddTag = () => {
    const name = tagInput.trim()
    if (!name) return
    if (tags.some(t => t.name === name)) return
    setTags([...tags, { name, color: tagColor }])
    setTagInput('')
  }

  const handleRemoveTag = (name: string) => {
    setTags(tags.filter(t => t.name !== name))
  }

  const handleSuggestionClick = (name: string, color: string) => {
    if (tags.some(t => t.name === name)) return
    setTags([...tags, { name, color }])
    setTagInput('')
    setShowTagDropdown(false)
  }

  const suggestions = tagInput.trim()
    ? availableTags.filter(t => t.name.includes(tagInput) && !tags.some(x => x.name === t.name))
    : availableTags.filter(t => !tags.some(x => x.name === t.name))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Draggable title bar */}
      <div style={{ height: '32px', WebkitAppRegion: 'drag' as any, flexShrink: 0 }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '0 1.5rem 1.5rem',
        fontFamily: 'var(--font-sans)',
        boxSizing: 'border-box',
        background: '#EBE7E0',
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Title */}
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.1rem',
          margin: 0,
          marginBottom: '1rem',
          color: 'var(--ink-primary)',
        }}
      >
        {t.nav_thoughts}
      </h3>

      {/* Content textarea */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={t.capture_placeholder}
        style={{
          width: '100%',
          minHeight: '100px',
          flex: 1,
          padding: '0.7rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.82rem',
          border: 'none',
          background: '#EBE7E0',
          color: 'var(--ink-primary)',
          resize: 'none',
          outline: 'none',
          boxSizing: 'border-box',
          lineHeight: 1.6,
        }}
      />

      {/* Tags */}
      <div style={{ marginTop: '0.5rem' }}>
        <label
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-secondary)',
            display: 'block',
            marginBottom: '0.4rem',
          }}
        >
          {t.capture_tags}
        </label>

        {/* Tag pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.4rem' }}>
          {tags.map(tag => {
            const color = TAG_COLORS.find(c => c.name === tag.color) || TAG_COLORS[0]
            return (
              <span
                key={tag.name}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '20px',
                  fontSize: '0.65rem',
                  background: color.bg,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                  cursor: 'default',
                }}
              >
                {tag.name}
                <span
                  style={{ cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem', lineHeight: 1 }}
                  onClick={() => handleRemoveTag(tag.name)}
                >
                  ×
                </span>
              </span>
            )
          })}
        </div>

        {/* Tag input + color picker */}
          <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              value={tagInput}
              onChange={e => { setTagInput(e.target.value); setShowTagDropdown(true) }}
              onFocus={() => setShowTagDropdown(true)}
              onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
              placeholder={t.capture_tagPlaceholder}
              style={{
                flex: 1,
                padding: '0.3rem 0.5rem',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.72rem',
                border: '1px solid rgba(20,28,58,0.1)',
                borderRadius: 0,
                background: '#EBE7E0',
                outline: 'none',
                color: 'var(--ink-primary)',
              }}
            />
            {/* Color dots */}
            <div style={{ display: 'flex', gap: '3px' }}>
              {TAG_COLORS.map(c => (
                <div
                  key={c.name}
                  onClick={() => setTagColor(c.name)}
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: c.bg,
                    border: tagColor === c.name ? '2px solid var(--ink-primary)' : `1px solid ${c.border}`,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Dropdown suggestions */}
          {showTagDropdown && suggestions.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.3rem',
                padding: '0.5rem',
                marginTop: '0.5rem',
                maxHeight: '120px',
                overflowY: 'auto',
                background: '#fff',
                border: '1px solid rgba(20,28,58,0.1)',
                borderRadius: '8px',
              }}
            >
              {suggestions.map(tagItem => {
                const colorInfo = TAG_COLORS.find(c => c.name === tagItem.color) || TAG_COLORS[0]
                return (
                <span
                  key={tagItem.name}
                  onMouseDown={() => handleSuggestionClick(tagItem.name, tagItem.color)}
                  style={{
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.65rem',
                    background: colorInfo.bg,
                    color: colorInfo.text,
                    border: `1px solid ${colorInfo.border}`,
                    borderRadius: '20px',
                    cursor: 'pointer',
                  }}
                >
                  {tagItem.name}
                </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button
          onClick={handleClose}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: 0,
            border: '1px solid rgba(20,28,58,0.12)',
            background: 'transparent',
            color: 'var(--ink-secondary)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.72rem',
            cursor: 'pointer',
          }}
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSave}
          disabled={!content.trim()}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: 0,
            border: 'none',
            background: content.trim() ? 'var(--ink-primary)' : 'rgba(20,28,58,0.15)',
            color: content.trim() ? 'var(--ink-light)' : 'var(--ink-secondary)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.72rem',
            cursor: content.trim() ? 'pointer' : 'default',
            transition: 'all 0.15s',
          }}
        >
          {t.save}
        </button>
      </div>
    </div>
    </div>
  )
}
