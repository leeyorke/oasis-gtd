import { useState } from 'react'
import { useStore } from '../store/useStore'
import { ChevronLeft, ChevronRight, CalendarCheck, Sun, Sofa, CalendarDays, CalendarX, Clock } from 'lucide-react'

interface SetDateModalProps {
  onClose: () => void
  onSave: (date: string) => void
  initialDate?: string
}

export default function SetDateModal({ onClose, onSave, initialDate }: SetDateModalProps) {
  const { settings } = useStore()
  const isZh = settings.language === 'zh'

  // Parse initial date or use current date
  const initial = initialDate ? new Date(initialDate) : new Date()
  const [selectedDate, setSelectedDate] = useState<Date>(initial)
  const [selectedTime, setSelectedTime] = useState(initialDate ? initial.toTimeString().slice(0, 5) : '09:00')
  const [currentMonth, setCurrentMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))

  const weekDays = isZh ? ['日', '一', '二', '三', '四', '五', '六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const getQuickDates = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const weekend = new Date(today)
    const dayOfWeek = today.getDay()
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7
    weekend.setDate(today.getDate() + daysUntilSaturday)
    const nextWeek = new Date(today)
    nextWeek.setDate(today.getDate() + (7 - dayOfWeek + 1) % 7 + 7)

    return [
      { label: isZh ? '今天' : 'Today', date: today, icon: CalendarCheck, shortcut: weekDays[today.getDay()] },
      { label: isZh ? '明天' : 'Tomorrow', date: tomorrow, icon: Sun, shortcut: weekDays[tomorrow.getDay()] },
      { label: isZh ? '本周末' : 'Weekend', date: weekend, icon: Sofa, shortcut: weekDays[weekend.getDay()] },
      { label: isZh ? '下周' : 'Next Week', date: nextWeek, icon: CalendarDays, shortcut: weekDays[nextWeek.getDay()] },
    ]
  }

  const getCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const days: Array<{ date: Date | null; isCurrentMonth: boolean }> = []

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true })
    }

    // Next month days
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    }

    return days
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isSelected = (date: Date) => {
    return date.toDateString() === selectedDate.toDateString()
  }

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long' })
  }

  const handleSave = () => {
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    onSave(`${dateStr}T${selectedTime}:00.000Z`)
  }

  const handleQuickDate = (date: Date) => {
    setSelectedDate(date)
  }

  const handleDayClick = (date: Date) => {
    setSelectedDate(date)
  }

  const handleClear = () => {
    onSave('')
  }

  const quickDates = getQuickDates()
  const calendarDays = getCalendarDays()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="set-date-overlay" onClick={() => onClose()}>
      <div className="set-date-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="set-date-header">
          <div className="back-btn" data-media-type="banani-button" onClick={() => onClose()}>
            <ChevronLeft size={16} />
          </div>
          <div className="header-label">{isZh ? '设置日期与时间' : 'Set Date & Time'}</div>
          <div style={{ width: '28px' }}></div>
        </div>

        {/* Content Split */}
        <div className="modal-content-split">
          {/* Quick Dates */}
          <div className="quick-dates">
            {quickDates.map((item, idx) => (
              <div
                key={idx}
                className={`quick-date-btn ${isSelected(item.date) ? 'active' : ''}`}
                data-media-type="banani-button"
                onClick={() => handleQuickDate(item.date)}
              >
                <item.icon size={16} />
                {item.label}
                <span className="shortcut">{item.shortcut}</span>
              </div>
            ))}

            <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '8px 0' }}></div>

            <div
              className="quick-date-btn"
              data-media-type="banani-button"
              onClick={handleClear}
            >
              <CalendarX size={16} />
              {isZh ? '无日期' : 'No Date'}
            </div>
          </div>

          {/* Calendar View */}
          <div className="calendar-section">
            <div className="calendar-header">
              <div className="month-title">{formatMonthYear(currentMonth)}</div>
              <div className="calendar-nav">
                <div
                  className="nav-btn"
                  data-media-type="banani-button"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                >
                  <ChevronLeft size={14} />
                </div>
                <div
                  className="nav-btn"
                  data-media-type="banani-button"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                >
                  <ChevronRight size={14} />
                </div>
              </div>
            </div>

            <div className="calendar-grid">
              {weekDays.map((day, idx) => (
                <div key={idx} className="day-name">{day}</div>
              ))}
              {calendarDays.map((item, idx) => (
                <div
                  key={idx}
                  className={`day-cell ${!item.isCurrentMonth ? 'muted' : ''} ${isToday(item.date!) ? 'today' : ''} ${isSelected(item.date!) ? 'active' : ''}`}
                  data-media-type="banani-button"
                  onClick={() => item.date && handleDayClick(item.date)}
                >
                  {item.date?.getDate()}
                </div>
              ))}
            </div>

            <div className="time-section">
              <div className="time-label">
                <Clock size={16} style={{ color: 'var(--muted-foreground)' }} />
                {isZh ? '时间 (可选)' : 'Time (optional)'}
              </div>
              <input
                type="time"
                className="time-input"
                value={selectedTime}
                onChange={e => setSelectedTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="set-date-footer">
          <div className="btn btn-ghost" data-media-type="banani-button" onClick={handleClear}>
            {isZh ? '清除日期' : 'Clear Date'}
          </div>
          <div className="btn btn-primary" data-media-type="banani-button" onClick={handleSave}>
            {isZh ? '保存' : 'Save'}
          </div>
        </div>
      </div>
    </div>
  )
}
