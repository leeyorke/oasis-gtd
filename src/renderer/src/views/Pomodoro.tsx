import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Target, TrendingUp, RotateCcw, Square, Search, CircleDot } from 'lucide-react'

type PomodoroTab = 'focus' | 'stats'

/** Preset focus lengths shown next to the countdown ring (minutes). */
const DURATION_PRESETS = [15, 25, 45, 60]
const DURATION_STEP = 5
/** Daily-goal stepper granularity, in minutes. */
const GOAL_STEP = 15

const WEEK_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const WEEK_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const RING_SIZE = 300
const RING_STROKE = 3
const RING_RADIUS = RING_SIZE / 2 - RING_STROKE - 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * Tasks from every actionable GTD bucket (立即做 / 下一步行动 / 日程 / 收件箱).
 * Done, archived and the delegated buckets are excluded — waiting items and
 * someday ideas have their own tables and are merged in separately.
 */
const EXCLUDED_TASK_STATUSES = ['done', 'archive', 'waiting', 'someday']

/** A selectable focus item, unified across tasks / waiting items / habits / someday. */
interface FocusableItem {
  /** Stable UI identity, e.g. `habit:abc` — never written to the database. */
  key: string
  /** Set only for real `tasks` rows; becomes focus_sessions.task_id (an FK). */
  id?: string
  title: string
  /** Right-hand tag, e.g. `@Deep Work`. */
  tag: string
}

function formatClock(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "1 小时 15 分钟" / "1h 15m" */
function formatDuration(seconds: number, isZh: boolean): string {
  const totalMinutes = Math.round(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (isZh) {
    if (h && m) return `${h} 小时 ${m} 分钟`
    if (h) return `${h} 小时`
    return `${m} 分钟`
  }
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/** "2.5 小时" / "2.5h" — trailing zeros trimmed. */
function formatHours(seconds: number, isZh: boolean): string {
  const hours = seconds / 3600
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  return isZh ? `${text} 小时` : `${text}h`
}

/** Weekday label for a YYYY-MM-DD string, Monday-first. */
function weekdayLabel(date: string, isZh: boolean): string {
  const day = new Date(`${date}T00:00:00`).getDay()
  const index = (day + 6) % 7
  return isZh ? WEEK_LABELS_ZH[index] : WEEK_LABELS_EN[index]
}

function getLocalToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Pomodoro() {
  const {
    tasks,
    waitingItems,
    habits,
    somedayItems,
    settings,
    focusStats,
    focusConfig,
    focusTimer,
    loadFocusStats,
    loadFocusConfig,
    syncFocusTimer,
    setFocusGoalMinutes,
    setFocusDurationMinutes,
    startFocus,
    pauseFocus,
    resumeFocus,
    stopFocus,
    resetFocus,
    loadWaiting,
    loadSomeday,
  } = useStore()

  const isZh = settings.language === 'zh'
  const [tab, setTab] = useState<PomodoroTab>('focus')
  const [keyword, setKeyword] = useState('')

  const durationMinutes = focusConfig?.durationMinutes ?? 25
  const goalMinutes = focusConfig?.goalMinutes ?? 240

  useEffect(() => {
    loadFocusConfig()
    loadFocusStats()
    // Re-sync with the main-process clock — it keeps counting while the window
    // is hidden, so the renderer may have missed ticks (or the page reloaded).
    syncFocusTimer()
    // App loads these in the background — re-fetch so the picker is complete
    // even when the user lands here immediately after launch.
    loadWaiting()
    loadSomeday()
  }, [loadFocusConfig, loadFocusStats, syncFocusTimer, loadWaiting, loadSomeday])

  // Keep the stats tab honest when the app stays open across midnight.
  useEffect(() => {
    const interval = setInterval(loadFocusStats, 30000)
    return () => clearInterval(interval)
  }, [loadFocusStats])

  const isActive = focusTimer.status !== 'idle'
  const isRunning = focusTimer.status === 'running'

  const elapsedSeconds = focusTimer.totalSeconds - focusTimer.remainingSeconds
  const ringProgress = focusTimer.totalSeconds > 0
    ? Math.min(1, Math.max(0, elapsedSeconds / focusTimer.totalSeconds))
    : 0

  const selectableItems = useMemo<FocusableItem[]>(() => {
    const items: FocusableItem[] = []

    for (const task of tasks) {
      if (EXCLUDED_TASK_STATUSES.includes(task.status)) continue
      items.push({ key: `task:${task.id}`, id: task.id, title: task.title, tag: task.context || '' })
    }
    for (const item of waitingItems) {
      items.push({
        key: `waiting:${item.id}`,
        title: item.title,
        tag: item.waiting_for ? `@${item.waiting_for}` : '',
      })
    }
    for (const habit of habits) {
      items.push({ key: `habit:${habit.id}`, title: habit.title, tag: isZh ? '@习惯' : '@Habit' })
    }
    for (const item of somedayItems) {
      items.push({
        key: `someday:${item.id}`,
        title: item.title,
        tag: item.category || (isZh ? '@将来也许' : '@Someday'),
      })
    }

    return items
  }, [tasks, waitingItems, habits, somedayItems, isZh])

  const filteredItems = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return selectableItems
    return selectableItems.filter(
      item => item.title.toLowerCase().includes(needle) || item.tag.toLowerCase().includes(needle)
    )
  }, [selectableItems, keyword])

  const todaySeconds = focusStats?.todaySeconds ?? 0
  const todaySessions = focusStats?.todaySessions ?? 0
  const goalSeconds = goalMinutes * 60
  const goalPercent = goalSeconds > 0
    ? Math.min(100, Math.round((todaySeconds / goalSeconds) * 100))
    : 0

  /** Adjust by `delta` steps of DURATION_STEP, snapped to whole minutes. */
  const adjustDuration = (delta: number) => {
    if (isActive) return
    setFocusDurationMinutes(Math.max(5, Math.min(180, durationMinutes + delta * DURATION_STEP)))
  }

  const adjustGoal = (delta: number) => {
    setFocusGoalMinutes(Math.max(30, Math.min(720, goalMinutes + delta * GOAL_STEP)))
  }

  const handleToggleTimer = () => {
    if (isRunning) {
      pauseFocus()
    } else if (focusTimer.status === 'paused') {
      resumeFocus()
    } else {
      startFocus({
        id: focusTimer.taskId ?? undefined,
        sourceKey: focusTimer.sourceKey ?? undefined,
        title: focusTimer.taskTitle || undefined,
        context: focusTimer.context || undefined,
      })
    }
  }

  const handleSelectItem = (item: FocusableItem) => {
    if (isActive) return
    startFocus({ id: item.id, sourceKey: item.key, title: item.title, context: item.tag })
  }

  const handleStop = () => stopFocus()

  const renderFocusTab = () => (
    <div className="pomodoro-focus">
      <div className="pomodoro-timer-block">
        <div className={`pomodoro-ring ${isRunning ? 'running' : ''}`}>
          <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--border)"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringProgress)}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </svg>
          <div className="pomodoro-clock">{formatClock(focusTimer.remainingSeconds)}</div>
        </div>

        <div className="pomodoro-duration-label">
          {isZh ? '专注时长' : 'Focus Duration'}
        </div>
        <div className="pomodoro-duration-presets">
          <button
            className="pomodoro-step-btn"
            onClick={() => adjustDuration(-1)}
            disabled={isActive}
            title={isZh ? '减少 5 分钟' : 'Decrease 5 minutes'}
          >−</button>
          {DURATION_PRESETS.map(minutes => (
            <button
              key={minutes}
              className={`pomodoro-preset ${minutes === durationMinutes ? 'active' : ''}`}
              onClick={() => !isActive && setFocusDurationMinutes(minutes)}
              disabled={isActive}
            >
              {isZh ? `${minutes}分钟` : `${minutes} min`}
            </button>
          ))}
          <button
            className="pomodoro-step-btn"
            onClick={() => adjustDuration(1)}
            disabled={isActive}
            title={isZh ? '增加 5 分钟' : 'Increase 5 minutes'}
          >+</button>
        </div>

        <div className="pomodoro-current-task">
          {focusTimer.taskTitle ? (
            <>
              <CircleDot size={14} className="pomodoro-task-dot" />
              <span className="pomodoro-task-title">{focusTimer.taskTitle}</span>
              {focusTimer.context && (
                <span className="pomodoro-task-context">{focusTimer.context}</span>
              )}
            </>
          ) : (
            <span className="pomodoro-task-empty">
              {isZh ? '未选择任务 · 自由专注' : 'No task · Free focus'}
            </span>
          )}
        </div>

        <div className="pomodoro-controls">
          <button
            className="pomodoro-icon-btn"
            onClick={resetFocus}
            disabled={!isActive}
            title={isZh ? '重置' : 'Reset'}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="pomodoro-primary-btn"
            onClick={handleToggleTimer}
          >
            {isRunning
              ? (isZh ? '暂停' : 'Pause')
              : focusTimer.status === 'paused'
                ? (isZh ? '继续' : 'Resume')
                : (isZh ? '开始' : 'Start')}
          </button>
          <button
            className="pomodoro-icon-btn"
            onClick={handleStop}
            disabled={!isActive}
            title={isZh ? '放弃本次专注' : 'Discard session'}
          >
            <Square size={16} />
          </button>
        </div>
      </div>

      <div className="pomodoro-task-picker">
        <div className="pomodoro-section-label">
          {isZh ? '选择专注任务' : 'Choose a Focus Task'}
        </div>

        <div className="pomodoro-search">
          <Search size={14} />
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder={isZh ? '搜索任务、等待中、习惯、将来也许…' : 'Search tasks, waiting, habits, someday…'}
          />
        </div>

        {filteredItems.length === 0 ? (
          <div className="pomodoro-empty">
            {keyword
              ? (isZh ? '没有匹配的任务' : 'No matching items')
              : (isZh ? '暂无可专注的任务' : 'No focusable items yet')}
          </div>
        ) : (
          <ul className="pomodoro-task-list">
            {filteredItems.map(item => {
              const selected = focusTimer.sourceKey === item.key
              return (
                <li key={item.key}>
                  <button
                    className={`pomodoro-task-item ${selected ? 'active' : ''}`}
                    onClick={() => handleSelectItem(item)}
                    disabled={isActive}
                  >
                    <span className="pomodoro-task-item-title">{item.title}</span>
                    <span className="pomodoro-task-item-context">{item.tag || '—'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="pomodoro-summary">
        {isZh
          ? `今日已完成 ${todaySessions} 个番茄钟 · ${formatDuration(todaySeconds, true)}`
          : `${todaySessions} pomodoros today · ${formatDuration(todaySeconds, false)}`}
      </div>
    </div>
  )

  const renderStatsTab = () => {
    const days = focusStats?.days ?? []
    const peakSeconds = Math.max(1, ...days.map(d => d.seconds))

    return (
      <div className="pomodoro-stats">
        <div className="pomodoro-stat-row two">
          <section className="pomodoro-stat-card">
            <div className="pomodoro-stat-title">
              <Target size={14} />
              {isZh ? '每日专注目标' : 'Daily Focus Goal'}
            </div>
            <div className="pomodoro-goal">
              <span className="pomodoro-goal-value">{formatHours(goalSeconds, isZh)}</span>
              <div className="pomodoro-goal-actions">
                <button className="pomodoro-step-btn" onClick={() => adjustGoal(-1)}>−</button>
                <button className="pomodoro-step-btn" onClick={() => adjustGoal(1)}>+</button>
              </div>
            </div>
          </section>

          <section className="pomodoro-stat-card">
            <div className="pomodoro-stat-title">
              <TrendingUp size={14} />
              {isZh ? '今日进度' : 'Today'}
            </div>
            <div className="pomodoro-today-value">
              {isZh ? `今日已专注 ${formatDuration(todaySeconds, true)}` : `Focused ${formatDuration(todaySeconds, false)} today`}
            </div>
            <div className="pomodoro-progress">
              <div className="pomodoro-progress-fill" style={{ width: `${goalPercent}%` }} />
            </div>
            <div className="pomodoro-progress-hint">
              {isZh ? `已完成 ${goalPercent}%` : `${goalPercent}% complete`}
            </div>
          </section>
        </div>

        <section className="pomodoro-stat-card chart">
          <div className="pomodoro-stat-title">
            {isZh ? '近 7 日专注分布' : 'Last 7 Days'}
          </div>
          <div className="pomodoro-chart">
            {days.map(day => {
              const heightPercent = (day.seconds / peakSeconds) * 100
              const isToday = day.date === getLocalToday()
              return (
                <div key={day.date} className={`pomodoro-chart-col ${isToday ? 'today' : ''}`}>
                  <div className="pomodoro-chart-value">
                    {day.seconds > 0 ? formatHours(day.seconds, false) : ''}
                  </div>
                  <div className="pomodoro-chart-track">
                    <div
                      className="pomodoro-chart-bar"
                      style={{ height: `${Math.max(day.seconds > 0 ? 4 : 0, heightPercent)}%` }}
                    />
                  </div>
                  <div className="pomodoro-chart-label">{weekdayLabel(day.date, isZh)}</div>
                </div>
              )
            })}
          </div>
        </section>

        <div className="pomodoro-stat-row three">
          <section className="pomodoro-stat-card compact">
            <div className="pomodoro-stat-title">{isZh ? '平均每日' : 'Daily Average'}</div>
            <div className="pomodoro-stat-value">{formatHours(focusStats?.averageSeconds ?? 0, isZh)}</div>
          </section>
          <section className="pomodoro-stat-card compact">
            <div className="pomodoro-stat-title">{isZh ? '连续专注' : 'Streak'}</div>
            <div className="pomodoro-stat-value">
              {focusStats?.streak ?? 0} {isZh ? '天' : focusStats?.streak === 1 ? 'day' : 'days'}
            </div>
          </section>
          <section className="pomodoro-stat-card compact">
            <div className="pomodoro-stat-title">{isZh ? '本周累计' : 'This Week'}</div>
            <div className="pomodoro-stat-value">{formatHours(focusStats?.weekSeconds ?? 0, isZh)}</div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <main className="main-content pomodoro-page">
      <div className="page-header">
        <h1 className="page-title">{isZh ? '番茄钟' : 'Pomodoro'}</h1>
        <div className="page-subtitle">
          {isZh ? '保持专注，一次一事' : 'One Thing at a Time'}
        </div>
      </div>

      <div className="pomodoro-tabs">
        <button
          className={`pomodoro-tab ${tab === 'focus' ? 'active' : ''}`}
          onClick={() => setTab('focus')}
        >
          {isZh ? '专注' : 'Focus'}
        </button>
        <button
          className={`pomodoro-tab ${tab === 'stats' ? 'active' : ''}`}
          onClick={() => { setTab('stats'); loadFocusStats() }}
        >
          {isZh ? '统计' : 'Stats'}
        </button>
      </div>

      <div className="pomodoro-body">
        {tab === 'focus' ? renderFocusTab() : renderStatsTab()}
      </div>
    </main>
  )
}