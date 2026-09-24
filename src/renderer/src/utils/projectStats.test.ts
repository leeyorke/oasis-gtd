import test from 'node:test'
import assert from 'node:assert/strict'
import type { Task } from '../types/index.ts'
import { computeProjectStats, EMPTY_PROJECT_STAT } from './projectStats.ts'

function makeTask(partial: Partial<Task> & Pick<Task, 'id' | 'status'>): Task {
  return {
    title: partial.id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial
  }
}

test('project card stats are derived from the full task list (no project selected)', () => {
  // Regression: the cards used to filter `tasks` by selectedProjectId first.
  // In the list view selectedProjectId is null, so every card rendered
  // "0 tasks · 0%" even though tasks existed in the database.
  const tasks: Task[] = [
    makeTask({ id: 't1', project_id: 'p1', status: 'done' }),
    makeTask({ id: 't2', project_id: 'p1', status: 'done' }),
    makeTask({ id: 't3', project_id: 'p1', status: 'next' }),
    makeTask({ id: 't4', project_id: 'p1', status: 'next' }),
    makeTask({ id: 't5', project_id: 'p2', status: 'next' }),
    makeTask({ id: 't6', status: 'inbox' }) // no project → must not be counted anywhere
  ]

  const stats = computeProjectStats(tasks)

  assert.deepEqual(stats.p1, { total: 4, done: 2, progress: 50 })
  assert.deepEqual(stats.p2, { total: 1, done: 0, progress: 0 })
  assert.equal(Object.keys(stats).length, 2)
})

test('projects with no tasks report the empty stat, not undefined', () => {
  const stats = computeProjectStats([])
  assert.deepEqual(stats, {})
  assert.deepEqual(EMPTY_PROJECT_STAT, { total: 0, done: 0, progress: 0 })
})

test('progress rounds to the nearest percent and stays within 0-100', () => {
  const stats = computeProjectStats([
    makeTask({ id: 'a', project_id: 'p', status: 'done' }),
    makeTask({ id: 'b', project_id: 'p', status: 'done' }),
    makeTask({ id: 'c', project_id: 'p', status: 'next' })
  ])
  assert.deepEqual(stats.p, { total: 3, done: 2, progress: 67 })

  const allDone = computeProjectStats([
    makeTask({ id: 'x', project_id: 'p', status: 'done' }),
    makeTask({ id: 'y', project_id: 'p', status: 'done' })
  ])
  assert.deepEqual(allDone.p, { total: 2, done: 2, progress: 100 })
})

test('every task status other than done counts as not-done', () => {
  const stats = computeProjectStats([
    makeTask({ id: 'a', project_id: 'p', status: 'next' }),
    makeTask({ id: 'b', project_id: 'p', status: 'waiting' }),
    makeTask({ id: 'c', project_id: 'p', status: 'someday' }),
    makeTask({ id: 'd', project_id: 'p', status: 'inbox' }),
    makeTask({ id: 'e', project_id: 'p', status: 'done' })
  ])
  assert.deepEqual(stats.p, { total: 5, done: 1, progress: 20 })
})
