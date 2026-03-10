import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store/useStore'
import type { AIProvider } from '../types'
import { useT } from '../i18n/useT'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'

const PROVIDER_PRESETS = [
  { name: 'OpenAI', type: 'openai' as const, base_url: 'https://api.openai.com', model: 'gpt-4o' },
  { name: 'Anthropic', type: 'anthropic' as const, base_url: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
  { name: 'Ollama (Local)', type: 'ollama' as const, base_url: 'http://localhost:11434', model: 'llama3' },
  { name: 'Custom OpenAI-Compatible', type: 'custom' as const, base_url: '', model: '' },
]

const EMPTY_FORM: Partial<AIProvider & { provider_type: string }> = {
  name: 'Custom OpenAI-Compatible',
  provider_type: 'custom',
  base_url: '',
  model: '',
  api_key: '',
  is_active: 1,
}

function markdownToPlainText(md: string): string {
  return md
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove strikethrough
    .replace(/~~(.*?)~~/g, '$1')
    // Remove inline code markers but keep content
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks but keep content
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[\s\S]*?\n/, '').replace(/```$/, ''))
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove list markers
    .replace(/^[*+-]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove task list checkboxes
    .replace(/^\[ \]\s+/gm, '')
    .replace(/^\[x\]\s+/gm, '')
    // Clean up extra newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface CopyButtonProps {
  content: string
}

function CopyButton({ content }: CopyButtonProps) {
  const { t } = { t: (key: string) => key } // Will be replaced with real hook
  const [showMenu, setShowMenu] = useState(false)
  const [copied, setCopied] = useState<'text' | 'markdown' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get real t hook
  const RealT = useT()
  const tReal = (key: string) => {
    const fullKey = `chat_${key}` as keyof typeof RealT
    return (RealT as any)[fullKey] || key
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowMenu(true)
  }

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowMenu(false)
    }, 150)
  }

  const handleCopy = async (type: 'text' | 'markdown') => {
    try {
      const text = type === 'text' ? markdownToPlainText(content) : content
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setShowMenu(false)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  return (
    <div
      className="copy-button-container"
      ref={menuRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="copy-button"
        title="Copy"
      >
        {copied ? (
          <span className="copy-copied">{tReal('copied')}</span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        )}
      </button>
      {showMenu && (
        <div className="copy-dropdown">
          <button className="copy-dropdown-item" onClick={() => handleCopy('text')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            {tReal('copyText')}
          </button>
          <button className="copy-dropdown-item" onClick={() => handleCopy('markdown')}>
            <span style={{ marginRight: '0.5rem', fontWeight: 'bold', fontSize: '0.8rem', lineHeight: '1' }}>M</span>
            {tReal('copyMarkdown')}
          </button>
        </div>
      )}
    </div>
  )
}

interface MarkdownMessageProps {
  content: string
}

function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const codeContent = String(children).replace(/\n$/, '')
            return !inline && match ? (
              <div className="code-block-wrapper">
                <div className="code-block-header">
                  <span className="code-language">{match[1]}</span>
                  <button
                    className="code-copy-btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(codeContent)
                        const btn = document.activeElement as HTMLButtonElement
                        if (btn) {
                          const originalText = btn.textContent
                          btn.textContent = 'Copied!'
                          setTimeout(() => { btn.textContent = originalText }, 1500)
                        }
                      } catch (err) {
                        console.error('Copy failed:', err)
                      }
                    }}
                  >
                    Copy
                  </button>
                </div>
                <SyntaxHighlighter
                  style={tomorrow as any}
                  language={match[1]}
                  PreTag="div"
                  className="code-block-content"
                  customStyle={{ margin: 0, borderRadius: '0 0 6px 6px' }}
                  {...props}
                >
                  {codeContent}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code className={`inline-code ${className || ''}`} {...props}>
                {children}
              </code>
            )
          },
          a({ children, href, ...props }: any) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            )
          },
          table({ children, ...props }: any) {
            return (
              <div className="table-wrapper">
                <table {...props}>{children}</table>
              </div>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default function AIChat() {
  const {
    providers, activeProvider, conversations, currentConversationId, messages, isAILoading,
    streamingMessageId, streamingContent,
    loadProviders, saveProvider, setActiveProvider, deleteProvider,
    selectConversation, newConversation, deleteConversation, renameConversation,
    sendChatMessage,
  } = useStore()
  const t = useT()

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [providerForm, setProviderForm] = useState<Partial<AIProvider & { provider_type: string }>>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ show: boolean; x: number; y: number; convId: string } | null>(null)
  const [showRenameInput, setShowRenameInput] = useState(false)
  const [renameInput, setRenameInput] = useState('')
  const [renameConvId, setRenameConvId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Combine actual messages with streaming content for display
  const displayMessages = useMemo(() => {
    if (!streamingMessageId || !streamingContent) return messages
    return [
      ...messages,
      { role: 'assistant' as const, content: streamingContent }
    ]
  }, [messages, streamingMessageId, streamingContent])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages])

  const handleSend = async () => {
    if (!input.trim() || isAILoading || !currentConversationId) return
    const text = input.trim()
    setInput('')
    await sendChatMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleNewConversation = async () => {
    if (!activeProvider) { setShowSettings(true); return }
    await newConversation()
  }

  const openModal = () => { setProviderForm(EMPTY_FORM); setEditingId(null); setShowApiKey(false); setShowSettings(true) }
  const closeModal = () => { setShowSettings(false); setProviderForm(EMPTY_FORM); setEditingId(null); setShowApiKey(false) }

  const handleEditProvider = (p: AIProvider) => {
    setProviderForm({ id: p.id, name: p.name, provider_type: p.provider_type, base_url: p.base_url, model: p.model, api_key: p.api_key || '', is_active: p.is_active })
    setEditingId(p.id)
    setShowApiKey(false)
  }

  const handleSaveProvider = async () => {
    if (!providerForm.name || !providerForm.base_url || !providerForm.model) return
    await saveProvider({
      name: providerForm.name!,
      provider_type: (providerForm.provider_type as AIProvider['provider_type']) || 'custom',
      base_url: providerForm.base_url!,
      model: providerForm.model!,
      api_key: providerForm.api_key || undefined,
      is_active: editingId ? (providerForm.is_active ?? 1) : 1,
    })
    closeModal()
    await loadProviders()
  }

  const applyPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
    setProviderForm(f => ({ ...f, name: preset.name, provider_type: preset.type, base_url: preset.base_url, model: preset.model }))
    setEditingId(null)
  }

  const handleContextMenu = (e: React.MouseEvent, convId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, convId })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const handleExportConversation = async (convId: string) => {
    const conv = conversations.find(c => c.id === convId)
    if (!conv) return
    try {
      // Need to load messages for this conversation
      const msgs = await window.api.getMessages(convId)
      const result = await window.api.exportConversationMarkdown(
        convId,
        conv.title,
        msgs
      )
      if (result.success) {
        alert(t.chat_exportOk)
      } else if (!result.canceled) {
        alert(t.chat_exportErr)
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert(t.chat_exportErr)
    }
    closeContextMenu()
  }

  const handleDeleteConversation = (convId: string) => {
    deleteConversation(convId)
    closeContextMenu()
  }

  const handleOpenRename = (convId: string) => {
    const conv = conversations.find(c => c.id === convId)
    setRenameInput(conv?.title || '')
    setRenameConvId(convId)
    setShowRenameInput(true)
    closeContextMenu()
  }

  const handleRename = async () => {
    if (renameConvId && renameInput.trim()) {
      await renameConversation(renameConvId, renameInput.trim())
      setShowRenameInput(false)
      setRenameConvId(null)
      setRenameInput('')
    }
  }

  const cancelRename = () => {
    setShowRenameInput(false)
    setRenameConvId(null)
    setRenameInput('')
  }

  useEffect(() => {
    const handleClickOutside = () => closeContextMenu()
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="chat-composition">
      {/* Conversation Sidebar */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-title">{t.chat_conversations}</div>
        <button className="btn-primary" onClick={handleNewConversation} style={{ marginBottom: '0.8rem', width: '100%', fontSize: '0.6rem', padding: '0.5rem' }}>
          {t.chat_newChat}
        </button>
        {conversations.map(conv => (
          <div
            key={conv.id}
            className={`chat-conv-item ${currentConversationId === conv.id ? 'active' : ''}`}
            onClick={() => selectConversation(conv.id)}
            onContextMenu={(e) => handleContextMenu(e, conv.id)}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.title}</span>
          </div>
        ))}
        {conversations.length === 0 && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: 'rgba(20,28,58,0.3)', padding: '0.5rem', fontStyle: 'italic' }}>{t.chat_noConvs}</div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(20,28,58,0.08)' }}>
          {activeProvider ? (
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(20,28,58,0.3)', marginBottom: '0.3rem' }}>{t.chat_activeProvider}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: 'var(--ink-secondary)' }}>{activeProvider.name}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', color: 'rgba(20,28,58,0.35)', marginTop: '0.1rem' }}>{activeProvider.model}</div>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.62rem', color: 'rgba(20,28,58,0.3)', fontStyle: 'italic' }}>{t.chat_noProvider}</div>
          )}
          <button className="btn-text" onClick={openModal} style={{ marginTop: '0.5rem', paddingLeft: 0, display: 'block' }}>{t.chat_configure}</button>
        </div>
      </div>

      {/* Chat Main Area */}
      <div className="chat-main">
        <div className="chat-header">
          <div className="chat-title">
            {currentConversationId ? conversations.find(c => c.id === currentConversationId)?.title || 'Chat' : t.chat_headerTitle}
          </div>
          {activeProvider && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-secondary)' }}>
              {activeProvider.name} · {activeProvider.model}
            </div>
          )}
        </div>

        <div className="chat-messages-wrapper" ref={wrapperRef}>
          <div className="chat-messages">
            {!currentConversationId ? (
              <div className="chat-empty-state">
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'rgba(20,28,58,0.08)', letterSpacing: '-0.03em' }}>{t.chat_emptyTitle}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-secondary)', textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
                  {activeProvider ? t.chat_emptyHasProvider : t.chat_emptyNoProvider}
                </div>
                <button className="btn-primary" onClick={activeProvider ? handleNewConversation : openModal} style={{ marginTop: '0.5rem' }}>
                  {activeProvider ? t.chat_newConversation : t.chat_configProvider}
                </button>
              </div>
            ) : displayMessages.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'rgba(20,28,58,0.15)', fontStyle: 'italic', paddingTop: '2rem' }}>{t.chat_whatsOnMind}</div>
            ) : (
              displayMessages.map((msg, i) => (
                <div key={i} className={`chat-message ${msg.role} fade-in`} style={{ animationDelay: `${i * 0.03}s` }}>
                  <div className="chat-role-label">{msg.role === 'user' ? t.chat_you : t.chat_assistant}</div>
                  <div className={`chat-bubble-wrapper ${msg.role}`}>
                    <div className={`chat-bubble ${msg.role}`}>
                      {msg.role === 'assistant' ? (
                        <MarkdownMessage content={msg.content} />
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      )}
                    </div>
                    {msg.role === 'assistant' && <CopyButton content={msg.content} />}
                  </div>
                </div>
              ))
            )}
            {isAILoading && !streamingContent && (
              <div className="chat-message assistant">
                <div className="chat-role-label">{t.chat_assistant}</div>
                <div className="chat-bubble assistant" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.8rem 1rem' }}>
                  <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="chat-input-area">
          <textarea
            className="chat-input"
            placeholder={currentConversationId ? t.chat_inputPlaceholder : t.chat_inputDisabled}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!currentConversationId || isAILoading}
            rows={1}
          />
          <button className="btn-primary" onClick={handleSend} disabled={!input.trim() || isAILoading || !currentConversationId} style={{ flexShrink: 0, opacity: (!input.trim() || isAILoading || !currentConversationId) ? 0.4 : 1 }}>
            {t.chat_send}
          </button>
        </div>
      </div>

      {/* Provider Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal-sheet fade-in" style={{ width: '520px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-title">{editingId ? t.chat_editProvider : t.chat_providerTitle}</div>

            {!editingId && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div className="form-label" style={{ marginBottom: '0.6rem' }}>{t.chat_quickSetup}</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {PROVIDER_PRESETS.map(preset => (
                    <button key={preset.type} className="btn-text" onClick={() => applyPreset(preset)} style={{ border: '1px solid rgba(20,28,58,0.1)', padding: '0.3rem 0.8rem', color: providerForm.provider_type === preset.type ? 'var(--ink-primary)' : 'var(--ink-secondary)', borderColor: providerForm.provider_type === preset.type ? 'rgba(20,28,58,0.3)' : 'rgba(20,28,58,0.1)', background: providerForm.provider_type === preset.type ? 'rgba(20,28,58,0.04)' : 'transparent' }}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-field">
                <label className="form-label">{t.chat_providerName}</label>
                <input className="form-input" value={providerForm.name || ''} onChange={e => setProviderForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label">{t.chat_model}</label>
                <input className="form-input" value={providerForm.model || ''} onChange={e => setProviderForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. gpt-4o, llama3" />
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">{t.chat_baseUrl}</label>
              <input className="form-input" value={providerForm.base_url || ''} onChange={e => setProviderForm(f => ({ ...f, base_url: e.target.value }))} placeholder="https://api.openai.com" />
            </div>

            <div className="form-field">
              <label className="form-label">{t.chat_apiKey} <span style={{ opacity: 0.5, textTransform: 'none' }}>{t.chat_apiKeyHint}</span></label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input className="form-input" type={showApiKey ? 'text' : 'password'} value={providerForm.api_key || ''} onChange={e => setProviderForm(f => ({ ...f, api_key: e.target.value }))} placeholder="sk-..." style={{ paddingRight: '2.5rem', flex: 1 }} />
                <button onClick={() => setShowApiKey(v => !v)} style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(20,28,58,0.35)', fontSize: '0.7rem', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em', padding: '0.2rem 0.3rem', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-primary)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(20,28,58,0.35)')}>
                  {showApiKey ? t.hide : t.show}
                </button>
              </div>
            </div>

            {providers.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(20,28,58,0.08)' }}>
                <div className="form-label" style={{ marginBottom: '0.5rem' }}>{t.chat_savedProviders}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {providers.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.7rem', background: editingId === p.id ? 'rgba(20,28,58,0.05)' : 'transparent', border: '1px solid', borderColor: editingId === p.id ? 'rgba(20,28,58,0.15)' : 'transparent', transition: 'all 0.15s' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-primary)' }}>{p.name}</span>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', color: 'var(--ink-secondary)', marginLeft: '0.5rem' }}>{p.model}</span>
                        {p.is_active ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sheet-blue)', marginLeft: '0.5rem' }}>{t.chat_active}</span> : null}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {!p.is_active && <button className="btn-text" onClick={() => setActiveProvider(p.id)}>{t.use}</button>}
                        <button className="btn-text" onClick={() => editingId === p.id ? setEditingId(null) : handleEditProvider(p)} style={{ color: editingId === p.id ? 'var(--ink-primary)' : 'var(--ink-secondary)' }}>
                          {editingId === p.id ? t.cancel : t.edit}
                        </button>
                        <button className="btn-text" onClick={() => deleteProvider(p.id)} style={{ color: 'rgba(168,50,50,0.7)' }} onMouseEnter={e => (e.currentTarget.style.color = '#a83232')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(168,50,50,0.7)')}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-text" onClick={closeModal}>{t.cancel}</button>
              <button className="btn-primary" onClick={handleSaveProvider} disabled={!providerForm.name || !providerForm.base_url || !providerForm.model} style={{ opacity: (!providerForm.name || !providerForm.base_url || !providerForm.model) ? 0.4 : 1 }}>
                {editingId ? t.update : t.chat_saveActivate}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu for conversations */}
      {contextMenu && contextMenu.show && (
        <div
          className="chat-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <button
            className="chat-context-menu-item"
            onClick={() => handleOpenRename(contextMenu.convId)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            {t.rename || 'Rename'}
          </button>
          <button
            className="chat-context-menu-item"
            onClick={() => handleExportConversation(contextMenu.convId)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {t.chat_export}
          </button>
          <button
            className="chat-context-menu-item chat-context-menu-item-delete"
            onClick={() => handleDeleteConversation(contextMenu.convId)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            {t.delete}
          </button>
        </div>
      )}

      {/* Rename Input Dialog */}
      {showRenameInput && (
        <div className="modal-overlay" onClick={cancelRename}>
          <div className="rename-dialog" onClick={e => e.stopPropagation()}>
            <div className="rename-dialog-title">{t.rename || 'Rename Conversation'}</div>
            <input
              type="text"
              className="form-input"
              value={renameInput}
              onChange={e => setRenameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') cancelRename()
              }}
              autoFocus
            />
            <div className="rename-dialog-actions">
              <button className="btn-text" onClick={cancelRename}>{t.cancel}</button>
              <button className="btn-primary" onClick={handleRename} disabled={!renameInput.trim()} style={{ opacity: renameInput.trim() ? 1 : 0.5 }}>{t.save || 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
