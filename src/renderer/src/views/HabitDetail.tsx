import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { ArrowLeft } from 'lucide-react'

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_NAMES_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

export default function HabitDetail() {
  const { selectedHabit, selectedHabitId, loadHabitById, setView, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  useEffect(() => {
    if (selectedHabitId) {
      loadHabitById(selectedHabitId)
    }
  }, [selectedHabitId, loadHabitById])

  const handleBack = () => {
    setView('habit')
  }

  if (!selectedHabit) {
    return (
      <main className="main-content">
        <div className="habit-detail-loading">
          {isZh ? '加载中...' : 'Loading...'}
        </div>
      </main>
    )
  }

  // 计算当前年份的12个月数据
  const getTwelveMonthsData = () => {
    const isQuantitative = selectedHabit.is_quantitative === 1
    const target = selectedHabit.target || 1
    const months: Array<{ name: string; days: Array<{ date: string; completed: boolean; isEmpty: boolean; count: number }> }> = []
    const now = new Date()
    const currentYear = now.getFullYear()

    // 从1月到12月
    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(currentYear, month + 1, 0).getDate()
      const firstDayOfWeek = new Date(currentYear, month, 1).getDay()

      // 调整：周一为0
      const startPadding = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

      const days: Array<{ date: string; completed: boolean; isEmpty: boolean; count: number }> = []

      // 添加空白的padding
      for (let j = 0; j < startPadding; j++) {
        days.push({ date: '', completed: false, isEmpty: true, count: 0 })
      }

      // 添加实际天数
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const count = selectedHabit.allRecords?.[dateStr] || 0
        const completed = isQuantitative ? count >= target : count >= 1
        days.push({ date: dateStr, completed, isEmpty: false, count })
      }

      months.push({
        name: isZh ? MONTH_NAMES_ZH[month] : MONTH_NAMES_EN[month],
        days,
      })
    }

    return months
  }

  const months = getTwelveMonthsData()

  return (
    <main className="main-content">
      <div className="habit-detail-wrapper">
        {/* 返回链接 */}
        <button className="habit-detail-back" onClick={handleBack}>
          <ArrowLeft size={16} />
          <span>{isZh ? '返回习惯' : 'Back to Habits'}</span>
        </button>

        {/* 页面标题 */}
        <div className="page-header">
          <h1 className="page-title">{selectedHabit.title}</h1>
          <div className="page-subtitle">
            <span>{isZh ? `连续: ${selectedHabit.streak} 天` : `Streak: ${selectedHabit.streak} Days`}</span>
            <span className="habit-meta-dot"></span>
            <span>
              {selectedHabit.frequency === 'daily' ? (isZh ? '每天' : 'Daily') : (isZh ? '每周' : 'Weekly')}
              {selectedHabit.time_of_day && `, ${selectedHabit.time_of_day}`}
            </span>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="habit-detail-stats">
          <div className="habit-stat-card">
            <div className="habit-stat-value">{selectedHabit.streak}</div>
            <div className="habit-stat-label">{isZh ? '当前连续' : 'Current Streak'}</div>
          </div>
          <div className="habit-stat-card">
            <div className="habit-stat-value">{selectedHabit.longestStreak}</div>
            <div className="habit-stat-label">{isZh ? '最长连续' : 'Longest Streak'}</div>
          </div>
          <div className="habit-stat-card">
            <div className="habit-stat-value">{selectedHabit.totalSessions}</div>
            <div className="habit-stat-label">{isZh ? '总打卡次数' : 'Total Sessions'}</div>
          </div>
          <div className="habit-stat-card">
            <div className="habit-stat-value">{selectedHabit.completionRate}%</div>
            <div className="habit-stat-label">{isZh ? '完成率' : 'Completion Rate'}</div>
          </div>
        </div>

        {/* 日历区块 */}
        <div className="habit-calendar">
          <div className="habit-calendar-header">
            <div className="habit-calendar-title">
              {isZh ? '12个月打卡记录' : '12-Month Check-in Record'}
            </div>
            <div className="habit-calendar-legend">
              <div className="habit-legend-item">
                <div className="habit-day-square"></div>
                <span>{isZh ? '未完成' : 'Missed'}</span>
              </div>
              <div className="habit-legend-item">
                <div className="habit-day-square habit-day-square-done"></div>
                <span>{isZh ? '已完成' : 'Completed'}</span>
              </div>
            </div>
          </div>

          <div className="habit-year-grid">
            {months.map((month, monthIndex) => (
              <div key={monthIndex} className="habit-month-block">
                <div className="habit-month-name">{month.name}</div>
                <div className="habit-month-grid">
                  {month.days.map((day, dayIndex) => {
                    const isQuantitative = selectedHabit.is_quantitative === 1
                    const target = selectedHabit.target || 1

                    // 计算颜色深浅：已完成次数/总次数，100%黑色，最小0.15
                    const getOpacity = () => {
                      if (day.isEmpty || day.count === 0) return undefined
                      if (!isQuantitative) return 1
                      const ratio = day.count / target
                      return Math.max(0.15, Math.min(1, ratio))
                    }

                    const opacity = getOpacity()

                    return (
                      <div
                        key={dayIndex}
                        className={`habit-day-square ${day.completed ? 'habit-day-square-done' : ''} ${day.isEmpty ? 'habit-day-square-empty' : ''}`}
                        style={opacity !== undefined ? { backgroundColor: `rgba(0, 0, 0, ${opacity})`, borderColor: `rgba(0, 0, 0, ${opacity})` } : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
