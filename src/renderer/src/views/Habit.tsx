import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'
import { Check, Plus, Pencil, Trash2 } from 'lucide-react'

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日']
const WEEK_DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Habit() {
  const { habits, loadHabits, toggleHabitComplete, incrementHabitCount, addHabit, updateHabit, removeHabit, settings, setView, loadHabitById } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingHabit, setEditingHabit] = useState<any>(null)
  const [deleteHabitId, setDeleteHabitId] = useState<string | null>(null)
  const [newHabitTitle, setNewHabitTitle] = useState('')
  const [newHabitDescription, setNewHabitDescription] = useState('')
  const [newHabitTime, setNewHabitTime] = useState('')
  const [newHabitType, setNewHabitType] = useState<'normal' | 'quantitative'>('normal')
  const [newHabitTarget, setNewHabitTarget] = useState(8)
  const [editHabitTitle, setEditHabitTitle] = useState('')
  const [editHabitDescription, setEditHabitDescription] = useState('')
  const [editHabitTime, setEditHabitTime] = useState('')
  const [animatingId, setAnimatingId] = useState<string | null>(null)

  const getLocalToday = () => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const [today, setToday] = useState(getLocalToday)
  const currentDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1 // 周一为0

  // Auto-refresh habits when date changes (e.g., after midnight)
  useEffect(() => {
    const interval = setInterval(() => {
      const newToday = getLocalToday()
      if (newToday !== today) {
        setToday(newToday)
        loadHabits()
      }
    }, 30000) // check every 30 seconds
    return () => clearInterval(interval)
  }, [today])

  // 清除动画状态
  useEffect(() => {
    if (animatingId) {
      const timer = setTimeout(() => setAnimatingId(null), 300)
      return () => clearTimeout(timer)
    }
  }, [animatingId])

  // 处理单次习惯打卡切换
  const handleToggleComplete = async (habitId: string, completed: boolean) => {
    await toggleHabitComplete(habitId, today, !completed)
  }

  // 处理多次习惯 +1
  const handleIncrement = async (habitId: string) => {
    setAnimatingId(habitId)
    await incrementHabitCount(habitId, today)
  }

  // 处理新建习惯
  const handleAddHabit = async () => {
    if (!newHabitTitle.trim()) return

    await addHabit({
      title: newHabitTitle.trim(),
      description: newHabitDescription.trim() || undefined,
      time_of_day: newHabitTime.trim() || undefined,
      frequency: 'daily',
      target: newHabitType === 'quantitative' ? newHabitTarget : 1,
      is_quantitative: newHabitType === 'quantitative' ? 1 : 0,
    })

    setShowAddModal(false)
    setNewHabitTitle('')
    setNewHabitDescription('')
    setNewHabitTime('')
    setNewHabitType('normal')
    setNewHabitTarget(8)
  }

  // 打开编辑弹窗
  const handleOpenEdit = (habit: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingHabit(habit)
    setEditHabitTitle(habit.title)
    setEditHabitDescription(habit.description || '')
    setEditHabitTime(habit.time_of_day || '')
    setShowEditModal(true)
  }

  // 处理编辑保存
  const handleEditHabit = async () => {
    if (!editHabitTitle.trim() || !editingHabit) return

    await updateHabit(editingHabit.id, {
      title: editHabitTitle.trim(),
      description: editHabitDescription.trim() || undefined,
      time_of_day: editHabitTime.trim() || undefined,
    })

    setShowEditModal(false)
    setEditingHabit(null)
    setEditHabitTitle('')
    setEditHabitDescription('')
    setEditHabitTime('')
  }

  // 打开删除确认
  const handleOpenDelete = (habitId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteHabitId(habitId)
    setShowDeleteConfirm(true)
  }

  // 处理删除确认
  const handleConfirmDelete = async () => {
    if (!deleteHabitId) return
    await removeHabit(deleteHabitId)
    setShowDeleteConfirm(false)
    setDeleteHabitId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false)
    setDeleteHabitId(null)
  }

  // 获取周几的显示文本
  const getWeekDayText = (index: number) => {
    return isZh ? WEEK_DAYS[index] : WEEK_DAYS_EN[index]
  }

  // 检查指定日期是否已打卡
  const isDayCompleted = (habit: any, dayIndex: number) => {
    const now = new Date()
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1)) // 本周一
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + dayIndex)
    const dateStr = date.toISOString().split('T')[0]
    const count = habit.weekRecords[dateStr] || 0
    return count >= habit.target
  }

  // 处理点击标题进入详情页
  const handleHabitClick = async (habitId: string) => {
    await loadHabitById(habitId)
    setView('habit-detail')
  }

  // 渲染环形进度
  const renderProgressRing = (todayCount: number, target: number) => {
    const radius = 20
    const circumference = 2 * Math.PI * radius // 125.6
    const progress = Math.min(todayCount / target, 1)
    const dashOffset = circumference * (1 - progress)

    return (
      <div className="quantifiable-indicator">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
          />
          <circle
            className="progress-ring-circle"
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="indicator-text">{todayCount}/{target}</div>
      </div>
    )
  }

  // 渲染每日小方块
  const renderDailySlots = (todayCount: number, target: number) => {
    return (
      <div className="daily-slots">
        {Array.from({ length: target }).map((_, i) => (
          <div
            key={i}
            className={`slot ${i < todayCount ? 'filled' : ''}`}
          />
        ))}
      </div>
    )
  }

  return (
    <main className="main-content">
      {/* 页面标题 */}
      <div className="page-header">
        <h1 className="page-title">
          {isZh ? '习惯' : 'Habits'}
        </h1>
        <div className="page-subtitle">
          {isZh ? '日常习惯与连续打卡' : 'Daily Routines & Streaks'}
        </div>
      </div>

      {/* 习惯列表 */}
      <div className="habit-list">
        {habits.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '6rem 2rem',
            color: 'var(--muted-foreground)',
            fontStyle: 'italic',
            fontSize: '1.1rem'
          }}>
            {isZh ? '还没有添加任何习惯，点击右下角按钮开始建立好习惯吧' : 'No habits yet. Click the button below to start building good habits.'}
          </div>
        ) : (
          habits.map(habit => {
            const isQuantitative = habit.is_quantitative === 1
            const target = habit.target || 1
            const todayCount = habit.todayCount || 0

            return (
              <div key={habit.id} className="habit-card">
                {isQuantitative ? (
                  // 多次习惯
                  <>
                    <div
                      className={`task-checkbox ${animatingId === habit.id || habit.completedToday ? 'checked' : ''}`}
                      onClick={() => handleIncrement(habit.id)}
                    >
                      {(animatingId === habit.id || habit.completedToday) && <Check size={14} />}
                    </div>
                    <div className="habit-content">
                      <button
                        className="habit-title-link"
                        onClick={() => handleHabitClick(habit.id)}
                      >
                        {habit.title}
                      </button>
                      <div className="habit-meta">
                        <span>{isZh ? `连续: ${habit.streak} 天` : `Streak: ${habit.streak} Days`}</span>
                        <span className="habit-meta-dot"></span>
                        <span>
                          {isZh ? `目标: ${target} 次/天` : `Target: ${target} Daily`}
                        </span>
                      </div>
                      {renderDailySlots(todayCount, target)}
                    </div>
                    <div className="habit-actions">
                      <button
                        className="habit-action-btn"
                        onClick={(e) => handleOpenEdit(habit, e)}
                        title={isZh ? '编辑' : 'Edit'}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="habit-action-btn delete"
                        onClick={(e) => handleOpenDelete(habit.id, e)}
                        title={isZh ? '删除' : 'Delete'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                ) : (
                  // 单次习惯
                  <>
                    <div
                      className={`task-checkbox ${habit.completedToday ? 'checked' : ''}`}
                      onClick={() => handleToggleComplete(habit.id, habit.completedToday)}
                    >
                      {habit.completedToday && <Check size={14} />}
                    </div>
                    <div className="habit-content">
                      <button
                        className="habit-title-link"
                        onClick={() => handleHabitClick(habit.id)}
                      >
                        {habit.title}
                      </button>
                      <div className="habit-meta">
                        <span>{isZh ? `连续: ${habit.streak} 天` : `Streak: ${habit.streak} Days`}</span>
                        <span className="habit-meta-dot"></span>
                        <span>
                          {habit.frequency === 'daily' ? (isZh ? '每天' : 'Daily') : (isZh ? '每周' : 'Weekly')}
                          {habit.time_of_day && `, ${habit.time_of_day}`}
                        </span>
                      </div>
                    </div>
                    <div className="habit-actions">
                      <button
                        className="habit-action-btn"
                        onClick={(e) => handleOpenEdit(habit, e)}
                        title={isZh ? '编辑' : 'Edit'}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="habit-action-btn delete"
                        onClick={(e) => handleOpenDelete(habit.id, e)}
                        title={isZh ? '删除' : 'Delete'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
                <div className="habit-progress">
                  {WEEK_DAYS.map((_, index) => {
                    const completed = isDayCompleted(habit, index)
                    const isCurrent = index === currentDayIndex
                    return (
                      <div
                        key={index}
                        className={`habit-day ${completed ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                      >
                        {getWeekDayText(index)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 悬浮添加按钮 */}
      <button
        className="fab-button"
        onClick={() => setShowAddModal(true)}
      >
        <Plus size={14} />
      </button>

      {/* 新建习惯弹窗 */}
      {showAddModal && (
        <div className="habit-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="habit-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="habit-modal-title">
              {isZh ? '新建习惯' : 'New Habit'}
            </h3>

            <div className="habit-modal-form-group">
              <label className="habit-modal-label">
                {isZh ? '习惯名称' : 'Habit Name'}
              </label>
              <input
                type="text"
                className="habit-modal-input"
                placeholder={isZh ? '例如：晨间冥想 15 分钟' : 'e.g. Morning Meditation 15min'}
                value={newHabitTitle}
                onChange={e => setNewHabitTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="habit-modal-form-group">
              <label className="habit-modal-label">
                {isZh ? '描述（可选）' : 'Description (Optional)'}
              </label>
              <input
                type="text"
                className="habit-modal-input"
                placeholder={isZh ? '简单描述这个习惯' : 'Brief description of the habit'}
                value={newHabitDescription}
                onChange={e => setNewHabitDescription(e.target.value)}
              />
            </div>

            <div className="habit-modal-form-group">
              <label className="habit-modal-label">
                {isZh ? '时间（可选）' : 'Time (Optional)'}
              </label>
              <input
                type="text"
                className="habit-modal-input"
                placeholder={isZh ? '例如：早上 / 晚上' : 'e.g. Morning / Evening'}
                value={newHabitTime}
                onChange={e => setNewHabitTime(e.target.value)}
              />
            </div>

            <div className="habit-modal-form-group">
              <label className="habit-modal-label">
                {isZh ? '习惯类型' : 'Habit Type'}
              </label>
              <div className="habit-type-toggle">
                <label className={`habit-type-option ${newHabitType === 'normal' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="habitType"
                    value="normal"
                    checked={newHabitType === 'normal'}
                    onChange={() => setNewHabitType('normal')}
                  />
                  {isZh ? '单次习惯' : 'Single'}
                </label>
                <label className={`habit-type-option ${newHabitType === 'quantitative' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="habitType"
                    value="quantitative"
                    checked={newHabitType === 'quantitative'}
                    onChange={() => setNewHabitType('quantitative')}
                  />
                  {isZh ? '多次习惯' : 'Multiple'}
                </label>
              </div>
            </div>

            {newHabitType === 'quantitative' && (
              <div className="habit-modal-form-group">
                <label className="habit-modal-label">
                  {isZh ? '每日目标次数' : 'Daily Target'}
                </label>
                <input
                  type="number"
                  className="habit-modal-input"
                  min="2"
                  value={newHabitTarget}
                  onChange={e => setNewHabitTarget(parseInt(e.target.value) || 1)}
                />
              </div>
            )}

            <div className="habit-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowAddModal(false)}
              >
                {t.cancel}
              </button>
              <button
                className="btn-primary"
                onClick={handleAddHabit}
              >
                {t.create}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑习惯弹窗 */}
      {showEditModal && (
        <div className="habit-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="habit-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="habit-modal-title">
              {isZh ? '编辑习惯' : 'Edit Habit'}
            </h3>

            <div className="habit-modal-form-group">
              <label className="habit-modal-label">
                {isZh ? '习惯名称' : 'Habit Name'}
              </label>
              <input
                type="text"
                className="habit-modal-input"
                placeholder={isZh ? '例如：晨间冥想 15 分钟' : 'e.g. Morning Meditation 15min'}
                value={editHabitTitle}
                onChange={e => setEditHabitTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="habit-modal-form-group">
              <label className="habit-modal-label">
                {isZh ? '描述（可选）' : 'Description (Optional)'}
              </label>
              <input
                type="text"
                className="habit-modal-input"
                placeholder={isZh ? '简单描述这个习惯' : 'Brief description of the habit'}
                value={editHabitDescription}
                onChange={e => setEditHabitDescription(e.target.value)}
              />
            </div>

            <div className="habit-modal-form-group">
              <label className="habit-modal-label">
                {isZh ? '时间（可选）' : 'Time (Optional)'}
              </label>
              <input
                type="text"
                className="habit-modal-input"
                placeholder={isZh ? '例如：早上 / 晚上' : 'e.g. Morning / Evening'}
                value={editHabitTime}
                onChange={e => setEditHabitTime(e.target.value)}
              />
            </div>

            <div className="habit-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                {t.cancel}
              </button>
              <button
                className="btn-primary"
                onClick={handleEditHabit}
              >
                {isZh ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="habit-modal-overlay" onClick={handleCancelDelete}>
          <div className="habit-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="habit-modal-title">
              {isZh ? '确认删除' : 'Confirm Delete'}
            </h3>
            <p style={{ marginBottom: '1.5rem', color: 'var(--muted-foreground)' }}>
              {isZh ? '确定要删除这个习惯吗？此操作无法撤销。' : 'Are you sure you want to delete this habit? This action cannot be undone.'}
            </p>
            <div className="habit-modal-actions">
              <button
                className="btn-secondary"
                onClick={handleCancelDelete}
              >
                {t.cancel}
              </button>
              <button
                className="btn-danger"
                onClick={handleConfirmDelete}
              >
                {isZh ? '删除' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}