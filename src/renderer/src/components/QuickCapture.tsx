import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'

interface QuickCaptureProps {
  style?: React.CSSProperties
}

export default function QuickCapture({ style }: QuickCaptureProps) {
  const [text, setText] = useState('')
  const [context, setContext] = useState('')
  const [showContext, setShowContext] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addTask } = useStore()
  const t = useT()

  const handleCapture = async () => {
    if (!text.trim()) return
    await addTask({ title: text.trim(), context: context || undefined, status: 'inbox' })
    setText('')
    setContext('')
    setShowContext(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCapture()
  }

  return (
    <div className="sheet-white" style={style}>
      <svg className="paperclip" viewBox="0 0 32 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 94C10.4772 94 6 89.5228 6 84V26C6 18.268 12.268 12 20 12C27.732 12 34 18.268 34 26V78C34 81.3137 31.3137 84 28 84C24.6863 84 22 81.3137 22 78V30C22 28.8954 21.1046 28 20 28C18.8954 28 18 28.8954 18 30V78C18 83.5228 22.4772 88 28 88C33.5228 88 38 83.5228 38 78V26C38 16.0589 29.9411 8 20 8C10.0589 8 2 16.0589 2 26V84C2 91.732 8.268 98 16 98C23.732 98 30 91.732 30 84V30" stroke="#1A1C20" strokeWidth="2" strokeLinecap="round"/>
      </svg>

      <div className="capture-header">
        <span>{t.capture_title}</span>
        <span>{t.capture_inbox}</span>
      </div>

      <textarea
        ref={textareaRef}
        className="capture-input"
        placeholder={t.capture_placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />

      {showContext && (
        <input
          className="form-input"
          placeholder={t.capture_ctxHint}
          value={context}
          onChange={e => setContext(e.target.value)}
          style={{ marginBottom: '0.8rem', fontSize: '0.72rem', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
      )}

      <div className="capture-actions">
        <button className="btn-text" onClick={handleCapture}>{t.capture_addInbox}</button>
        <button className="btn-text" style={{ marginLeft: 'auto' }} onClick={() => setShowContext(!showContext)}>
          {showContext ? t.capture_hideCtx : t.capture_assignCtx}
        </button>
      </div>

      <div className="emboss-text">{t.capture_emboss}</div>
    </div>
  )
}