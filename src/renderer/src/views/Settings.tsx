import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import type { AIProvider } from '../types'

type Section = 'general' | 'contexts' | 'ai-providers' | 'data'

const SECTIONS: { id: Section; label: string; description: string }[] = [
  { id: 'general',      label: 'General',      description: 'App preferences & review schedule' },
  { id: 'contexts',     label: 'Contexts',     description: 'Manage your @context tags' },
  { id: 'ai-providers', label: 'AI Providers', description: 'Configure LLM endpoints' },
  { id: 'data',         label: 'Data',         description: 'Export, clean up & database info' },
]

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const PROVIDER_PRESETS = [
  { name: 'OpenAI',                  type: 'openai' as const,    base_url: 'https://api.openai.com',   model: 'gpt-4o' },
  { name: 'Anthropic',               type: 'anthropic' as const, base_url: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
  { name: 'Ollama (Local)',           type: 'ollama' as const,    base_url: 'http://localhost:11434',   model: 'llama3' },
  { name: 'LM Studio',               type: 'custom' as const,    base_url: 'http://localhost:1234',    model: 'local-model' },
  { name: 'Custom OpenAI-Compatible', type: 'custom' as const,   base_url: '',                         model: '' },
]

export default function Settings() {
  const { settings, updateSetting, providers, saveProvider, setActiveProvider, deleteProvider, loadProviders } = useStore()
  const [activeSection, setActiveSection] = useState<Section>('general')

  // ─── Stats & DB path ──────────────────────────────────────────────────────
  const [stats, setStats] = useState<Record<string, number>>({})
  const [dbPath, setDbPath] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [clearStatus, setClearStatus] = useState<'idle' | 'ok'>('idle')

  useEffect(() => {
    window.api.getStats().then(s => setStats(s as unknown as Record<string, number>))
    window.api.getDbPath().then(p => setDbPath(p))
  }, [])

  // ─── Context editing ──────────────────────────────────────────────────────
  const [newContext, setNewContext] = useState('')
  const addContext = () => {
    const val = newContext.trim().startsWith('@') ? newContext.trim() : `@${newContext.trim()}`
    if (!val || val === '@' || settings.contexts.includes(val)) return
    updateSetting('contexts', [...settings.contexts, val])
    setNewContext('')
  }
  const removeContext = (ctx: string) => {
    updateSetting('contexts', settings.contexts.filter(c => c !== ctx))
  }

  // ─── Provider form ────────────────────────────────────────────────────────
  const [providerForm, setProviderForm] = useState<Partial<AIProvider & { provider_type: string }>>({
    name: '', provider_type: 'ollama', base_url: 'http://localhost:11434', model: 'llama3', api_key: '', is_active: 1,
  })
  const [showProviderForm, setShowProviderForm] = useState(false)

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
    setShowProviderForm(false)
    setProviderForm({ name: '', provider_type: 'ollama', base_url: 'http://localhost:11434', model: 'llama3', api_key: '', is_active: 1 })
    await loadProviders()
  }

  // ─── Data actions ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    const res = await window.api.exportJSON()
    setExportStatus(res.success ? 'ok' : 'err')
    setTimeout(() => setExportStatus('idle'), 3000)
  }

  const handleClearCompleted = async () => {
    if (!confirm('Remove all completed tasks? This cannot be undone.')) return
    await window.api.clearCompleted()
    const s = await window.api.getStats()
    setStats(s as unknown as Record<string, number>)
    setClearStatus('ok')
    setTimeout(() => setClearStatus('idle'), 3000)
  }

  const handleClearChat = async () => {
    if (!confirm('Delete all AI chat history? This cannot be undone.')) return
    await window.api.clearChatHistory()
    const s = await window.api.getStats()
    setStats(s as unknown as Record<string, number>)
  }

  return (
    <div className="composition" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="review-full-sheet fade-in" style={{ flexDirection: 'row', padding: 0, gap: 0 }}>

        {/* ─── Left panel: section list ─────────────────────────── */}
        <div style={{
          width: '220px',
          flexShrink: 0,
          borderRight: '1px solid rgba(20,28,58,0.08)',
          padding: '3rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', letterSpacing: '-0.02em', color: 'var(--ink-primary)', marginBottom: '2rem', lineHeight: 1 }}>
            Settings
          </div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                background: activeSection === s.id ? 'rgba(20,28,58,0.06)' : 'transparent',
                border: 'none',
                borderLeft: activeSection === s.id ? '2px solid var(--ink-primary)' : '2px solid transparent',
                padding: '0.6rem 0.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', color: activeSection === s.id ? 'var(--ink-primary)' : 'var(--ink-secondary)', fontWeight: 500, letterSpacing: '0.02em' }}>
                {s.label}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', color: 'rgba(20,28,58,0.3)', marginTop: '0.1rem' }}>
                {s.description}
              </div>
            </button>
          ))}

          {/* Version info */}
          <div style={{ marginTop: 'auto', fontFamily: 'var(--font-sans)', fontSize: '0.55rem', color: 'rgba(20,28,58,0.25)', letterSpacing: '0.08em', lineHeight: 1.7 }}>
            Oasis GTD<br />v0.1.0-alpha<br />Electron · React · SQLite
          </div>
        </div>

        {/* ─── Right panel: section content ────────────────────── */}
        <div style={{ flex: 1, padding: '3rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* ── GENERAL ───────────────────────────────────────────── */}
          {activeSection === 'general' && (
            <div className="fade-in">
              <SectionTitle>General</SectionTitle>

              <FieldGroup label="App Name">
                <input
                  className="form-input"
                  value={settings.app_name}
                  onChange={e => updateSetting('app_name', e.target.value)}
                  placeholder="Oasis"
                  style={{ maxWidth: '240px' }}
                />
                <FieldHint>Shown in the sidebar header</FieldHint>
              </FieldGroup>

              <Divider />

              <FieldGroup label="Weekly Review Day">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {WEEK_DAYS.map((day, idx) => (
                    <button
                      key={day}
                      onClick={() => updateSetting('review_day', idx)}
                      style={{
                        background: settings.review_day === idx ? 'var(--ink-primary)' : 'transparent',
                        color: settings.review_day === idx ? 'var(--ink-light)' : 'var(--ink-secondary)',
                        border: '1px solid',
                        borderColor: settings.review_day === idx ? 'var(--ink-primary)' : 'rgba(20,28,58,0.12)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '0.62rem',
                        padding: '0.35rem 0.7rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <FieldHint>Your default day to do a weekly review</FieldHint>
              </FieldGroup>

              <Divider />

              <FieldGroup label="Default Capture Status">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['inbox', 'next'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => updateSetting('default_capture_status', s)}
                      style={{
                        background: settings.default_capture_status === s ? 'var(--ink-primary)' : 'transparent',
                        color: settings.default_capture_status === s ? 'var(--ink-light)' : 'var(--ink-secondary)',
                        border: '1px solid',
                        borderColor: settings.default_capture_status === s ? 'var(--ink-primary)' : 'rgba(20,28,58,0.12)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '0.62rem',
                        padding: '0.35rem 0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {s === 'inbox' ? 'Inbox' : 'Next Action'}
                    </button>
                  ))}
                </div>
                <FieldHint>Where Quick Capture sends items by default</FieldHint>
              </FieldGroup>
            </div>
          )}

          {/* ── CONTEXTS ──────────────────────────────────────────── */}
          {activeSection === 'contexts' && (
            <div className="fade-in">
              <SectionTitle>Contexts</SectionTitle>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-secondary)', marginBottom: '1.5rem', lineHeight: 1.6, maxWidth: '480px' }}>
                Contexts define where or how an action is done. They appear as tags on your next actions and help you batch similar tasks together.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {settings.contexts.map(ctx => (
                  <div
                    key={ctx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      border: '1px solid rgba(20,28,58,0.1)',
                      padding: '0.25rem 0.6rem 0.25rem 0.7rem',
                      borderRadius: '20px',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: 'var(--ink-primary)', letterSpacing: '0.04em' }}>{ctx}</span>
                    <button
                      onClick={() => removeContext(ctx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(20,28,58,0.3)', fontSize: '0.75rem', lineHeight: 1, padding: '0 0.1rem', transition: 'color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#a83232')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(20,28,58,0.3)')}
                    >×</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-end' }}>
                <div className="form-field" style={{ margin: 0, flex: 1, maxWidth: '220px' }}>
                  <label className="form-label">New Context</label>
                  <input
                    className="form-input"
                    value={newContext}
                    onChange={e => setNewContext(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addContext()}
                    placeholder="@Context"
                  />
                </div>
                <button className="btn-primary" onClick={addContext} style={{ marginBottom: '2px' }}>Add</button>
              </div>
              <FieldHint style={{ marginTop: '0.5rem' }}>Prefix with @ is added automatically if missing</FieldHint>
            </div>
          )}

          {/* ── AI PROVIDERS ──────────────────────────────────────── */}
          {activeSection === 'ai-providers' && (
            <div className="fade-in">
              <SectionTitle>AI Providers</SectionTitle>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-secondary)', marginBottom: '1.5rem', lineHeight: 1.6, maxWidth: '480px' }}>
                Connect any OpenAI-compatible endpoint, Anthropic, or a local Ollama instance. The active provider is used in the AI Assistant view.
              </p>

              {/* Existing providers */}
              {providers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '2rem' }}>
                  {providers.map(p => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.9rem 1.2rem',
                        border: '1px solid',
                        borderColor: p.is_active ? 'rgba(20,28,58,0.2)' : 'rgba(20,28,58,0.07)',
                        background: p.is_active ? 'rgba(20,28,58,0.03)' : 'transparent',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--ink-primary)', fontWeight: 500 }}>{p.name}</span>
                          {p.is_active ? (
                            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--sheet-blue)', border: '1px solid var(--sheet-blue)', padding: '0.1rem 0.4rem', borderRadius: '20px' }}>Active</span>
                          ) : null}
                        </div>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.62rem', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>
                          {p.model} · {p.base_url}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem' }}>
                        {!p.is_active && (
                          <button className="btn-text" onClick={() => setActiveProvider(p.id)}>Set Active</button>
                        )}
                        <button
                          className="btn-text"
                          onClick={() => deleteProvider(p.id)}
                          style={{ color: 'rgba(168,50,50,0.6)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#a83232')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(168,50,50,0.6)')}
                        >Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add provider form */}
              {showProviderForm ? (
                <div style={{ border: '1px solid rgba(20,28,58,0.1)', padding: '1.5rem', background: 'rgba(255,255,255,0.3)' }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-secondary)', marginBottom: '1rem' }}>Quick Setup</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
                    {PROVIDER_PRESETS.map(preset => (
                      <button
                        key={preset.name}
                        className="btn-text"
                        onClick={() => setProviderForm(f => ({ ...f, name: preset.name, provider_type: preset.type, base_url: preset.base_url, model: preset.model }))}
                        style={{ border: '1px solid rgba(20,28,58,0.1)', padding: '0.25rem 0.7rem', color: providerForm.name === preset.name ? 'var(--ink-primary)' : 'var(--ink-secondary)', borderColor: providerForm.name === preset.name ? 'rgba(20,28,58,0.3)' : 'rgba(20,28,58,0.1)' }}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-field">
                      <label className="form-label">Name</label>
                      <input className="form-input" value={providerForm.name || ''} onChange={e => setProviderForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Model</label>
                      <input className="form-input" value={providerForm.model || ''} onChange={e => setProviderForm(f => ({ ...f, model: e.target.value }))} placeholder="gpt-4o / llama3" />
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="form-label">Base URL</label>
                    <input className="form-input" value={providerForm.base_url || ''} onChange={e => setProviderForm(f => ({ ...f, base_url: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label className="form-label">API Key <span style={{ opacity: 0.5 }}>(leave empty for local providers)</span></label>
                    <input className="form-input" type="password" value={providerForm.api_key || ''} onChange={e => setProviderForm(f => ({ ...f, api_key: e.target.value }))} placeholder="sk-..." />
                  </div>

                  <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(20,28,58,0.06)' }}>
                    <button className="btn-primary" onClick={handleSaveProvider}>Save & Activate</button>
                    <button className="btn-text" onClick={() => setShowProviderForm(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn-primary" onClick={() => setShowProviderForm(true)}>+ Add Provider</button>
              )}
            </div>
          )}

          {/* ── DATA ──────────────────────────────────────────────── */}
          {activeSection === 'data' && (
            <div className="fade-in">
              <SectionTitle>Data</SectionTitle>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '2rem' }}>
                {[
                  { label: 'Next Actions', value: stats.nextActions ?? '—' },
                  { label: 'Total Tasks',  value: stats.tasks ?? '—' },
                  { label: 'Projects',     value: stats.projects ?? '—' },
                  { label: 'Waiting For',  value: stats.waitingItems ?? '—' },
                  { label: 'Someday Items',value: stats.somedayItems ?? '—' },
                  { label: 'Completed',    value: stats.doneTasks ?? '—' },
                  { label: 'Conversations',value: stats.conversations ?? '—' },
                  { label: 'Chat Messages',value: stats.messages ?? '—' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '0.8rem', border: '1px solid rgba(20,28,58,0.07)', background: 'rgba(255,255,255,0.2)' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--ink-primary)', lineHeight: 1 }}>{item.value}</div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-secondary)', marginTop: '0.3rem' }}>{item.label}</div>
                  </div>
                ))}
              </div>

              <Divider />

              {/* Export */}
              <FieldGroup label="Export Data">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button className="btn-primary" onClick={handleExport}>Export as JSON</button>
                  {exportStatus === 'ok' && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: '#4a7c59' }}>✓ Exported successfully</span>}
                  {exportStatus === 'err' && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: '#a83232' }}>Export failed</span>}
                </div>
                <FieldHint>Exports all tasks, projects, waiting items and someday items as JSON</FieldHint>
              </FieldGroup>

              <Divider />

              {/* Cleanup */}
              <FieldGroup label="Clean Up">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleClearCompleted}
                    style={{ background: 'none', border: '1px solid rgba(168,50,50,0.3)', fontFamily: 'var(--font-sans)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(168,50,50,0.7)', cursor: 'pointer', padding: '0.4rem 0.9rem', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,50,50,0.06)'; e.currentTarget.style.color = '#a83232' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(168,50,50,0.7)' }}
                  >
                    Purge Completed Tasks
                  </button>
                  <button
                    onClick={handleClearChat}
                    style={{ background: 'none', border: '1px solid rgba(168,50,50,0.3)', fontFamily: 'var(--font-sans)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(168,50,50,0.7)', cursor: 'pointer', padding: '0.4rem 0.9rem', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,50,50,0.06)'; e.currentTarget.style.color = '#a83232' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(168,50,50,0.7)' }}
                  >
                    Clear Chat History
                  </button>
                  {clearStatus === 'ok' && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: '#4a7c59' }}>✓ Done</span>}
                </div>
                <FieldHint>These actions are permanent and cannot be undone</FieldHint>
              </FieldGroup>

              <Divider />

              {/* DB Path */}
              <FieldGroup label="Database Location">
                <div style={{
                  fontFamily: 'var(--font-sans)', fontSize: '0.68rem', color: 'var(--ink-secondary)',
                  background: 'rgba(20,28,58,0.03)', border: '1px solid rgba(20,28,58,0.07)',
                  padding: '0.6rem 0.9rem', wordBreak: 'break-all', lineHeight: 1.5,
                  maxWidth: '100%',
                }}>
                  {dbPath || 'Loading…'}
                </div>
                <FieldHint>Your data is stored locally. Back up this file to preserve your data.</FieldHint>
              </FieldGroup>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Small helper components ──────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--ink-primary)', letterSpacing: '-0.02em', marginBottom: '1.8rem', lineHeight: 1 }}>
      {children}
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-primary)', fontWeight: 600, marginBottom: '0.7rem' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function FieldHint({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.62rem', color: 'rgba(20,28,58,0.35)', marginTop: '0.4rem', lineHeight: 1.5, ...style }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid rgba(20,28,58,0.07)', margin: '1.8rem 0' }} />
}
