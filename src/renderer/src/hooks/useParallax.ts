import { useEffect, useState } from 'react'

export function useParallax() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let rafId: number
    const handler = (e: MouseEvent) => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2
        const y = (e.clientY / window.innerHeight - 0.5) * 2
        setMouse({ x, y })
      })
    }
    if (window.innerWidth > 1024) {
      window.addEventListener('mousemove', handler)
    }
    return () => {
      window.removeEventListener('mousemove', handler)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return mouse
}
