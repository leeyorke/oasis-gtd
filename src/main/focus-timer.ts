/**
 * Authoritative Pomodoro clock — deliberately owned by the main process.
 *
 * A renderer-side `setInterval` cannot drive a countdown like this: while the
 * window is hidden (the app lives in the tray during a focus session) Chromium
 * throttles background timers, and after ~5 minutes hidden it throttles them to
 * once per minute and eventually freezes them entirely. The countdown would
 * stall and the completion alert would never fire.
 *
 * The main process has no such restriction, so it owns `endsAt`, persists the
 * session, shows the OS notification, and pushes state to the renderer — which
 * becomes a pure display of `remainingSeconds`.
 */
import { BrowserWindow, Notification } from 'electron'
import {
  focusQueries,
  habitQueries,
  habitRecordQueries,
  settingsQueries,
  taskQueries,
} from './db/database'
import {
  describeCompletion,
  planFocusCompletion,
  type CompletionPlan,
  type FocusTargetType,
} from './focus-completion'

export type FocusTimerStatus = 'idle' | 'running' | 'paused'

export type { FocusTargetType } from './focus-completion'

/** What the renderer mirrors; the source of truth lives here. */
export interface FocusTimerSnapshot {
  status: FocusTimerStatus
  sessionId: string | null
  taskId: string | null
  taskTitle: string
  context: string
  totalSeconds: number
  remainingSeconds: number
  /** The kind of item being focused — decides how it is completed. */
  targetType: FocusTargetType
  /**
   * Primary key of the focused item in its own table. For tasks this equals
   * `taskId`; habits keep their own id because `focus_sessions.task_id` is a
   * foreign key into `tasks` and must stay null for them.
   */
  targetId: string | null
}

const DEFAULT_DURATION_MINUTES = 25
/** Fast enough to stay smooth, cheap enough to idle at. */
const TICK_MS = 250

/** app_settings key: mark the focused item complete when a pomodoro ends. */
export const FOCUS_AUTO_COMPLETE_KEY = 'pomodoro_auto_complete'

let ticker: NodeJS.Timeout | null = null
/** Epoch ms the countdown reaches zero; null unless running. */
let endsAt: number | null = null

/** The focused item, remembered so the next pomodoro starts on it again. */
let carried: {
  id: string | null
  taskTitle: string
  context: string
  targetType: FocusTargetType
  targetId: string | null
} = {
  id: null,
  taskTitle: '',
  context: '',
  targetType: 'free',
  targetId: null
}

// Built without touching the DB — this module is imported before initDatabase().
let snapshot: FocusTimerSnapshot = {
  status: 'idle',
  sessionId: null,
  taskId: null,
  taskTitle: '',
  context: '',
  totalSeconds: DEFAULT_DURATION_MINUTES * 60,
  remainingSeconds: DEFAULT_DURATION_MINUTES * 60,
  targetType: 'free',
  targetId: null
}

function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function configuredDuration(): number {
  const raw = Number(settingsQueries.get('pomodoro_duration_minutes'))
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DURATION_MINUTES
}

function idleSnapshot(durationMinutes = configuredDuration()): FocusTimerSnapshot {
  const totalSeconds = durationMinutes * 60
  return {
    status: 'idle',
    sessionId: null,
    taskId: carried.id,
    taskTitle: carried.taskTitle,
    context: carried.context,
    totalSeconds,
    remainingSeconds: totalSeconds,
    targetType: carried.targetType,
    targetId: carried.targetId
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function clearTicker(): void {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

function startTicker(): void {
  clearTicker()
  ticker = setInterval(tick, TICK_MS)
}

function tick(): void {
  if (snapshot.status !== 'running' || endsAt === null) return

  const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  if (remaining === snapshot.remainingSeconds && remaining > 0) return

  snapshot = { ...snapshot, remainingSeconds: remaining }
  broadcast('focus:tick', snapshot)
  if (remaining <= 0) endFocusSession(true)
}

function completionNotice(finished: FocusTimerSnapshot, autoComplete?: string): { title: string; body: string } {
  const isZh = (settingsQueries.get('language') || 'en') === 'zh'
  const minutes = Math.round(finished.totalSeconds / 60)
  // The session row was just finished, so today's total already includes it.
  const today = focusQueries.getDailyTotals(localDateString(), localDateString())[0]
  const sessions = today?.sessions ?? 0

  const headline = isZh ? `${minutes} 分钟专注完成` : `${minutes}-minute focus complete`
  const counter = isZh ? `今天第 ${sessions} 个番茄钟` : `Pomodoro ${sessions} today`
  const details = [finished.taskTitle, counter].filter(Boolean).join(' · ')

  const body = details ? `${headline} · ${details}` : headline
  return {
    title: isZh ? '专注完成' : 'Focus Complete',
    body: autoComplete ? `${body} · ${autoComplete}` : body
  }
}

/** True when the user wants the focused item closed when a pomodoro ends. */
export function isAutoCompleteEnabled(): boolean {
  // Absent key → enabled: the behaviour is the point of the feature.
  return settingsQueries.get(FOCUS_AUTO_COMPLETE_KEY) !== '0'
}

/**
 * Marks the focused item complete once a pomodoro runs out.
 *
 * The rules live in `focus-completion.ts` (unit tested); this function only
 * reads the current state, applies the plan and returns a short, localized
 * line for the completion toast.
 *
 * A task is closed (`status = 'done'`). A habit is checked off instead: a
 * single-shot habit simply gets today's tick, while a multi-count habit only
 * advances by **one** tick — it is finished once every count of the day is in
 * (e.g. 3/8 → 4/8) and the counter never runs past its target.
 *
 * Waiting-for and someday items have no completion state, so they are left
 * alone.
 */
function autoCompleteTarget(finished: FocusTimerSnapshot): string | null {
  const targetId = finished.targetId
  if (!targetId) return null

  const isZh = (settingsQueries.get('language') || 'en') === 'zh'
  const today = localDateString()

  let plan: CompletionPlan
  try {
    if (finished.targetType === 'task') {
      const task = taskQueries.getById(targetId) as Record<string, unknown> | undefined
      if (!task) return null
      plan = planFocusCompletion({
        enabled: isAutoCompleteEnabled(),
        targetType: finished.targetType,
        targetId,
        date: today,
        info: { taskStatus: (task.status as string) ?? null },
      })
    } else if (finished.targetType === 'habit') {
      const habit = habitQueries.getById(targetId) as Record<string, unknown> | undefined
      if (!habit) return null
      const record = habitRecordQueries.getByHabitAndDate(targetId, today) as Record<string, unknown> | undefined
      plan = planFocusCompletion({
        enabled: isAutoCompleteEnabled(),
        targetType: finished.targetType,
        targetId,
        date: today,
        info: {
          habit: {
            isQuantitative: (habit.is_quantitative as number) === 1,
            target: (habit.target as number) || 1,
          },
          count: record ? (record.count as number || 1) : 0,
        },
      })
    } else {
      return null
    }
  } catch (err) {
    // A failed auto-completion must never break the timer.
    console.error('[Focus] Failed to plan the auto-completion:', err)
    return null
  }

  try {
    switch (plan.kind) {
      case 'complete-task':
        taskQueries.update(targetId, { status: 'done' })
        break
      case 'check-habit':
        habitRecordQueries.toggleComplete(targetId, today, true)
        break
      case 'credit-habit':
        habitRecordQueries.incrementCount(targetId, today, plan.target)
        break
      default:
        break
    }
  } catch (err) {
    console.error('[Focus] Failed to auto-complete the focused item:', err)
    return null
  }

  return describeCompletion(plan, isZh, finished.targetType)
}

function showNotification(payload: { title: string; body: string }): void {
  if (!Notification.isSupported()) return
  try {
    const notification = new Notification({ title: payload.title, body: payload.body })
    // Clicking the toast brings the app back from the tray.
    notification.on('click', () => {
      const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    })
    notification.show()
  } catch (err) {
    // A missing notification daemon must never break the timer.
    console.error('[Focus] Failed to show notification:', err)
  }
}

export function getFocusTimerState(): FocusTimerSnapshot {
  return snapshot
}

export function beginFocusSession(input: {
  taskId?: string
  taskTitle?: string
  context?: string
  durationMinutes?: number
  targetType?: FocusTargetType
  targetId?: string
}): FocusTimerSnapshot {
  if (snapshot.status !== 'idle') return snapshot

  const durationMinutes = input?.durationMinutes ?? configuredDuration()
  const totalSeconds = durationMinutes * 60

  // A task id alone identifies a task; anything else needs an explicit type.
  const targetType: FocusTargetType = input?.targetType ?? (input?.taskId ? 'task' : 'free')
  const targetId = input?.targetId ?? (targetType === 'task' ? input?.taskId ?? null : null)

  // Open the DB row up front so a crash never loses the focused time.
  const sessionId = focusQueries.create({
    task_id: targetType === 'task' ? targetId : null,
    task_title: input?.taskTitle ?? null,
    context: input?.context ?? null,
    duration_minutes: durationMinutes,
    record_date: localDateString()
  })

  carried = {
    id: targetType === 'task' ? targetId : null,
    taskTitle: input?.taskTitle ?? '',
    context: input?.context ?? '',
    targetType,
    targetId
  }

  endsAt = Date.now() + totalSeconds * 1000
  snapshot = {
    status: 'running',
    sessionId,
    taskId: carried.id,
    taskTitle: carried.taskTitle,
    context: carried.context,
    totalSeconds,
    remainingSeconds: totalSeconds,
    targetType,
    targetId
  }

  startTicker()
  broadcast('focus:tick', snapshot)
  return snapshot
}

export function pauseFocusSession(): FocusTimerSnapshot {
  if (snapshot.status !== 'running' || endsAt === null) return snapshot

  const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  endsAt = null
  clearTicker()
  snapshot = { ...snapshot, status: 'paused', remainingSeconds: remaining }
  broadcast('focus:tick', snapshot)
  return snapshot
}

export function resumeFocusSession(): FocusTimerSnapshot {
  if (snapshot.status !== 'paused') return snapshot

  endsAt = Date.now() + snapshot.remainingSeconds * 1000
  snapshot = { ...snapshot, status: 'running' }
  startTicker()
  broadcast('focus:tick', snapshot)
  return snapshot
}

/**
 * Closes the active session. A finished pomodoro banks the full duration; a
 * discarded one banks only what was actually focused, so partial work still
 * counts toward the daily goal.
 */
export function endFocusSession(completed = false): FocusTimerSnapshot {
  if (snapshot.status === 'idle') return snapshot

  const finished = snapshot
  clearTicker()
  endsAt = null

  const elapsed = completed
    ? finished.totalSeconds
    : Math.max(0, finished.totalSeconds - finished.remainingSeconds)

  if (finished.sessionId) {
    try {
      focusQueries.finish(finished.sessionId, elapsed, completed)
    } catch (err) {
      console.error('[Focus] Failed to persist session:', err)
    }
  }

  snapshot = idleSnapshot()
  broadcast('focus:tick', snapshot)

  if (completed) {
    // A finished pomodoro closes the item it ran against.
    const autoComplete = autoCompleteTarget(finished)
    const notice = completionNotice(finished, autoComplete ?? undefined)
    broadcast('focus:completed', notice)
    showNotification(notice)
  }

  return snapshot
}