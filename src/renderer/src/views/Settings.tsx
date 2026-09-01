import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import type { AIProvider } from '../types'
import { useT } from '../i18n/useT'
import { Check, Pencil, Trash2 } from 'lucide-react'

type Section = 'general' | 'contexts' | 'ai-providers' | 'shortcuts' | 'data'

const PROVIDER_PRESETS = [
  { name: 'OpenAI',                  type: 'openai' as const,    base_url: 'https://api.openai.com',   model: 'gpt-4o' },
  { name: 'Anthropic',               type: 'anthropic' as const, base_url: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
  { name: 'Ollama (Local)',           type: 'ollama' as const,    base_url: 'http://localhost:11434',   model: 'llama3' },
  { name: 'LM Studio',               type: 'custom' as const,    base_url: 'http://localhost:1234',    model: 'local-model' },
  { name: 'Custom OpenAI-Compatible', type: 'custom' as const,   base_url: '',                         model: '' },
]

export default function Settings() {
  const { settings, updateSetting, providers, saveProvider, setActiveProvider, deleteProvider, loadProviders, goBack } = useStore()
  const t = useT()
  const [activeSection, setActiveSection] = useState<Section>('general')

  const SECTIONS: { id: Section; label: string; description: string }[] = [
    { id: 'general',      label: t.settings_general,      description: t.settings_generalDesc },
    { id: 'contexts',     label: t.settings_contexts,     description: t.settings_contextsDesc },
    { id: 'ai-providers', label: t.settings_aiProviders,  description: t.settings_aiProvidersDesc },
    { id: 'shortcuts',    label: t.settings_shortcuts,    description: t.settings_shortcutsDesc },
    { id: 'data',         label: t.settings_data,         description: t.settings_dataDesc },
  ]

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
  const EMPTY_PROVIDER_FORM: Partial<AIProvider & { provider_type: string }> = {
    name: 'Custom OpenAI-Compatible', provider_type: 'custom', base_url: '', model: '', api_key: '', system_prompt: '', temperature: 0.7, max_tokens: 2048, is_active: 1,
  }
  const [providerForm, setProviderForm] = useState<Partial<AIProvider & { provider_type: string }>>(EMPTY_PROVIDER_FORM)
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [modelTags, setModelTags] = useState<string[]>([])
  const [modelInput, setModelInput] = useState('')

  const parseModelList = (model: string): string[] => {
    try {
      const parsed = JSON.parse(model)
      return Array.isArray(parsed) ? parsed : [model]
    } catch {
      return model ? [model] : []
    }
  }

  const handleSaveProvider = async () => {
    const modelsJson = JSON.stringify(modelTags.filter(Boolean))
    if (!providerForm.name || !providerForm.base_url || modelTags.length === 0) return
    await saveProvider({
      id: editingProviderId || undefined,
      name: providerForm.name!,
      provider_type: (providerForm.provider_type as AIProvider['provider_type']) || 'custom',
      base_url: providerForm.base_url!,
      model: modelsJson,
      api_key: providerForm.api_key || undefined,
      system_prompt: providerForm.system_prompt || '',
      temperature: providerForm.temperature ?? 0.7,
      max_tokens: providerForm.max_tokens ?? 2048,
      is_active: editingProviderId ? (providerForm.is_active ?? 0) : 0,
    })
    setShowProviderForm(false)
    setEditingProviderId(null)
    setShowApiKey(false)
    setProviderForm(EMPTY_PROVIDER_FORM)
    setModelTags([])
    setModelInput('')
    await loadProviders()
  }

  const handleEditProvider = (p: AIProvider) => {
    setProviderForm({ id: p.id, name: p.name, provider_type: p.provider_type, base_url: p.base_url, model: p.model, api_key: p.api_key || '', system_prompt: p.system_prompt || '', temperature: p.temperature ?? 0.7, max_tokens: p.max_tokens ?? 2048, is_active: p.is_active })
    setModelTags(parseModelList(p.model))
    setModelInput('')
    setEditingProviderId(p.id)
    setShowApiKey(false)
    setShowProviderForm(true)
  }

  const addModelTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !modelTags.includes(trimmed)) {
      setModelTags(prev => [...prev, trimmed])
    }
    setModelInput('')
  }

  const removeModelTag = (tag: string) => {
    setModelTags(prev => prev.filter(t => t !== tag))
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
      <div className="review-full-sheet fade-in" style={{ flexDirection: 'row', padding: 0, gap: 0, position: 'relative' }}>

        {/* ─── Close button top-right ───────────────────────────── */}
        <button
          onClick={() => { console.log('Settings close button clicked'); goBack(); }}
          title="Close"
          style={{
            position: 'absolute', top: '1.2rem', right: '1.2rem', zIndex: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(20,28,58,0.25)', fontSize: '1rem', lineHeight: 1,
            padding: '0.3rem 0.4rem',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(20,28,58,0.25)')}
        >✕</button>

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
            {t.settings_title}
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
        <div style={{ flex: 1, padding: '3rem', overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* ── GENERAL ───────────────────────────────────────────── */}
          {activeSection === 'general' && (
            <div className="fade-in">
              <SectionTitle>{t.settings_general}</SectionTitle>

              <FieldGroup label={t.settings_appName}>
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

              <FieldGroup label={t.settings_reviewDay}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {t.weekdays.map((day, idx) => (
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
                      {day.slice(0, 2)}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <Divider />

              <FieldGroup label={t.settings_captureStatus}>
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
                      {s === 'inbox' ? t.capture_inbox : t.modal_statusNext}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <Divider />

              <FieldGroup label={t.settings_autoLaunch}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[true, false].map(val => (
                    <button
                      key={String(val)}
                      onClick={() => updateSetting('auto_launch', val)}
                      style={{
                        background: settings.auto_launch === val ? 'var(--ink-primary)' : 'transparent',
                        color: settings.auto_launch === val ? 'var(--ink-light)' : 'var(--ink-secondary)',
                        border: '1px solid',
                        borderColor: settings.auto_launch === val ? 'var(--ink-primary)' : 'rgba(20,28,58,0.12)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '0.62rem',
                        padding: '0.35rem 0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {val ? t.on : t.off}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <Divider />

              <FieldGroup label={t.settings_language}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['en', 'zh'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => updateSetting('language', lang)}
                      style={{
                        background: settings.language === lang ? 'var(--ink-primary)' : 'transparent',
                        color: settings.language === lang ? 'var(--ink-light)' : 'var(--ink-secondary)',
                        border: '1px solid',
                        borderColor: settings.language === lang ? 'var(--ink-primary)' : 'rgba(20,28,58,0.12)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '0.62rem',
                        padding: '0.35rem 0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {lang === 'en' ? t.settings_langEn : t.settings_langZh}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <Divider />

              <FieldGroup label={t.settings_proxy}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder={t.settings_proxyHostPlaceholder}
                    value={settings.proxy_host || ''}
                    onChange={e => updateSetting('proxy_host', e.target.value)}
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.75rem',
                      padding: '0.4rem 0.75rem',
                      border: '1px solid rgba(20,28,58,0.12)',
                      borderRadius: '0px',
                      width: '200px',
                      background: 'transparent',
                      color: 'var(--ink-primary)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ color: 'var(--ink-secondary)', fontSize: '0.75rem' }}>:</span>
                  <input
                    type="number"
                    placeholder={t.settings_proxyPortPlaceholder}
                    value={settings.proxy_port || ''}
                    onChange={e => updateSetting('proxy_port', Number(e.target.value) || 0)}
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.75rem',
                      padding: '0.4rem 0.75rem',
                      border: '1px solid rgba(20,28,58,0.12)',
                      borderRadius: '0px',
                      width: '100px',
                      background: 'transparent',
                      color: 'var(--ink-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.62rem', color: 'var(--ink-secondary)', letterSpacing: '0.04em' }}>
                  {t.settings_proxyHint}
                </div>
              </FieldGroup>
            </div>
          )}
          {activeSection === 'contexts' && (
            <div className="fade-in">
              <SectionTitle>{t.settings_contextsTitle}</SectionTitle>
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
                  <label className="form-label">{t.settings_newContext}</label>
                  <input
                    className="form-input"
                    value={newContext}
                    onChange={e => setNewContext(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addContext()}
                    placeholder="@Context"
                  />
                </div>
                <button className="btn-primary" onClick={addContext} style={{ marginBottom: '2px' }}>{t.settings_addContext}</button>
              </div>
              <FieldHint style={{ marginTop: '0.5rem' }}>{t.settings_ctxHint}</FieldHint>
            </div>
          )}

          {/* ── AI PROVIDERS ──────────────────────────────────────── */}
          {activeSection === 'ai-providers' && (
            <div className="fade-in">
              <SectionTitle>{t.settings_aiProviders}</SectionTitle>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-secondary)', marginBottom: '1.5rem', lineHeight: 1.6, maxWidth: '480px' }}>
                {t.settings_aiDesc}
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
                        borderColor: editingProviderId === p.id ? 'rgba(20,28,58,0.25)' : p.is_active ? 'rgba(20,28,58,0.2)' : 'rgba(20,28,58,0.07)',
                        background: editingProviderId === p.id ? 'rgba(20,28,58,0.05)' : p.is_active ? 'rgba(20,28,58,0.03)' : 'transparent',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--ink-primary)', fontWeight: 500 }}>{p.name}</span>
                          {p.is_active ? (
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                          ) : null}
                        </div>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.62rem', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>
                          {p.model} · {p.base_url}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {!p.is_active && (
                          <button
                            className="action-btn"
                            onClick={() => setActiveProvider(p.id)}
                            title={t.settings_setActive}
                          >
                            <Check size={14} />
                          </button>
                        )}
                        <button
                          className="action-btn"
                          onClick={() => editingProviderId === p.id ? (setEditingProviderId(null), setShowProviderForm(false), setModelTags([]), setModelInput('')) : handleEditProvider(p)}
                          title={editingProviderId === p.id ? t.settings_cancel : t.edit}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="action-btn"
                          onClick={() => deleteProvider(p.id)}
                          title={t.settings_remove}
                          style={{ color: 'rgba(168,50,50,0.6)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#a83232')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(168,50,50,0.6)')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add / Edit provider form */}
              {showProviderForm ? (
                <div style={{ border: '1px solid rgba(20,28,58,0.1)', padding: '1.5rem', background: 'rgba(255,255,255,0.3)' }}>
                  {/* Quick Setup presets — only for new providers */}
                  {!editingProviderId && (
                    <>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-secondary)', marginBottom: '0.8rem' }}>{t.settings_quickSetup}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
                        {PROVIDER_PRESETS.map(preset => (
                          <button
                            key={preset.name}
                            className="btn-text"
                            onClick={() => { setProviderForm(f => ({ ...f, name: preset.name, provider_type: preset.type, base_url: preset.base_url, model: preset.model })); setModelTags(preset.model ? [preset.model] : []); setModelInput('') }}
                            style={{ border: '1px solid rgba(20,28,58,0.1)', padding: '0.25rem 0.7rem', color: providerForm.name === preset.name ? 'var(--ink-primary)' : 'var(--ink-secondary)', borderColor: providerForm.name === preset.name ? 'rgba(20,28,58,0.3)' : 'rgba(20,28,58,0.1)', background: providerForm.name === preset.name ? 'rgba(20,28,58,0.04)' : 'transparent' }}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-field">
                      <label className="form-label">{t.settings_name}</label>
                      <input className="form-input" value={providerForm.name || ''} onChange={e => setProviderForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-field">
                      <label className="form-label">{t.settings_model}</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', padding: '0.3rem', border: '1px solid rgba(20,28,58,0.15)', borderRadius: '6px', minHeight: '2rem', alignItems: 'center' }}>
                        {modelTags.map(tag => (
                          <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(20,28,58,0.06)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                            {tag}
                            <button type="button" onClick={() => removeModelTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'rgba(20,28,58,0.4)', fontSize: '0.8rem', lineHeight: 1 }}>&times;</button>
                          </span>
                        ))}
                        <input
                          style={{ border: 'none', outline: 'none', flex: 1, minWidth: '80px', fontSize: '0.75rem', padding: '0.2rem', background: 'transparent' }}
                          value={modelInput}
                          onChange={e => setModelInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModelTag(modelInput) } }}
                          placeholder={modelTags.length === 0 ? 'gpt-4o' : t.settings_addModel || '+ add model'}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="form-label">{t.settings_baseUrl}</label>
                    <input className="form-input" value={providerForm.base_url || ''} onChange={e => setProviderForm(f => ({ ...f, base_url: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label className="form-label">{t.settings_apiKey} <span style={{ opacity: 0.5 }}>{t.settings_apiKeyHint}</span></label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        className="form-input"
                        type={showApiKey ? 'text' : 'password'}
                        value={providerForm.api_key || ''}
                        onChange={e => setProviderForm(f => ({ ...f, api_key: e.target.value }))}
                        placeholder="sk-..."
                        style={{ paddingRight: '2.5rem', flex: 1 }}
                      />
                      <button
                        onClick={() => setShowApiKey(v => !v)}
                        style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(20,28,58,0.35)', fontSize: '0.7rem', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em', padding: '0.2rem 0.3rem', transition: 'color 0.2s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(20,28,58,0.35)')}
                      >
                        {showApiKey ? t.hide : t.show}
                      </button>
                    </div>
                  </div>

                  <div className="form-field">
                    <label className="form-label">{t.settings_systemPrompt}</label>
                    <textarea
                      className="form-input"
                      value={providerForm.system_prompt || ''}
                      onChange={e => setProviderForm(f => ({ ...f, system_prompt: e.target.value }))}
                      placeholder={t.settings_systemPromptHint}
                      rows={3}
                      style={{ resize: 'none', minHeight: '60px', overflowY: 'auto' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-field">
                      <label className="form-label">{t.settings_temperature}</label>
                      <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={providerForm.temperature ?? 0.7}
                        onChange={e => setProviderForm(f => ({ ...f, temperature: parseFloat(e.target.value) || 0.7 }))}
                      />
                      <FieldHint>{t.settings_temperatureHint}</FieldHint>
                    </div>
                    <div className="form-field">
                      <label className="form-label">{t.settings_maxTokens}</label>
                      <input
                        className="form-input"
                        type="number"
                        min="1"
                        max="32000"
                        value={providerForm.max_tokens ?? 2048}
                        onChange={e => setProviderForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 2048 }))}
                      />
                      <FieldHint>{t.settings_maxTokensHint}</FieldHint>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(20,28,58,0.06)' }}>
                    <button className="btn-primary" onClick={handleSaveProvider}>
                      {editingProviderId ? t.settings_update : t.chat_saveActivate}
                    </button>
                    <button className="btn-text" onClick={() => { setShowProviderForm(false); setEditingProviderId(null); setShowApiKey(false); setModelTags([]); setModelInput('') }}>{t.settings_cancel}</button>
                  </div>
                </div>
              ) : (
                <button className="btn-primary" onClick={() => { setProviderForm(EMPTY_PROVIDER_FORM); setShowProviderForm(true) }}>{t.settings_addProvider}</button>
              )}
            </div>
          )}

          {/* ── SHORTCUTS ───────────────────────────────────────────── */}
          {activeSection === 'shortcuts' && <ShortcutsSection />}

          {/* ── DATA ──────────────────────────────────────────────── */}
          {activeSection === 'data' && (
            <div className="fade-in">
              <SectionTitle>{t.settings_data}</SectionTitle>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '2rem' }}>
                {[
                  { label: t.settings_stat_next, value: stats.nextActions ?? '—' },
                  { label: t.settings_stat_tasks,  value: stats.tasks ?? '—' },
                  { label: t.settings_stat_projects,     value: stats.projects ?? '—' },
                  { label: t.settings_stat_waiting,  value: stats.waitingItems ?? '—' },
                  { label: t.settings_stat_someday,value: stats.somedayItems ?? '—' },
                  { label: t.settings_stat_done,    value: stats.doneTasks ?? '—' },
                  { label: t.settings_stat_convs,value: stats.conversations ?? '—' },
                  { label: t.settings_stat_messages,value: stats.messages ?? '—' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '0.8rem', border: '1px solid rgba(20,28,58,0.07)', background: 'rgba(255,255,255,0.2)' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--ink-primary)', lineHeight: 1 }}>{item.value}</div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-secondary)', marginTop: '0.3rem' }}>{item.label}</div>
                  </div>
                ))}
              </div>

              <Divider />

              {/* Export */}
              <FieldGroup label={t.settings_exportJSON}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button className="btn-primary" onClick={handleExport}>{t.settings_exportJSON}</button>
                  {exportStatus === 'ok' && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: '#4a7c59' }}>✓ {t.settings_exportOk}</span>}
                  {exportStatus === 'err' && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: '#a83232' }}>{t.settings_exportErr}</span>}
                </div>
                <FieldHint>Exports all tasks, projects, waiting items and someday items as JSON</FieldHint>
              </FieldGroup>

              <Divider />

              {/* Cleanup */}
              <FieldGroup label={t.settings_purgeCompleted}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleClearCompleted}
                    style={{ background: 'none', border: '1px solid rgba(168,50,50,0.3)', fontFamily: 'var(--font-sans)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(168,50,50,0.7)', cursor: 'pointer', padding: '0.4rem 0.9rem', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,50,50,0.06)'; e.currentTarget.style.color = '#a83232' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(168,50,50,0.7)' }}
                  >
                    {t.settings_purgeCompleted}
                  </button>
                  <button
                    onClick={handleClearChat}
                    style={{ background: 'none', border: '1px solid rgba(168,50,50,0.3)', fontFamily: 'var(--font-sans)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(168,50,50,0.7)', cursor: 'pointer', padding: '0.4rem 0.9rem', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,50,50,0.06)'; e.currentTarget.style.color = '#a83232' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(168,50,50,0.7)' }}
                  >
                    {t.settings_clearChat}
                  </button>
                  {clearStatus === 'ok' && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: '#4a7c59' }}>✓ {t.settings_purgeOk}</span>}
                </div>
                <FieldHint>{t.settings_cleanupHint}</FieldHint>
              </FieldGroup>

              <Divider />

              {/* DB Path */}
              <FieldGroup label={t.settings_dbPath}>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontSize: '0.68rem', color: 'var(--ink-secondary)',
                  background: 'rgba(20,28,58,0.03)', border: '1px solid rgba(20,28,58,0.07)',
                  padding: '0.6rem 0.9rem', wordBreak: 'break-all', lineHeight: 1.5,
                  maxWidth: '100%',
                }}>
                  {dbPath || 'Loading…'}
                </div>
                <FieldHint>{t.settings_dbPathHint}</FieldHint>
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

// ─── Shortcuts Section ─────────────────────────────────────────────────────

function normalizeKey(event: KeyboardEvent): string {
  const mods: string[] = []
  if (event.ctrlKey) mods.push('Ctrl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  if (event.metaKey) mods.push('Cmd')
  const rawKey = event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(rawKey)) return ''
  const key = rawKey === '\\' ? '\\' : rawKey.length === 1 ? rawKey.toUpperCase() : rawKey
  return [...mods, key].join('+')
}

const SHORTCUT_DEFS: { id: string; labelKey: string }[] = [
  { id: 'toggleSidebar', labelKey: 'shortcuts_toggleSidebar' },
  { id: 'newThought',    labelKey: 'shortcuts_newThought' },
]

function ShortcutsSection() {
  const { settings, updateSetting } = useStore()
  const t = useT()
  const [recording, setRecording] = useState<string | null>(null)

  // Capture key combo when recording
  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const combo = normalizeKey(e)
      if (!combo) return
      const updated = { ...settings.shortcuts, [recording]: combo }
      updateSetting('shortcuts', updated)
      setRecording(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording, settings.shortcuts, updateSetting])

  return (
    <div className="fade-in">
      <SectionTitle>{t.settings_shortcuts}</SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {SHORTCUT_DEFS.map(def => {
          const combo = settings.shortcuts[def.id] || ''
          const isRecording = recording === def.id
          return (
            <button
              key={def.id}
              onClick={() => setRecording(isRecording ? null : def.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.7rem 0.9rem',
                border: `1px solid ${isRecording ? 'var(--ink-primary)' : 'rgba(20,28,58,0.07)'}`,
                background: isRecording ? 'rgba(20,28,58,0.04)' : 'rgba(255,255,255,0.2)',
                borderRadius: 0,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink-primary)' }}>
                {(t as any)[def.labelKey] || def.labelKey}
              </span>
              <kbd style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.62rem',
                padding: '0.25rem 0.6rem',
                background: isRecording ? 'var(--ink-primary)' : 'var(--border)',
                color: isRecording ? 'var(--ink-light)' : 'var(--ink-primary)',
                borderRadius: '4px',
                letterSpacing: '0.04em',
                minWidth: '80px',
                textAlign: 'center',
              }}>
                {isRecording ? '...' : combo}
              </kbd>
            </button>
          )
        })}
      </div>
    </div>
  )
}