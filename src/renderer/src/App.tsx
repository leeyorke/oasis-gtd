import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Layout from './components/Layout'
import NextActions from './views/NextActions'
import Projects from './views/Projects'
import Schedule from './views/Schedule'
import Habit from './views/Habit'
import HabitDetail from './views/HabitDetail'
import Pomodoro from './views/Pomodoro'
import Resource from './views/Resource'
import Archive from './views/Archive'
import WaitingFor from './views/WaitingFor'
import Someday from './views/Someday'
import WeeklyReview from './views/WeeklyReview'
import AIChat from './views/AIChat'
import Settings from './views/Settings'
import Start from './views/Start'
import Thoughts from './views/Thoughts'
import Kanban from './views/Kanban'
import QuickCaptureWindow from './QuickCaptureWindow'
import DailyReminder from './views/DailyReminder'

// Match a KeyboardEvent against a stored shortcut string like "Ctrl+\" or "Ctrl+N"
function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+')
  const key = parts.pop()!
  const ctrl = parts.includes('Ctrl')
  const alt = parts.includes('Alt')
  const shift = parts.includes('Shift')
  const meta = parts.includes('Cmd')
  return (
    e.ctrlKey === ctrl &&
    e.altKey === alt &&
    e.shiftKey === shift &&
    e.metaKey === meta &&
    (e.key === key || e.key.toUpperCase() === key.toUpperCase())
  )
}

export default function App() {
  // Quick-capture mode: standalone window for quick thought entry
  if (window.location.hash === '#quick-capture') {
    return <QuickCaptureWindow />
  }

  const { currentView, loadTasks, loadProjects, loadWaiting, loadSomeday, loadNotes, loadHabits, loadReview, loadProviders, loadConversations, loadSettings, loadLastReminderDate, checkReminderScheduled, showReminder } = useStore()
  const shortcuts = useStore(s => s.settings.shortcuts)
  const toggleSidebar = useStore(s => s.toggleSidebar)
  const setView = useStore(s => s.setView)
  const setShowAddThought = useStore(s => s.setShowAddThought)

  useEffect(() => {
    const init = async () => {
      // Load all data the reminder page needs FIRST so stats are accurate
      // by the time the reminder mounts.
      await Promise.all([
        loadTasks(),
        loadHabits(),
        loadNotes(),
      ])
      // Then trigger the reminder (sets showReminder=true).
      loadLastReminderDate()

      // Remaining loads can happen in the background.
      loadProjects()
      loadWaiting()
      loadSomeday()
      loadReview()
      loadProviders()
      loadConversations()
      loadSettings()
    }
    init()
  }, [])

  // 8:00 AM daily reminder check — only if not dismissed today
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      if (now.getHours() === 8 && now.getMinutes() === 0) {
        checkReminderScheduled()
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Pick up data written by an external agent. The MCP server writes straight
  // into the database file, so the app's in-memory lists would otherwise stay
  // stale. A cheap signature tells us when something moved; the focus and
  // visibility listeners cover the "the app was in the background" case
  // without waiting for the next poll.
  useEffect(() => {
    let lastStamp = ''
    let stopped = false

    const reload = async (): Promise<void> => {
      try {
        const stamp = await window.api.getDataStamp()
        if (stopped) return
        // The first call only establishes the baseline — the app already
        // loaded everything on startup.
        if (lastStamp !== '' && stamp !== lastStamp) {
          await Promise.all([
            loadTasks(),
            loadProjects(),
            loadWaiting(),
            loadSomeday(),
            loadNotes()
          ])
        }
        lastStamp = stamp
      } catch {
        /* the database may not be ready yet — try again on the next tick */
      }
    }

    const onFocus = (): void => { void reload() }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => { void reload() }, 5000)
    void reload()

    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadTasks, loadProjects, loadWaiting, loadSomeday, loadNotes])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const [action, shortcut] of Object.entries(shortcuts)) {
        if (!matchShortcut(e, shortcut)) continue
        e.preventDefault()
        if (action === 'toggleSidebar') toggleSidebar()
        else if (action === 'newThought') {
          setView('thoughts')
          setShowAddThought(true)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts, toggleSidebar, setView, setShowAddThought])

  const renderView = () => {
    switch (currentView) {
      case 'start':         return <Start />
      case 'next-actions':  return <NextActions />
      case 'projects':      return <Projects />
      case 'kanban':        return <Kanban />
      case 'schedule':      return <Schedule />
      case 'habit':         return <Habit />
      case 'habit-detail':  return <HabitDetail />
      case 'pomodoro':      return <Pomodoro />
      case 'resource':      return <Resource />
      case 'archive':       return <Archive />
      case 'waiting':       return <WaitingFor />
      case 'someday':       return <Someday />
      case 'thoughts':      return <Thoughts />
      case 'weekly-review': return <WeeklyReview />
      case 'ai-chat':       return <AIChat />
      case 'settings':      return <Settings />
      default:              return <NextActions />
    }
  }

  return (
    <>
      {showReminder && <DailyReminder />}
      <Layout>{renderView()}</Layout>
    </>
  )
}
