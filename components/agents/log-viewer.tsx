'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ChevronDown, Wifi, WifiOff } from 'lucide-react'

const MAX_LOG_LINES = 5_000
const BOTTOM_THRESHOLD_PX = 64

export interface AgentLogTarget {
  id: string
  name: string
}

interface LogLine {
  type: 'log' | 'thinking' | 'error' | 'tool' | 'system'
  content: string
  timestamp: number
}

function isJsonLike(content: string): boolean {
  const trimmed = content.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed)
      return true
    } catch {
      return false
    }
  }
  return false
}

function InlineSyntax({ language, content }: { language: string; content: string }) {
  return (
    <SyntaxHighlighter
      language={language}
      style={oneDark}
      PreTag="span"
      CodeTag="span"
      wrapLongLines
      customStyle={{
        margin: 0,
        padding: 0,
        background: 'transparent',
        display: 'inline',
      }}
      codeTagProps={{
        style: {
          background: 'transparent',
          display: 'inline',
        },
      }}
    >
      {content}
    </SyntaxHighlighter>
  )
}

function LogEntry({ line }: { line: LogLine }) {
  const ts = new Date(line.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const tsEl = (
    <span
      className="mr-2 hidden shrink-0 select-none text-zinc-700 sm:inline"
      aria-hidden="true"
    >
      {ts}
    </span>
  )

  const content = (() => {
    if (line.type === 'tool') {
      return <InlineSyntax language="bash" content={line.content} />
    }
    if (isJsonLike(line.content)) {
      return <InlineSyntax language="json" content={line.content} />
    }
    return <span className="min-w-0 break-words">{line.content}</span>
  })()

  if (line.type === 'thinking') {
    return (
      <div className="flex min-w-0 text-purple-400/90" role="listitem">
        {tsEl}
        <span className="mr-1.5 select-none" aria-hidden="true">🧠</span>
        <span className="min-w-0 break-words">{content}</span>
      </div>
    )
  }
  if (line.type === 'error') {
    return (
      <div className="flex min-w-0 text-red-400" role="listitem">
        {tsEl}
        <span className="mr-1.5 select-none text-red-600" aria-hidden="true">✗</span>
        <span className="min-w-0 break-words">{content}</span>
      </div>
    )
  }
  if (line.type === 'tool') {
    return (
      <div className="flex min-w-0 text-amber-400/80" role="listitem">
        {tsEl}
        <span className="mr-1.5 select-none" aria-hidden="true">⚙</span>
        <span className="min-w-0 break-words">{content}</span>
      </div>
    )
  }
  if (line.type === 'system') {
    return (
      <div className="flex min-w-0 text-zinc-600 italic" role="listitem">
        {tsEl}
        <span className="min-w-0 break-words">{content}</span>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 text-zinc-400" role="listitem">
      {tsEl}
      <span className="min-w-0 break-words">{content}</span>
    </div>
  )
}

export function LogViewer({ agent }: { agent: AgentLogTarget }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)
  const [userScrolled, setUserScrolled] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)
  const atBottomRef = useRef(true)

  const isNearBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
    userScrolledRef.current = false
    setUserScrolled(false)
    atBottomRef.current = true
  }, [])

  const handleScroll = useCallback(() => {
    const near = isNearBottom()
    atBottomRef.current = near
    if (!near) {
      userScrolledRef.current = true
      setUserScrolled(true)
    } else {
      userScrolledRef.current = false
      setUserScrolled(false)
    }
  }, [isNearBottom])

  useLayoutEffect(() => {
    if (!userScrolledRef.current) {
      const el = containerRef.current
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
        atBottomRef.current = true
      }
    }
  }, [lines])

  useEffect(() => {
    const es = new EventSource(`/api/agents/${encodeURIComponent(agent.id)}/logs`)

    es.onopen = () => setConnected(true)

    es.onmessage = (event) => {
      try {
        const line: LogLine = JSON.parse(event.data)
        setLines((prev) => {
          const next = [...prev, line]
          return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
        })
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      setConnected(false)
    }

    return () => {
      es.close()
    }
  }, [agent.id])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 bg-zinc-950/50 px-3 py-2 sm:gap-3 sm:px-4">
        <span
          className="flex items-center gap-1.5 text-[10px]"
          role="status"
          aria-label={connected ? 'Connected — live streaming' : 'Connecting to log stream'}
        >
          {connected ? (
            <>
              <Wifi className="h-3 w-3 text-emerald-500" aria-hidden="true" />
              <span className="text-emerald-500">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-zinc-600" aria-hidden="true" />
              <span className="text-zinc-600">Connecting…</span>
            </>
          )}
        </span>

        <span className="text-[10px] text-zinc-600" aria-label={`${lines.length} log lines`}>
          {lines.length} lines
        </span>

        <div className="flex-1" />

        {userScrolled && (
          <button
            onClick={() => scrollToBottom(true)}
            aria-label="Scroll to latest log output"
            className="flex min-h-[44px] items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 focus-ring sm:min-h-0 sm:px-2 sm:py-1 sm:text-[10px]"
          >
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
            Scroll to bottom
          </button>
        )}

        {!userScrolled && (
          <span className="flex items-center gap-1 text-[10px] text-zinc-600" role="status">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
            Following
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          role="log"
          aria-label={`Log output for ${agent.name}`}
          aria-live="off"
          className="absolute inset-0 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-[1.6]"
          style={{ overflowAnchor: 'none' }}
        >
          {lines.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-zinc-700" role="status">Waiting for output…</p>
            </div>
          )}
          {lines.map((line, i) => (
            <LogEntry key={i} line={line} />
          ))}
          <div style={{ height: 0 }} />
        </div>

        {userScrolled && (
          <button
            onClick={() => scrollToBottom(true)}
            aria-label="Jump to latest log output"
            className="absolute bottom-4 left-1/2 z-10 flex min-h-[44px] -translate-x-1/2 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/90 px-4 py-2 text-xs font-medium text-zinc-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-zinc-700 focus-ring sm:min-h-0 sm:px-3 sm:py-1.5"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            Jump to bottom
          </button>
        )}
      </div>
    </div>
  )
}
