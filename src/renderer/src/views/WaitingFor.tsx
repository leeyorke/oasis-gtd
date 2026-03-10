import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useParallax } from '../hooks/useParallax'
import { useT } from '../i18n/useT'

export default function WaitingFor() {
  const { waitingItems, addWaiting, removeWaiting, projects } = useStore()
  const mouse = useParallax()
  const t = useT()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', waiting_for: '', since: new Date().toISOString().split('T')[0], project_id: '', notes: '' })

  const handleAdd = async () => {
    if (!form.title.trim() || !form.waiting_for.trim()) return
    await addWaiting({ title: form.title.trim(), waiting_for: form.waiting_for.trim(), since: form.since, project_id: form.project_id || undefined, notes: form.notes || undefined })
    setForm({ title: '', waiting_for: '', since: new Date().toISOString().split('T')[0], project_id: '', notes: '' })
    setShowForm(false)
  }

  const formatSince = (date: string) => {
    const d = new Date(date)
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return t.today
    if (diff === 1) return t.yesterday
    if (diff < 7) return t.days_ago(diff)
    if (diff < 30) return t.weeks_ago(Math.floor(diff / 7))
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const activeProjects = projects.filter(p => p.status === 'active')

  return (
    <div className="composition">
      <main className="sheet-main" style={{ transform: `translate(${mouse.x * 5}px, ${mouse.y * 5}px)` }}>
        <div className="list-container" style={{ marginTop: '44vh' }}>
          <div className="list-header" style={{ gridTemplateColumns: '2fr 1fr 0.6fr auto' }}>
            <div>{t.wait_colWaiting}</div>
            <div>{t.wait_colDelegate}</div>
            <div>{t.wait_colSince}</div>
            <div></div>
          </div>

          <div className="task-list">
            {waitingItems.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--ink-secondary)', fontStyle: 'italic', paddingTop: '1.5rem' }}>{t.wait_empty}</div>
            ) : (
              waitingItems.map((item, i) => (
                <div key={item.id} className="waiting-row fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="task-title">{item.title}</div>
                  <div className="task-meta">{item.waiting_for}</div>
                  <div className="task-meta">{formatSince(item.since)}</div>
                  <button className="btn-text" onClick={() => removeWaiting(item.id)} title="Resolve" style={{ fontSize: '0.7rem' }}>✓</button>
                </div>
              ))
            )}
          </div>
        </div>

        <footer className="sheet-footer">
          <div className="footer-logo">{t.wait_footerLogo}</div>
          <div className="footer-block">
            <div className="footer-title">{t.wait_footerPending}</div>
            <div className="footer-text">{t.wait_items(waitingItems.length)}</div>
          </div>
          <div className="footer-block">
            <button className="btn-text" onClick={() => setShowForm(true)} style={{ paddingLeft: 0 }}>{t.wait_addItem}</button>
          </div>
        </footer>
      </main>

      <div className="sheet-blue" style={{ transform: `translate(${mouse.x * -10}px, ${mouse.y * -10}px)` }}>
        <div style={{ position: 'relative', zIndex: 3, padding: '2rem', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(244,243,239,0.5)' }}>{t.wait_summaryTitle}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1, justifyContent: 'center' }}>
            {waitingItems.slice(0, 4).map(item => {
              const days = Math.floor((Date.now() - new Date(item.since).getTime()) / (1000 * 60 * 60 * 24))
              const urgency = days > 14 ? 'rgba(244,243,239,0.8)' : days > 7 ? 'rgba(244,243,239,0.55)' : 'rgba(244,243,239,0.3)'
              return (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.68rem', color: urgency, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{item.title}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: urgency }}>{days}d</div>
                </div>
              )
            })}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(244,243,239,0.3)' }}>{t.wait_tracked(waitingItems.length)}</div>
        </div>
      </div>

      <div className="sheet-white" style={{ transform: `rotate(-2.5deg) translate(${mouse.x * 15}px, ${mouse.y * 15}px)` }}>
        <svg className="paperclip" viewBox="0 0 32 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 94C10.4772 94 6 89.5228 6 84V26C6 18.268 12.268 12 20 12C27.732 12 34 18.268 34 26V78C34 81.3137 31.3137 84 28 84C24.6863 84 22 81.3137 22 78V30C22 28.8954 21.1046 28 20 28C18.8954 28 18 28.8954 18 30V78C18 83.5228 22.4772 88 28 88C33.5228 88 38 83.5228 38 78V26C38 16.0589 29.9411 8 20 8C10.0589 8 2 16.0589 2 26V84C2 91.732 8.268 98 16 98C23.732 98 30 91.732 30 84V30" stroke="#1A1C20" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <div className="capture-header"><span>{t.wait_cardTitle}</span><span>{t.wait_cardSub}</span></div>

        {showForm ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <textarea className="capture-input" placeholder={t.wait_whatPlaceholder} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ fontSize: '1.2rem', marginTop: 0, flex: '0 0 60px', resize: 'none' }} />
            <input placeholder={t.wait_whoPlaceholder} value={form.waiting_for} onChange={e => setForm(f => ({ ...f, waiting_for: e.target.value }))} style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(20,28,58,0.1)', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--ink-secondary)', padding: '0.3rem 0', width: '100%' }} />
            <input type="date" value={form.since} onChange={e => setForm(f => ({ ...f, since: e.target.value }))} style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(20,28,58,0.1)', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--ink-secondary)', padding: '0.3rem 0', width: '100%' }} />
            <div className="capture-actions" style={{ marginTop: 'auto' }}>
              <button className="btn-text" onClick={handleAdd}>{t.add}</button>
              <button className="btn-text" style={{ marginLeft: 'auto' }} onClick={() => setShowForm(false)}>{t.cancel}</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', color: 'rgba(20,28,58,0.08)', lineHeight: 1 }}>{waitingItems.length}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-secondary)' }}>{t.wait_pending}</div>
              </div>
            </div>
            <div className="capture-actions">
              <button className="btn-text" onClick={() => setShowForm(true)}>{t.wait_trackItem}</button>
            </div>
          </>
        )}
        <div className="emboss-text">{t.wait_emboss}</div>
      </div>
    </div>
  )
}