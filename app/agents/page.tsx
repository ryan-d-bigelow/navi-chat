'use client'

import { SidebarNav } from '@/components/chat/sidebar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { AgentInfo } from '@/lib/agents'
import { RefreshCw, Terminal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_INTERVAL = 10_000

interface LogLine {
  type: 'log' | 'thinking' | 'error'
  content: string
  timestamp: number
}

function timeElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function StatusBadge({ status }: { status: AgentInfo['status'] }) {
  const config = {
    running: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    idle: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    done: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  } as const

  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${config[status]}`}
    >
      {status}
    </Badge>
  )
}

function AgentCard({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentInfo
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-200'
      }`}
    >
      <div className="flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate text-sm font-medium">{agent.name}</span>
        <StatusBadge status={agent.status} />
      </div>
      <p className="mt-1 truncate text-xs text-zinc-500">{agent.task}</p>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
        {agent.model && <span>{agent.model}</span>}
        <span>{timeElapsed(agent.startedAt)}</span>
        {agent.pid > 0 && <span>PID {agent.pid}</span>}
      </div>
    </button>
  )
}

function LogViewer({ agentId }: { agentId: string }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [paused, setPaused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const es = new EventSource(`/api/agents/${encodeURIComponent(agentId)}/logs`)

    es.onmessage = (event) => {
      try {
        const line: LogLine = JSON.parse(event.data)
        setLines((prev) => {
          const next = [...prev, line]
          // Keep last 2000 lines max
          return next.length > 2000 ? next.slice(-2000) : next
        })
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      // EventSource will auto-reconnect
    }

    return () => {
      es.close()
    }
  }, [agentId])

  useEffect(() => {
    if (!paused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines, paused])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-xs font-medium text-zinc-400">Live Logs</span>
        <button
          onClick={() => setPaused((v) => !v)}
          className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
            paused
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400'
          }`}
        >
          {paused ? 'Paused' : 'Pause scroll'}
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-5"
      >
        {lines.length === 0 && (
          <p className="text-zinc-600">Waiting for log output...</p>
        )}
        {lines.map((line, i) => (
          <LogEntry key={i} line={line} />
        ))}
      </div>
    </div>
  )
}

function LogEntry({ line }: { line: LogLine }) {
  if (line.type === 'thinking') {
    return (
      <div className="text-purple-400">
        <span className="mr-1">{'\u{1F9E0}'}</span>
        {line.content}
      </div>
    )
  }
  if (line.type === 'error') {
    return <div className="text-red-400">{line.content}</div>
  }
  return <div className="text-zinc-400">{line.content}</div>
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const data: AgentInfo[] = await res.json()
        setAgents(data)
      }
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const selectedAgent = agents.find((a) => a.id === selectedId)

  return (
    <div className="flex h-dvh bg-zinc-900">
      {/* Left panel: agent list */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        <SidebarNav />
        <Separator className="bg-zinc-800" />
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-xs font-medium text-zinc-400">Active Agents</h2>
          <button
            onClick={() => {
              setLoading(true)
              fetchAgents()
            }}
            aria-label="Refresh agents"
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <Separator className="bg-zinc-800" />
        <ScrollArea className="flex-1">
          <div className="p-2">
            {agents.length === 0 && !loading && (
              <div className="px-3 py-8 text-center">
                <Terminal className="mx-auto h-8 w-8 text-zinc-700" />
                <p className="mt-3 text-xs text-zinc-500">
                  No active coding agents.
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">
                  Spawn one from the chat.
                </p>
              </div>
            )}
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={agent.id === selectedId}
                onSelect={() => setSelectedId(agent.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right panel: log viewer */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <span className="text-lg" role="img" aria-label="Agents">
            {'\u{1F916}'}
          </span>
          <h1 className="text-sm font-medium text-zinc-200">Coding Agents</h1>
        </header>

        {selectedAgent ? (
          <LogViewer key={selectedAgent.id} agentId={selectedAgent.id} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Terminal className="mx-auto h-12 w-12 text-zinc-800" />
              <p className="mt-4 text-sm text-zinc-500">
                {agents.length > 0
                  ? 'Select an agent to view its logs'
                  : 'No active coding agents'}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
