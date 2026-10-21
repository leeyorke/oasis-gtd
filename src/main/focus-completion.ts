/**
 * Completion rules for a finished pomodoro.
 *
 * When the countdown reaches zero, the item the session ran against is closed
 * automatically. The rules live here — free of Electron imports — so they can
 * be unit tested in plain Node (see focus-completion.test.ts) and reused by
 * the main-process clock (focus-timer.ts).
 */

/** Which kind of GTD item a session runs against. */
export type FocusTargetType = 'free' | 'task' | 'habit' | 'waiting' | 'someday'

/** The shape of the focused item, as far as completion cares. */
export interface FocusTargetInfo {
  /** `tasks.status` for a task, null for every other bucket. */
  taskStatus?: string | null
  /** How many counts a day takes — only meaningful for habits. */
  habit?: { isQuantitative: boolean; target: number } | null
  /** Counts already banked for the session's date (habits only). */
  count?: number
}

/** What has to happen to close the focused item. */
export type CompletionPlan =
  /** The task row must be closed (`status = 'done'`). */
  | { kind: 'complete-task' }
  /** A single-shot habit: today's tick is set, the habit is done. */
  | { kind: 'check-habit' }
  /**
   * A multi-count habit: one focus equals one count. The habit is only done
   * once every count of the day is in — hence `count` vs `target`.
   */
  | { kind: 'credit-habit'; count: number; target: number }
  /** Nothing to do — the item is already complete for today. */
  | { kind: 'already-done' }
  /** Nothing to do — free focus, an unknown bucket, or the feature is off. */
  | { kind: 'none' }

/**
 * Decide what a finished pomodoro does to the item it ran against.
 *
 * - a **task** is closed — it shows up ticked in the task lists;
 * - a **single-shot habit** is checked off for the day;
 * - a **multi-count habit** only advances by one count: 3/8 becomes 4/8 and
 *   the habit is done once the eighth count is in. The counter never runs
 *   past its target;
 * - waiting-for and someday items have no completion state, so they stay
 *   untouched.
 */
export function planFocusCompletion(params: {
  /** The user preference — when off, a pomodoro never closes anything. */
  enabled: boolean
  targetType: FocusTargetType
  targetId: string | null
  /** The day the check-in belongs to (YYYY-MM-DD). */
  date: string
  info?: FocusTargetInfo
}): CompletionPlan {
  if (!params.enabled) return { kind: 'none' }
  if (!params.targetId) return { kind: 'none' }

  const info = params.info ?? {}

  if (params.targetType === 'task') {
    // Already closed — do not touch it again.
    if (info.taskStatus === 'done') return { kind: 'already-done' }
    return { kind: 'complete-task' }
  }

  if (params.targetType === 'habit') {
    const habit = info.habit
    if (!habit) return { kind: 'none' }

    // Single-shot habit: one tick closes it for the day.
    if (!habit.isQuantitative) return { kind: 'check-habit' }

    // Multi-count habit: one focus = one count, never the whole day.
    const target = habit.target > 0 ? habit.target : 1
    const count = info.count ?? 0
    if (count >= target) return { kind: 'already-done' }
    return { kind: 'credit-habit', count: count + 1, target }
  }

  return { kind: 'none' }
}

/**
 * A short, localized line describing what the plan did — shown in the
 * completion toast and the OS notification.
 */
export function describeCompletion(
  plan: CompletionPlan,
  isZh: boolean,
  targetType: FocusTargetType = 'free'
): string | null {
  switch (plan.kind) {
    case 'complete-task':
      return isZh ? '任务已标记为完成' : 'Task marked complete'
    case 'check-habit':
      return isZh ? '习惯已打卡完成' : 'Habit checked off'
    case 'credit-habit':
      return isZh
        ? `习惯已打卡 ${plan.count}/${plan.target}`
        : `Habit checked in ${plan.count}/${plan.target}`
    case 'already-done':
      if (targetType === 'task') return isZh ? '任务已完成' : 'Task already done'
      return isZh ? '习惯今日次数已完成' : 'Habit already complete today'
    default:
      return null
  }
}
