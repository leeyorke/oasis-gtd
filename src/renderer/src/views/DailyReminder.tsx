import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore'

export default function DailyReminder() {
  const { dismissReminder, tasks, habits, notes } = useStore()
  const [task, setTask] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    window.api.getRandomPendingTask()
      .then((res: any) => setTask(res ?? null))
      .catch((err: any) => {
        console.error('[DailyReminder] getRandomPendingTask failed:', err)
        setTask(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleDismiss = useCallback(() => {
    setFadeOut(true)
    setTimeout(() => dismissReminder(), 300)
  }, [dismissReminder])

  // Dismiss on any key press or click
  useEffect(() => {
    const handleDismissAction = () => {
      if (loading) return
      handleDismiss()
    }
    window.addEventListener('keydown', handleDismissAction)
    window.addEventListener('click', handleDismissAction)
    return () => {
      window.removeEventListener('keydown', handleDismissAction)
      window.removeEventListener('click', handleDismissAction)
    }
  }, [loading, handleDismiss])

  // Stats from store
  const pendingCount = tasks?.filter((t: any) => !['done', 'archive'].includes(t.status)).length ?? 0
  const todayHabits = habits?.filter((h: any) => h.active !== 0).length ?? 0
  const notesCount = notes?.length ?? 0

  // Date
  const now = new Date()
  const dateStr = `${now.getFullYear()} · ${String(now.getMonth() + 1).padStart(2, '0')} · ${String(now.getDate()).padStart(2, '0')}`

  // ─── Loading state ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="dr2-page">
        <style>{dailyReminder2CSS}</style>
        <div className="dr2-texture-overlay" />
        <div style={{ margin: 'auto', color: '#9AA3AD', fontSize: 13, zIndex: 10, position: 'relative' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={`dr2-page${fadeOut ? ' dr2-fade-out' : ''}`}>
      <style>{dailyReminder2CSS}</style>

      {/* Noise texture overlay — kraft paper effect */}
      <div className="dr2-texture-overlay" />
      <div className="dr2-container">
        {/* Header */}
        <header className="dr2-header">
          <div className="dr2-logo">
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 17.5C10.866 17.5 14 14.366 14 10.5C14 6.63401 7 0 7 0C7 0 0 6.63401 0 10.5C0 14.366 3.13401 17.5 7 17.5Z" fill="currentColor" />
            </svg>
            <span>Oasis</span>
          </div>
          <div className="dr2-header-date">{dateStr}</div>
        </header>

        {/* Main content */}
        <main className="dr2-main">
          {/* Hero */}
          <div className="dr2-hero">
            <div className="dr2-tagline">
              <span className="dr2-decorative-line" />
              <span>GTD · Reflect · Grow</span>
              <span className="dr2-decorative-line" />
            </div>
            <h1 className="dr2-headline">
              Focus begins <em>here</em>
            </h1>
            <p className="dr2-subtitle">
              输入一切你想输入的，Oasis 做你的管家。
              <br />
              捕捉、整理、执行，让每一刻都有意义。
            </p>
          </div>

          {/* Cards section */}
          <div className="dr2-cards-section">
            {/* Task card — today's pick */}
            <div className="dr2-task-card">
              <div className="dr2-task-left">
                <div className="dr2-task-label">今日推荐</div>
                <div className="dr2-task-bars">
                  <div className="dr2-bar h4" />
                  <div className="dr2-bar h3" />
                  <div className="dr2-bar h2" />
                  <div className="dr2-bar h4" />
                </div>
                <div className="dr2-task-pick">{"Today's Pick"}</div>
              </div>
              <div className="dr2-task-right">
                <p className="dr2-task-quote">
                  {task
                    ? `"${task.title}"`
                    : '"暂无待办任务，享受自由时光。"'
                  }
                </p>
                <div className="dr2-task-footer">
                  <div className="dr2-task-meta">
                    <div className="dr2-task-source">
                      {task?.context ? `@${task.context}` : '@NEXT ACTION'}
                    </div>
                    <div className="dr2-task-date">{dateStr}</div>
                  </div>
                  <div className="dr2-task-dots">
                    <div className="dr2-dot active" />
                    <div className="dr2-dot" />
                    <div className="dr2-dot" />
                  </div>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="dr2-stats-grid">
              <div className="dr2-stat-card">
                <div className="dr2-stat-top-line" />
                <div className="dr2-stat-label">待办</div>
                <div className="dr2-stat-number">{pendingCount}</div>
                <div className="dr2-stat-desc">项任务待完成</div>
              </div>
              <div className="dr2-stat-card">
                <div className="dr2-stat-top-line" />
                <div className="dr2-stat-label">习惯</div>
                <div className="dr2-stat-number">{todayHabits}</div>
                <div className="dr2-stat-desc">个今日待打卡</div>
              </div>
              <div className="dr2-stat-card">
                <div className="dr2-stat-top-line" />
                <div className="dr2-stat-label">随想</div>
                <div className="dr2-stat-number">{notesCount}</div>
                <div className="dr2-stat-desc">条想法已记录</div>
              </div>
              <div className="dr2-stat-card">
                <div className="dr2-stat-top-line" />
                <div className="dr2-stat-label">连续</div>
                <div className="dr2-stat-number">14</div>
                <div className="dr2-stat-desc">天保持记录</div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="dr2-footer">
          <nav className="dr2-footer-nav">
            <button className="dr2-nav-btn active">下一步行动</button>
            <button className="dr2-nav-btn">日程</button>
            <button className="dr2-nav-btn">习惯</button>
            <button className="dr2-nav-btn">随想</button>
          </nav>
          <div className="dr2-footer-right">
            <span className="dr2-hint">按任意键开始捕捉你的想法</span>
            <span className="dr2-version">v1.0.0</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── CSS ─────────────────────────────────────────────────────────────────
const dailyReminder2CSS = `
  .dr2-page {
    --cream: #F3EFE9;
    --paper: #FCFBFA;
    --ink: #1B2633;
    --ink-light: #65707C;
    --ink-lighter: #9AA3AD;
    --subtle: #E6E3DB;
    --hover: #EBE7DD;
    --font-serif: "微软雅黑";
    --font-sans: ui-sans-serif, system-ui, -apple-system, sans-serif;

    position: fixed;
    inset: 0;
    z-index: 9999;
    background-color: var(--cream);
    overflow-x: hidden;
    font-family: var(--font-sans);
    color: var(--ink);
    opacity: 1;
    transition: opacity 0.3s ease;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .dr2-page.dr2-fade-out {
    opacity: 0;
    pointer-events: none;
  }

  /* Noise texture overlay — kraft paper */
  .dr2-texture-overlay {
    position: fixed;
    inset: 0;
    z-index: 0;
    opacity: 0.25;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }

  /* Container */
  .dr2-container {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 32px 48px;
    max-width: 1280px;
    margin: 0 auto;
    width: 100%;
  }

  /* Header */
  .dr2-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  .dr2-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    opacity: 0.8;
  }
  .dr2-logo svg {
    opacity: 0.7;
  }
  .dr2-logo span {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 24px;
    letter-spacing: 0.025em;
    font-weight: 500;
    margin-top: 2px;
  }
  .dr2-header-date {
    font-size: 12px;
    letter-spacing: 0.25em;
    color: var(--ink-light);
    text-transform: uppercase;
  }

  /* Main */
  .dr2-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 1024px;
    margin: 0 auto;
  }

  /* Hero */
  .dr2-hero {
    text-align: center;
    margin-bottom: 48px;
  }
  .dr2-tagline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    font-size: 10px;
    letter-spacing: 0.4em;
    color: var(--ink-light);
    text-transform: uppercase;
    margin-bottom: 40px;
  }
  .dr2-decorative-line {
    display: inline-block;
    width: 32px;
    height: 1px;
    background-color: var(--ink-lighter);
    opacity: 0.6;
  }
  .dr2-headline {
    font-family: var(--font-serif);
    font-size: clamp(48px, 6vw, 88px);
    font-weight: 400;
    color: var(--ink);
    letter-spacing: -0.025em;
    line-height: 1;
    margin-bottom: 32px;
  }
  .dr2-headline em {
    font-style: italic;
    font-weight: 300;
    opacity: 0.8;
  }
  .dr2-subtitle {
    font-size: 14px;
    color: var(--ink-light);
    letter-spacing: 0.15em;
    line-height: 1.625;
    max-width: 512px;
    margin: 0 auto;
    opacity: 0.85;
  }

  /* Cards section */
  .dr2-cards-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Task card */
  .dr2-task-card {
    background: var(--paper);
    border-radius: 16px;
    padding: 40px;
    display: flex;
    box-shadow: 0 4px 20px -2px rgba(27, 38, 51, 0.04);
    border: 1px solid var(--subtle);
    transition: all 0.5s ease;
  }
  .dr2-task-card:hover {
    box-shadow: 0 12px 30px -4px rgba(27, 38, 51, 0.08);
    transform: translateY(-2px);
  }

  .dr2-task-left {
    width: 224px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 1px solid rgba(230, 227, 219, 0.7);
    padding-right: 40px;
  }
  .dr2-task-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: 0.2em;
    margin-bottom: 16px;
  }
  .dr2-task-bars {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 16px;
    margin-bottom: 16px;
    opacity: 0.4;
    transition: opacity 0.3s;
  }
  .dr2-task-card:hover .dr2-task-bars {
    opacity: 0.6;
  }
  .dr2-bar {
    width: 3px;
    background: var(--ink);
    border-radius: 3px;
  }
  .dr2-bar.h4 { height: 16px; }
  .dr2-bar.h3 { height: 12px; }
  .dr2-bar.h2 { height: 8px; }
  .dr2-task-pick {
    font-size: 10px;
    letter-spacing: 0.25em;
    color: var(--ink-light);
    text-transform: uppercase;
    font-weight: 500;
  }

  .dr2-task-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 40px;
  }
  .dr2-task-quote {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: clamp(18px, 2vw, 24px);
    font-weight: 300;
    color: var(--ink);
    line-height: 1.4;
    margin-bottom: 32px;
  }
  .dr2-task-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    width: 100%;
  }
  .dr2-task-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dr2-task-source {
    font-size: 11px;
    letter-spacing: 0.25em;
    color: var(--ink);
    font-weight: 600;
    text-transform: uppercase;
  }
  .dr2-task-date {
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--ink-lighter);
    text-transform: uppercase;
  }
  .dr2-task-dots {
    display: flex;
    gap: 8px;
    opacity: 0.3;
    transition: opacity 0.3s;
    padding-bottom: 4px;
  }
  .dr2-task-card:hover .dr2-task-dots {
    opacity: 1;
  }
  .dr2-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(27, 38, 51, 0.3);
    transition: background 0.15s;
  }
  .dr2-dot.active {
    background: var(--ink);
  }
  .dr2-dot:hover {
    background: rgba(27, 38, 51, 0.6);
  }

  /* Stats grid */
  .dr2-stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
  }
  .dr2-stat-card {
    background: var(--paper);
    border-radius: 16px;
    padding: 28px;
    box-shadow: 0 4px 20px -2px rgba(27, 38, 51, 0.04);
    border: 1px solid var(--subtle);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    cursor: pointer;
  }
  .dr2-stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 30px -4px rgba(27, 38, 51, 0.08);
  }
  .dr2-stat-top-line {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: var(--ink);
    opacity: 0;
    transition: opacity 0.3s;
  }
  .dr2-stat-card:hover .dr2-stat-top-line {
    opacity: 0.1;
  }
  .dr2-stat-label {
    font-size: 13px;
    color: var(--ink-light);
    font-weight: 500;
    letter-spacing: 0.2em;
    margin-bottom: 16px;
  }
  .dr2-stat-number {
    font-family: var(--font-serif);
    font-size: 44px;
    line-height: 1;
    color: var(--ink);
    margin-bottom: 12px;
    font-weight: 500;
  }
  .dr2-stat-desc {
    font-size: 11px;
    color: var(--ink-light);
    letter-spacing: 0.1em;
    margin-top: auto;
  }

  /* Footer */
  .dr2-footer {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 48px;
    padding-bottom: 16px;
  }
  .dr2-footer-nav {
    display: flex;
    gap: 8px;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid rgba(230, 227, 219, 0.5);
  }
  .dr2-nav-btn {
    padding: 10px 24px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 12px;
    letter-spacing: 0.15em;
    font-weight: 500;
    color: var(--ink-light);
    background: transparent;
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font-sans);
  }
  .dr2-nav-btn.active {
    border-color: rgba(230, 227, 219, 0.8);
    background: rgba(252, 251, 250, 0.5);
    box-shadow: 0 2px 8px rgba(27, 38, 51, 0.02);
    color: var(--ink);
  }
  .dr2-nav-btn:hover:not(.active) {
    color: var(--ink);
    background: rgba(235, 231, 221, 0.6);
  }
  .dr2-footer-right {
    display: flex;
    align-items: center;
    gap: 24px;
    font-size: 11px;
    color: var(--ink-lighter);
    letter-spacing: 0.15em;
    font-weight: 500;
  }
  .dr2-hint {
    transition: color 0.15s;
  }
  .dr2-version {
    opacity: 0.6;
  }
`
