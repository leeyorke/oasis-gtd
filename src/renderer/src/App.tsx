import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Layout from './components/Layout'
import NextActions from './views/NextActions'
import Projects from './views/Projects'
import WaitingFor from './views/WaitingFor'
import Someday from './views/Someday'
import WeeklyReview from './views/WeeklyReview'
import AIChat from './views/AIChat'
import Settings from './views/Settings'
import Dashboard from './views/Dashboard'

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
      case 'next-actions':  return <NextActions />
      case 'projects':      return <Projects />
      case 'waiting':       return <WaitingFor />
      case 'someday':       return <Someday />
      case 'weekly-review': return <WeeklyReview />
      case 'ai-chat':       return <AIChat />
      case 'settings':      return <Settings />
      case 'dashboard':     return <Dashboard />
      default:              return <NextActions />
    }
  }

  return <Layout>{renderView()}</Layout>
}
