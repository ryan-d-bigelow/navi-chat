'use client'

import { ChevronDown, FileText, Wifi, WifiOff, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const MAX_LINES = 5_000
const BOTTOM_THRESHOLD_PX = 64

interface AgentLogLine {
  content: string
  timestamp: number
  done?: boolean
}

function LogLineEntry({ line }: { line: AgentLogLine }) {
  const ts = new Date(line.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  // Classify line content for coloring
  const lower = line.content.toLowerCase()
  let colorClass = 'text-zinc-400'
  if (lower.includes('error') || lower.includes('fatal') || lower.startsWith('✗')) {
    colorClass = 'text-red-400'
  } else if (lower.includes('warn')) {
    colorClass = 'text-amber-400'
  } else if (line.content.startsWith('[') && line.content.includes(']')) {
    colorClass = 'text-zinc-500'
  }

  if (line.done) {
    return (
      <div className="flex min-w-0 text-zinc-600 italic" role="listitem">
        <span className="mr-2 hidden shrink-0 select-none text-zinc-700 sm:inline" aria-hidden="true">{ts}</span>
        <span className="min-w-0 break-words">{line.content}</span>
      </div>
    )
  }

  return (
    <div className={`flex min-w-0 ${colorClass}`} role="listitem">
      <span className="mr-2 hidden shrink-0 select-none text-zinc-700 sm:inline" aria-hidden="true">{ts}</span>
      <span className="min-w-0 break-words">{line.content}</span>
    </div>
  )
}

export function AgentLogViewer({
  ticket,
  onClose,
}: {
  ticket: number
  onClose?: () => void
}) {
  const [lines, setLines] = useState<AgentLogLine[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userScrolled, setUserScrolled] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)
  const atBottomRef = useRef(true)

  // ── Scroll helpers ──────────────────────────────────────────────────────

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

  // ── Auto-scroll on new lines ────────────────────────────────────────────

  useLayoutEffect(() => {
    if (!userScrolledRef.current) {
      const el = containerRef.current
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
        atBottomRef.current = true
      }
    }
  }, [lines])

  // ── SSE connection ──────────────────────────────────────────────────────

  useEffect(() => {
    setLines([])
    setError(null)
    setConnected(false)

    const es = new EventSource(`/api/agent-logs/${ticket}`)

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    es.onmessage = (event) => {
      try {
        const line: AgentLogLine = JSON.parse(event.data)
        if (line.done) {
          setConnected(false)
        }
        setLines((prev) => {
          const next = [...prev, line]
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
        })
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      setConnected(false)
      // EventSource auto-reconnects; if the server returns 404,
      // the browser will fire onerror repeatedly. Detect and show error.
      if (es.readyState === EventSource.CLOSED) {
        setError(`Failed to connect — log file for NAV-${ticket} may not exist`)
        es.close()
      }
    }

    return () => {
      es.close()
    }
  }, [ticket])

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950" style={{ maxHeight: 400 }}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 bg-zinc-900/80 px-3 py-2">
        <FileText className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
        <span className="text-xs font-semibold text-zinc-300">
          NAV-{ticket} — Live Log
        </span>

        <div className="flex-1" />

        {/* Connection status */}
        <span className="flex items-center gap-1.5 text-[10px]" role="status">
          {connected ? (
            <>
              <Wifi className="h-3 w-3 text-emerald-500" aria-hidden="true" />
              <span className="text-emerald-500">Live</span>
            </>
          ) : error ? (
            <>
              <WifiOff className="h-3 w-3 text-red-500" aria-hidden="true" />
              <span className="text-red-500">Error</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-zinc-600" aria-hidden="true" />
              <span className="text-zinc-600">Connecting…</span>
            </>
          )}
        </span>

        <span className="text-[10px] text-zinc-600">{lines.length} lines</span>

        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close log viewer"
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Log content */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          role="log"
          aria-label={`Log output for NAV-${ticket}`}
          aria-live="off"
          className="h-full overflow-y-auto bg-zinc-950 p-3 font-mono text-xs leading-[1.6]"
          style={{ overflowAnchor: 'none', maxHeight: 352 }}
        >
          {error && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!error && lines.length === 0 && connected && (
            <div className="flex h-full items-center justify-center">
              <p className="text-zinc-700" role="status">Waiting for output…</p>
            </div>
          )}

          {!error && lines.length === 0 && !connected && (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-600" />
                <p className="text-zinc-600" role="status">Connecting to log stream…</p>
              </div>
            </div>
          )}

          {lines.map((line, i) => (
            <LogLineEntry key={i} line={line} />
          ))}
          <div style={{ height: 0 }} />
        </div>

        {userScrolled && (
          <button
            onClick={() => scrollToBottom(true)}
            aria-label="Jump to latest log output"
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/90 px-3 py-1.5 text-xs font-medium text-zinc-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-zinc-700 focus-ring"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            Jump to bottom
          </button>
        )}
      </div>
    </div>
  )
}
