import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useParallax } from '../hooks/useParallax'
import { useT } from '../i18n/useT'
import type { SomedayItem } from '../types'

type Horizon = SomedayItem['horizon']

export default function Someday() {
  const { somedayItems, addSomeday, removeSomeday } = useStore()
  const mouse = useParallax()
  const t = useT()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [horizon, setHorizon] = useState<Horizon>('someday')
  const [notes, setNotes] = useState('')

  const HORIZONS: { id: Horizon; label: string; description: string }[] = [
    { id: 'soon',     label: t.some_soon,    description: t.some_desc_soon },
    { id: '1month',   label: t.some_1month,  description: t.some_desc_1month },
    { id: '3months',  label: t.some_3months, description: t.some_desc_3months },
    { id: '1year',    label: t.some_1year,   description: t.some_desc_1year },
    { id: 'someday',  label: t.some_someday, description: t.some_desc_someday },
  ]

  const handleAdd = async () => {
    if (!title.trim()) return
    await addSomeday({ title: title.trim(), horizon, notes: notes || undefined })
    setTitle(''); setNotes(''); setHorizon('someday'); setShowForm(false)
  }

  const grouped = HORIZONS.reduce<Record<Horizon, typeof somedayItems>>((acc, h) => {
    acc[h.id] = somedayItems.filter(i => i.horizon === h.id)
    return acc
  }, {} as Record<Horizon, typeof somedayItems>)

  return (
    <div className="composition">
      <main className="sheet-main" style={{ transform: `translate(${mouse.x * 5}px, ${mouse.y * 5}px)` }}>
        <div className="list-container" style={{ marginTop: '42vh', overflowY: 'auto' }}>
          {HORIZONS.map(h => {
            const items = grouped[h.id]
            if (items.length === 0) return null
            return (
              <div key={h.id} className="horizon-section fade-in">
                <div className="horizon-label">{h.label} — {items.length}</div>
                {items.map((item, i) => (
                  <div key={item.id} className="someday-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid rgba(20,28,58,0.04)', animationDelay: `${i * 0.04}s` }}>
                    <div>
                      <div className="task-title" style={{ fontSize: '1.2rem' }}>{item.title}</div>
                      {item.notes && <div className="task-meta" style={{ marginTop: '0.2rem' }}>{item.notes}</div>}
                    </div>
                    <button className="delete-btn" onClick={() => removeSomeday(item.id)} style={{ opacity: 0, transition: 'opacity 0.2s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>×</button>
                  </div>
                ))}
              </div>
            )
          })}
          {somedayItems.length === 0 && (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--ink-secondary)', fontStyle: 'italic', paddingTop: '1.5rem' }}>{t.some_empty}</div>
          )}
        </div>

        <footer className="sheet-footer">
          <div className="footer-logo">{t.some_footerLogo}</div>
          <div className="footer-block">
            <div className="footer-title">{t.some_footerHorizons}</div>
            <div className="footer-text">{t.some_ideasCaptured(somedayItems.length)}</div>
          </div>
          <div className="footer-block">
            <button className="btn-text" onClick={() => setShowForm(true)} style={{ paddingLeft: 0 }}>{t.some_addIdea}</button>
          </div>
        </footer>
      </main>

      <div className="sheet-blue" style={{ transform: `translate(${mouse.x * -10}px, ${mouse.y * -10}px)` }}>
        <div style={{ position: 'relative', zIndex: 3, width: '100%', height: '100%', backgroundImage: `url('https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2070&auto=format&fit=crop')`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5, mixBlendMode: 'multiply' as const, filter: 'grayscale(100%) contrast(1.1)' }} />
        <div style={{ position: 'absolute', bottom: '1.5rem', left: '2rem', zIndex: 4 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'rgba(244,243,239,0.6)', fontStyle: 'italic', lineHeight: 1.2, whiteSpace: 'pre-line' }}>{t.some_quote}</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(244,243,239,0.3)', marginTop: '0.5rem' }}>{t.some_quoteAttr}</div>
        </div>
      </div>

      <div className="sheet-white" style={{ transform: `rotate(-1.8deg) translate(${mouse.x * 15}px, ${mouse.y * 15}px)` }}>
        <svg className="paperclip" viewBox="0 0 32 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 94C10.4772 94 6 89.5228 6 84V26C6 18.268 12.268 12 20 12C27.732 12 34 18.268 34 26V78C34 81.3137 31.3137 84 28 84C24.6863 84 22 81.3137 22 78V30C22 28.8954 21.1046 28 20 28C18.8954 28 18 28.8954 18 30V78C18 83.5228 22.4772 88 28 88C33.5228 88 38 83.5228 38 78V26C38 16.0589 29.9411 8 20 8C10.0589 8 2 16.0589 2 26V84C2 91.732 8.268 98 16 98C23.732 98 30 91.732 30 84V30" stroke="#1A1C20" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <div className="capture-header"><span>{t.some_cardTitle}</span><span>{t.some_cardSub}</span></div>

        {showForm ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', flex: 1 }}>
            <textarea className="capture-input" placeholder={t.some_placeholder} value={title} onChange={e => setTitle(e.target.value)} style={{ fontSize: '1.2rem', marginTop: 0, flex: '0 0 70px', resize: 'none', WebkitAppRegion: 'no-drag' } as React.CSSProperties} autoFocus />
            <select value={horizon} onChange={e => setHorizon(e.target.value as Horizon)} className="form-select" style={{ marginBottom: '0.3rem' }}>
              {HORIZONS.map(h => <option key={h.id} value={h.id}>{h.label} — {h.description}</option>)}
            </select>
            <div className="capture-actions" style={{ marginTop: 'auto' }}>
              <button className="btn-text" onClick={handleAdd}>{t.capture}</button>
              <button className="btn-text" style={{ marginLeft: 'auto' }} onClick={() => setShowForm(false)}>{t.cancel}</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div>
                {HORIZONS.map(h => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-secondary)' }}>{h.label}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: grouped[h.id].length > 0 ? 'var(--ink-primary)' : 'rgba(20,28,58,0.15)' }}>{grouped[h.id].length}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="capture-actions">
              <button className="btn-text" onClick={() => setShowForm(true)}>{t.some_newIdea}</button>
            </div>
          </>
        )}
        <div className="emboss-text">{t.some_emboss}</div>
      </div>
    </div>
  )
}