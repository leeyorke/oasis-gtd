import { useStore } from '../store/useStore'

const CATEGORY_COLORS: Record<string, string> = {
  Collect: '#8B6F47',
  Process: '#6A809C',
  Review: '#141C3A',
  Reflect: '#7A8560',
  Create: '#9C6A6A',
}

export default function WeeklyReview() {
  const { reviewItems, toggleReviewItem, resetReview } = useStore()

  const total = reviewItems.length
  const completed = reviewItems.filter(r => r.completed).length
  const progress = total > 0 ? (completed / total) * 100 : 0

  const grouped = reviewItems.reduce<Record<string, typeof reviewItems>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const categories = Object.keys(grouped)

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="composition" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="review-full-sheet fade-in">
        {/* Header */}
        <div className="review-header">
          <div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--ink-secondary)', marginBottom: '0.5rem' }}>
              Weekly Review
            </div>
            <div className="review-title">
              Clear<br />the<br />Decks
            </div>
          </div>

          <div className="review-progress">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--ink-primary)', lineHeight: 1 }}>
              {Math.round(progress)}%
            </div>
            <div className="review-progress-bar">
              <div className="review-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-secondary)' }}>
              {completed} / {total}
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', color: 'var(--ink-secondary)', marginTop: '0.5rem' }}>
              {dateStr}
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.5rem' }}>
              <button
                className="btn-text"
                onClick={resetReview}
                style={{ paddingLeft: 0 }}
              >
                Reset
              </button>
              {progress === 100 && (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--sheet-blue)', fontStyle: 'italic' }}>
                  ✓ Complete
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Checklist sections */}
        <div className="review-sections">
          {categories.map(category => (
            <div key={category} className="review-section">
              <div className="review-section-title" style={{ borderBottomColor: `${CATEGORY_COLORS[category] || 'var(--sheet-blue)'}40`, color: CATEGORY_COLORS[category] || 'var(--sheet-blue)' }}>
                {category}
              </div>
              {grouped[category].map((item, i) => (
                <div
                  key={item.id}
                  className={`review-item fade-in ${item.completed ? 'done' : ''}`}
                  style={{ animationDelay: `${i * 0.03}s` }}
                  onClick={() => toggleReviewItem(item.id, !item.completed)}
                >
                  <div className="review-checkbox">
                    {item.completed && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="review-item-text">{item.title}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Decorative corner element */}
      <div style={{
        position: 'absolute',
        right: '4%',
        bottom: '5%',
        fontFamily: 'var(--font-display)',
        fontSize: '8rem',
        color: 'rgba(20,28,58,0.04)',
        lineHeight: 1,
        letterSpacing: '-0.05em',
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        Review
      </div>
    </div>
  )
}
