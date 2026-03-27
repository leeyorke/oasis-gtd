import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useT'

type Bucket = 'next' | 'next-actions' | 'inbox' | 'project' | 'schedule' | 'wait' | 'habit' | 'someday' | 'resource' | 'archive'

const BUCKET_LABELS: Record<Bucket, { en: string; zh: string }> = {
  next: { en: 'Do It Now', zh: '立即做' },
  'next-actions': { en: 'Next Actions', zh: '下一步行动' },
  inbox: { en: 'Inbox', zh: '收件箱' },
  project: { en: 'Project', zh: '项目' },
  schedule: { en: 'Schedule', zh: '日程' },
  wait: { en: 'Wait', zh: '等待' },
  habit: { en: 'Habit', zh: '习惯' },
  someday: { en: 'Someday', zh: '将来做' },
  resource: { en: 'Resource', zh: '资源' },
  archive: { en: 'Archive', zh: '归档' },
}

export default function Start() {
  const [text, setText] = useState('')
  const [bucket, setBucket] = useState<Bucket>('inbox')
  const [isHovering, setIsHovering] = useState(false)
  const [shake, setShake] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addTask, settings } = useStore()
  const t = useT()
  const isZh = settings.language === 'zh'

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const xAxis = (window.innerWidth / 2 - e.pageX) / 45
    const yAxis = (window.innerHeight / 2 - e.pageY) / 45
    setMousePos({ x: xAxis, y: yAxis })
  }

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 })
  }

  const handleCapture = async () => {
    if (!text.trim()) {
      setErrorMessage('输入不能为空')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }
    if (bucket === 'inbox') {
      setErrorMessage('请选择标签')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }
    setErrorMessage('')
    await addTask({ title: text.trim(), status: bucket as any })
    setText('')
    setBucket('inbox')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCapture()
  }

  const buckets: Bucket[] = ['next', 'next-actions', 'project', 'schedule', 'wait', 'habit', 'someday', 'resource']

  return (
    <div
      className="flex-1 flex items-center justify-center relative perspective-container"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Noise overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          opacity: 0.05,
          mixBlendMode: 'multiply',
        }}
      />

      <div
        ref={cardRef}
        className={`w-[520px] h-[680px] relative flex flex-col ${shake ? 'animate-shake' : ''}`}
        style={{
          background: '#EBE7E0',
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.15), 0 10px 20px -5px rgba(0, 0, 0, 0.1)',
          borderRadius: '2px',
          transform: shake ? undefined : `rotateY(${mousePos.x}deg) rotateX(${mousePos.y}deg)`,
          transition: 'transform 0.1s ease-out',
        }}
      >
        {/* Paper noise */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            opacity: 0.03,
            borderRadius: 'inherit',
          }}
        />

        {/* Embossed text on right */}
        <div className="absolute right-6 top-0 bottom-0 flex items-center justify-center pointer-events-none select-none z-0">
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '110px',
              fontStyle: 'italic',
              fontWeight: 300,
              letterSpacing: '0.1em',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              color: '#E8E6E1',
              textShadow: '1px 1px 0px rgba(255, 255, 255, 0.8), -1px -1px 0px rgba(0, 0, 0, 0.03)',
              opacity: 0.7,
            }}
          >
            capture
          </span>
        </div>

        {/* Paperclip SVG */}
        <svg className="paperclip" viewBox="0 0 32 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'rotate(-4deg)' }}>
          <path d="M16 94C10.4772 94 6 89.5228 6 84V26C6 18.268 12.268 12 20 12C27.732 12 34 18.268 34 26V78C34 81.3137 31.3137 84 28 84C24.6863 84 22 81.3137 22 78V30C22 28.8954 21.1046 28 20 28C18.8954 28 18 28.8954 18 30V78C18 83.5228 22.4772 88 28 88C33.5228 88 38 83.5228 38 78V26C38 16.0589 29.9411 8 20 8C10.0589 8 2 16.0589 2 26V84C2 91.732 8.268 98 16 98C23.732 98 30 91.732 30 84V30" stroke="#1A1C20" strokeWidth="2" strokeLinecap="round"/>
        </svg>

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-16 pt-20">
          <header className="mb-10">
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '32px',
                color: '#2A2927',
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {t.capture_title}
            </h2>
          </header>

          <div
            className="flex-1 flex flex-col relative group"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <textarea
              ref={textareaRef}
              className="w-full flex-1 bg-transparent resize-none outline-none capture-input"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '16px',
                color: '#2A2927',
                lineHeight: 1.4,
                zIndex: 10,
              }}
              placeholder={t.capture_placeholder}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setErrorMessage('')
              }}
              onKeyDown={handleKeyDown}
            />
            {errorMessage && (
              <div className="text-xs mt-2" style={{ color: '#a83232', fontWeight: 500 }}>
                {errorMessage}
              </div>
            )}
            <div
              className="absolute bottom-4 left-0 right-12 h-[1px] bg-[#D6D2CB]/50 origin-left"
              style={{
                transform: isHovering ? 'scaleX(1)' : 'scaleX(0)',
                transition: 'transform 0.5s ease-out',
              }}
            />
          </div>

          <footer className="mt-8 pt-6 border-t border-[#D6D2CB] flex flex-col gap-6">
            <div className="flex flex-wrap gap-2 max-w-[360px]">
              {buckets.map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setBucket(b)
                    setErrorMessage('')
                  }}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '10px',
                    padding: '4px 8px',
                    border: '1px solid transparent',
                    borderRadius: '0px',
                    color: bucket === b ? '#F4F3EF' : '#5C5954',
                    background: bucket === b ? '#2A2927' : 'transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {BUCKET_LABELS[b][isZh ? 'zh' : 'en']}
                </button>
              ))}
            </div>

            <div className="flex">
              <button
                onClick={handleCapture}
                style={{
                  background: '#2A2927',
                  color: '#F4F3EF',
                  padding: '16px 32px',
                  borderRadius: '0px',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }}
              >
                保存
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}