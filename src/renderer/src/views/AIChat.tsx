import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import type { AIProvider } from '../types'

const PROVIDER_PRESETS = [
  { name: 'OpenAI', type: 'openai' as const, base_url: 'https://api.openai.com', model: 'gpt-4o' },
  { name: 'Anthropic', type: 'anthropic' as const, base_url: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
  { name: 'Ollama (Local)', type: 'ollama' as const, base_url: 'http://localhost:11434', model: 'llama3' },
  { name: 'Custom OpenAI-Compatible', type: 'custom' as const, base_url: 'http://localhost:8080', model: 'local-model' },
]

export default function AIChat() {
  const {
    providers, activeProvider, conversations, currentConversationId, messages, isAILoading,
    loadProviders, saveProvider, setActiveProvider, deleteProvider,
    loadConversations, selectConversation, newConversation, deleteConversation,
    sendChatMessage,
  } = useStore()

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [providerForm, setProviderForm] = useState<Partial<AIProvider & { provider_type: string }>>({
    name: 'Ollama (Local)',
    provider_type: 'ollama',
    base_url: 'http://localhost:11434',
    model: 'llama3',
    api_key: '',
    is_active: 1,
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isAILoading || !currentConversationId) return
    const text = input.trim()
    setInput('')
    await sendChatMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewConversation = async () => {
    if (!activeProvider) {
      setShowSettings(true)
      return
    }
    await newConversation()
  }

  const handleSaveProvider = async () => {
    if (!providerForm.name || !providerForm.base_url || !providerForm.model) return
    await saveProvider({
      name: providerForm.name!,
      provider_type: (providerForm.provider_type as AIProvider['provider_type']) || 'openai',
      base_url: providerForm.base_url!,
      model: providerForm.model!,
      api_key: providerForm.api_key || undefined,
      is_active: 1,
    })
    setShowSettings(false)
    setProviderForm({ name: 'Ollama (Local)', provider_type: 'ollama', base_url: 'http://localhost:11434', model: 'llama3', api_key: '', is_active: 1 })
    await loadProviders()
  }

  const applyPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
    setProviderForm(f => ({ ...f, name: preset.name, provider_type: preset.type, base_url: preset.base_url, model: preset.model }))
  }

  return (
    <div className="chat-composition">
      {/* Conversation Sidebar */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-title">Conversations</div>
        <button
          className="btn-primary"
          onClick={handleNewConversation}
          style={{ marginBottom: '0.8rem', width: '100%', fontSize: '0.6rem', padding: '0.5rem' }}
        >
          + New Chat
        </button>
        {conversations.map(conv => (
          <div
            key={conv.id}
            className={`chat-conv-item ${currentConversationId === conv.id ? 'active' : ''}`}
            onClick={() => selectConversation(conv.id)}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.title}</span>
            <button
              className="btn-text"
              onClick={e => { e.stopPropagation(); deleteConversation(conv.id) }}
              style={{ flexShrink: 0, fontSize: '0.75rem', padding: 0, opacity: 0.5 }}
            >×</button>
          </div>
        ))}
        {conversations.length === 0 && (
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: 'rgba(20,28,58,0.3)', padding: '0.5rem', fontStyle: 'italic' }}>
            No conversations yet
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(20,28,58,0.08)' }}>
          {activeProvider ? (
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(20,28,58,0.3)', marginBottom: '0.3rem' }}>Active Provider</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: 'var(--ink-secondary)' }}>{activeProvider.name}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', color: 'rgba(20,28,58,0.35)', marginTop: '0.1rem' }}>{activeProvider.model}</div>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.62rem', color: 'rgba(20,28,58,0.3)', fontStyle: 'italic' }}>No provider set</div>
          )}
          <button className="btn-text" onClick={() => setShowSettings(true)} style={{ marginTop: '0.5rem', paddingLeft: 0, display: 'block' }}>
            Configure →
          </button>
        </div>
      </div>

      {/* Chat Main Area */}
      <div className="chat-main">
        <div className="chat-header">
          <div className="chat-title">
            {currentConversationId
              ? conversations.find(c => c.id === currentConversationId)?.title || 'Chat'
              : 'AI Assistant'}
          </div>
          {activeProvider && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-secondary)' }}>
              {activeProvider.name} · {activeProvider.model}
            </div>
          )}
        </div>

        {/* Scrollable wrapper — this is the ONLY element with overflow-y: auto */}
        <div className="chat-messages-wrapper" ref={wrapperRef}>
          <div className="chat-messages">
            {!currentConversationId ? (
              <div className="chat-empty-state">
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'rgba(20,28,58,0.08)', letterSpacing: '-0.03em' }}>Aura AI</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-secondary)', textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
                  {activeProvider ? 'Start a new conversation to begin chatting with your AI assistant.' : 'Configure a provider first to get started.'}
                </div>
                <button className="btn-primary" onClick={activeProvider ? handleNewConversation : () => setShowSettings(true)} style={{ marginTop: '0.5rem' }}>
                  {activeProvider ? 'New Conversation' : 'Configure Provider'}
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'rgba(20,28,58,0.15)', fontStyle: 'italic', paddingTop: '2rem' }}>
                What's on your mind?
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`chat-message ${msg.role} fade-in`} style={{ animationDelay: `${i * 0.03}s` }}>
                  <div className="chat-role-label">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                  <div className={`chat-bubble ${msg.role}`} style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                </div>
              ))
            )}

            {isAILoading && (
              <div className="chat-message assistant">
                <div className="chat-role-label">Assistant</div>
                <div className="chat-bubble assistant" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.8rem 1rem' }}>
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          <textarea
            className="chat-input"
            placeholder={currentConversationId ? "Send a message… (Enter to send, Shift+Enter for newline)" : "Start a new conversation to chat"}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!currentConversationId || isAILoading}
            rows={1}
          />
          <button
            className="btn-primary"
            onClick={handleSend}
            disabled={!input.trim() || isAILoading || !currentConversationId}
            style={{ flexShrink: 0, opacity: (!input.trim() || isAILoading || !currentConversationId) ? 0.4 : 1 }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Provider Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="modal-sheet fade-in" style={{ width: '520px' }}>
            <div className="modal-title">AI Provider</div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="form-label" style={{ marginBottom: '0.6rem' }}>Quick Setup</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {PROVIDER_PRESETS.map(preset => (
                  <button
                    key={preset.type}
                    className="btn-text"
                    onClick={() => applyPreset(preset)}
                    style={{
                      border: '1px solid rgba(20,28,58,0.1)', padding: '0.3rem 0.8rem',
                      color: providerForm.provider_type === preset.type ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                      borderColor: providerForm.provider_type === preset.type ? 'rgba(20,28,58,0.3)' : 'rgba(20,28,58,0.1)',
                    }}
                  >{preset.name}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-field">
                <label className="form-label">Provider Name</label>
                <input className="form-input" value={providerForm.name || ''} onChange={e => setProviderForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label">Model</label>
                <input className="form-input" value={providerForm.model || ''} onChange={e => setProviderForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. gpt-4o, llama3" />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Base URL</label>
              <input className="form-input" value={providerForm.base_url || ''} onChange={e => setProviderForm(f => ({ ...f, base_url: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label">API Key <span style={{ opacity: 0.5, textTransform: 'none' }}>(leave empty for local providers)</span></label>
              <input className="form-input" type="password" value={providerForm.api_key || ''} onChange={e => setProviderForm(f => ({ ...f, api_key: e.target.value }))} placeholder="sk-..." />
            </div>
            {providers.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(20,28,58,0.08)' }}>
                <div className="form-label" style={{ marginBottom: '0.5rem' }}>Saved Providers</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {providers.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-primary)' }}>{p.name}</span>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', color: 'var(--ink-secondary)', marginLeft: '0.5rem' }}>{p.model}</span>
                        {p.is_active ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sheet-blue)', marginLeft: '0.5rem' }}>Active</span> : null}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!p.is_active && <button className="btn-text" onClick={() => setActiveProvider(p.id)}>Use</button>}
                        <button className="btn-text" onClick={() => deleteProvider(p.id)} style={{ color: 'rgba(168,50,50,0.7)' }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-text" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveProvider}>Save & Activate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}