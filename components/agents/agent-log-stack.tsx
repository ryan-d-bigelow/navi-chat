'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import type { AgentInfo } from '@/lib/agents'

const MAX_LOG_LINES = 600
const PREVIEW_LINES = 60

interface LogLine {
  type: 'log' | 'thinking' | 'error' | 'tool' | 'system'
  content: string
  timestamp: number
}

function statusColor(status: AgentInfo['status']): string {
  if (status === 'running') return 'bg-emerald-400'
  if (status === 'idle') return 'bg-amber-400'
  return 'bg-zinc-500'
}

function typeClass(type: LogLine['type']): string {
  if (type === 'error') return 'text-red-400'
  if (type === 'thinking') return 'text-purple-400/90'
  if (type === 'tool') return 'text-amber-400/80'
  if (type === 'system') return 'text-zinc-500 italic'
  return 'text-zinc-300'
}

function formatLatest(line?: LogLine): string {
  if (!line) return 'Waiting for output…'
  const trimmed = line.content.trim()
  if (!trimmed) return 'Waiting for output…'
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed
}

function AgentLogCard({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentInfo
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  }, [lines])

  const preview = useMemo(() => lines.slice(-PREVIEW_LINES), [lines])
  const latest = preview.at(-1)

  return (
    <section
      className={`rounded-xl border border-zinc-800/80 bg-zinc-950/70 shadow-sm transition-colors ${
        isSelected ? 'ring-1 ring-emerald-500/60' : 'hover:border-zinc-700'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(agent.id)}
        className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left focus-ring"
        aria-pressed={isSelected}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${statusColor(agent.status)}`} aria-hidden="true" />
          <span className="text-xs font-semibold text-zinc-200">{agent.name}</span>
          {agent.ticket?.id && (
            <span className="rounded-full border border-emerald-700/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              {agent.ticket.id}
            </span>
          )}
          {agent.pid > 0 && (
            <span className="text-[10px] text-zinc-600">PID {agent.pid}</span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600">
            {connected ? (
              <>
                <Wifi className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                Connecting…
              </>
            )}
          </span>
        </div>
        <p className="text-[11px] text-zinc-500" title={latest?.content ?? ''}>
          {formatLatest(latest)}
        </p>
      </button>

      <div
        ref={containerRef}
        className="max-h-44 min-h-[120px] overflow-y-auto border-t border-zinc-900 px-3 py-2 font-mono text-[11px] leading-[1.6]"
        role="log"
        aria-label={`Latest logs for ${agent.name}`}
        aria-live="off"
        style={{ overflowAnchor: 'none' }}
      >
        {preview.length === 0 && (
          <p className="text-zinc-700" role="status">Waiting for output…</p>
        )}
        {preview.map((line, index) => (
          <div key={`${line.timestamp}-${index}`} className={typeClass(line.type)}>
            {line.content}
          </div>
        ))}
      </div>
    </section>
  )
}

export function AgentLogStack({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: AgentInfo[]
  selectedAgentId: string | null
  onSelect: (id: string) => void
}) {
  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        No active agents.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {agents.map((agent) => (
        <AgentLogCard
          key={agent.id}
          agent={agent}
          isSelected={selectedAgentId === agent.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
