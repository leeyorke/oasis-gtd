import type { Task } from '../types'

export interface ProjectStat {
  /** 项目下全部任务数（含已完成） */
  total: number
  /** 已完成（status === 'done'）任务数 */
  done: number
  /** 完成百分比，0-100，四舍五入 */
  progress: number
}

/** 没有任何任务的项目使用的空统计 */
export const EMPTY_PROJECT_STAT: ProjectStat = { total: 0, done: 0, progress: 0 }

/**
 * 按 project_id 聚合任务，得到每个项目的 { total, done, progress }。
 *
 * 注意：必须基于**全量** tasks 计算。项目卡片处于列表视图时没有选中任何项目，
 * 若先按 selectedProjectId 过滤出任务子集再统计，每个卡片都会恒等于
 * 0 tasks / 0%——这正是历史上出现过的 bug。
 */
export function computeProjectStats(tasks: Task[]): Record<string, ProjectStat> {
  const stats: Record<string, { total: number; done: number }> = {}

  for (const task of tasks) {
    if (!task.project_id) continue
    const stat = stats[task.project_id] || (stats[task.project_id] = { total: 0, done: 0 })
    stat.total += 1
    if (task.status === 'done') stat.done += 1
  }

  const result: Record<string, ProjectStat> = {}
  for (const id of Object.keys(stats)) {
    const { total, done } = stats[id]
    result[id] = {
      total,
      done,
      progress: total > 0 ? Math.round((done / total) * 100) : 0
    }
  }
  return result
}

/** 取某个项目的统计；没有任务时返回空统计而不是 undefined */
export function getProjectStat(
  stats: Record<string, ProjectStat>,
  projectId: string
): ProjectStat {
  return stats[projectId] || EMPTY_PROJECT_STAT
}
