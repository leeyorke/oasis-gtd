import test from 'node:test'
import assert from 'node:assert/strict'
import { describeCompletion, planFocusCompletion } from './focus-completion.ts'

const TODAY = '2026-03-14'

test('a finished pomodoro closes the focused task', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'task',
    targetId: 'task-1',
    date: TODAY,
    info: { taskStatus: 'next' },
  })

  assert.deepEqual(plan, { kind: 'complete-task' })
})

test('a task that is already done is left alone', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'task',
    targetId: 'task-1',
    date: TODAY,
    info: { taskStatus: 'done' },
  })

  assert.deepEqual(plan, { kind: 'already-done' })
})

test('a single-shot habit is checked off in one go', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'habit',
    targetId: 'habit-1',
    date: TODAY,
    info: { habit: { isQuantitative: false, target: 1 }, count: 0 },
  })

  assert.deepEqual(plan, { kind: 'check-habit' })
})

test('a multi-count habit advances by exactly one count per focus', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'habit',
    targetId: 'habit-1',
    date: TODAY,
    info: { habit: { isQuantitative: true, target: 8 }, count: 3 },
  })

  // 3/8 → 4/8 — the habit is not done yet.
  assert.deepEqual(plan, { kind: 'credit-habit', count: 4, target: 8 })
})

test('a multi-count habit is done once the last count is in', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'habit',
    targetId: 'habit-1',
    date: TODAY,
    info: { habit: { isQuantitative: true, target: 8 }, count: 7 },
  })

  assert.deepEqual(plan, { kind: 'credit-habit', count: 8, target: 8 })
})

test('a multi-count habit never runs past its target', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'habit',
    targetId: 'habit-1',
    date: TODAY,
    info: { habit: { isQuantitative: true, target: 8 }, count: 8 },
  })

  assert.deepEqual(plan, { kind: 'already-done' })
})

test('the first focus of a multi-count habit counts as one', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'habit',
    targetId: 'habit-1',
    date: TODAY,
    info: { habit: { isQuantitative: true, target: 3 }, count: 0 },
  })

  assert.deepEqual(plan, { kind: 'credit-habit', count: 1, target: 3 })
})

test('waiting and someday items are never completed by a timer', () => {
  for (const targetType of ['waiting', 'someday', 'free'] as const) {
    const plan = planFocusCompletion({
      enabled: true,
      targetType,
      targetId: 'item-1',
      date: TODAY,
    })
    assert.deepEqual(plan, { kind: 'none' })
  }
})

test('nothing is completed when the feature is switched off', () => {
  const plan = planFocusCompletion({
    enabled: false,
    targetType: 'task',
    targetId: 'task-1',
    date: TODAY,
    info: { taskStatus: 'next' },
  })

  assert.deepEqual(plan, { kind: 'none' })
})

test('a free-focus session has no target to close', () => {
  const plan = planFocusCompletion({
    enabled: true,
    targetType: 'free',
    targetId: null,
    date: TODAY,
  })

  assert.deepEqual(plan, { kind: 'none' })
})

test('the completion notice describes what happened', () => {
  assert.equal(describeCompletion({ kind: 'complete-task' }, false), 'Task marked complete')
  assert.equal(describeCompletion({ kind: 'check-habit' }, false), 'Habit checked off')
  assert.equal(
    describeCompletion({ kind: 'credit-habit', count: 4, target: 8 }, false),
    'Habit checked in 4/8'
  )
  assert.equal(describeCompletion({ kind: 'credit-habit', count: 4, target: 8 }, true), '习惯已打卡 4/8')
  assert.equal(describeCompletion({ kind: 'none' }, false), null)
})

test('an already-complete item says so in its own words', () => {
  assert.equal(describeCompletion({ kind: 'already-done' }, false, 'task'), 'Task already done')
  assert.equal(
    describeCompletion({ kind: 'already-done' }, false, 'habit'),
    'Habit already complete today'
  )
  assert.equal(describeCompletion({ kind: 'already-done' }, true, 'task'), '任务已完成')
})
