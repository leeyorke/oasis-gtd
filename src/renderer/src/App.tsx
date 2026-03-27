import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Layout from './components/Layout'
import NextActions from './views/NextActions'
import Projects from './views/Projects'
import Schedule from './views/Schedule'
import Habit from './views/Habit'
import Resource from './views/Resource'
import Archive from './views/Archive'
import WaitingFor from './views/WaitingFor'
import Someday from './views/Someday'
import WeeklyReview from './views/WeeklyReview'
import AIChat from './views/AIChat'
import Settings from './views/Settings'
import Start from './views/Start'

export default function App() {
  const { currentView, loadTasks, loadProjects, loadWaiting, loadSomeday, loadReview, loadProviders, loadConversations, loadSettings } = useStore()

  useEffect(() => {
    loadTasks()  // Load all tasks for dashboard view
    loadProjects()
    loadWaiting()
    loadSomeday()
    loadReview()
    loadProviders()
    loadConversations()
    loadSettings()
  }, [])

  const renderView = () => {
    switch (currentView) {
      case 'start':         return <Start />
      case 'next-actions':  return <NextActions />
      case 'projects':      return <Projects />
      case 'schedule':      return <Schedule />
      case 'habit':         return <Habit />
      case 'resource':      return <Resource />
      case 'archive':       return <Archive />
      case 'waiting':       return <WaitingFor />
      case 'someday':       return <Someday />
      case 'weekly-review': return <WeeklyReview />
      case 'ai-chat':       return <AIChat />
      case 'settings':      return <Settings />
      default:              return <NextActions />
    }
  }

  return <Layout>{renderView()}</Layout>
}
