'use client'

import { SidebarNav } from '@/components/chat/sidebar'
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav'
import { Separator } from '@/components/ui/separator'
import type { AgentInfo, AgentType } from '@/lib/agents'
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Clock,
  Cpu,
  Globe,
  Home,
  RefreshCw,
  Search,
  Terminal,
  Timer,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useMobileNav } from '@/app/context/mobile-nav-context'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 8_000
const MAX_LOG_LINES = 5_000
const BOTTOM_THRESHOLD_PX = 64

// ─── Agent type metadata ──────────────────────────────────────────────────────

const TYPE_META: Record<
  AgentType,
  { label: string; icon: React.ReactNode; color: string; dot: string }
> = {
  coder: {
    label: 'Coding Agent',
    icon: <Terminal className="h-3 w-3" aria-hidden="true" />,
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    dot: 'bg-sky-400',
  },
  researcher: {
    label: 'Researcher',
    icon: <Search className="h-3 w-3" aria-hidden="true" />,
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    dot: 'bg-violet-400',
  },
  home: {
    label: 'Home',
    icon: <Home className="h-3 w-3" aria-hidden="true" />,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  wevo: {
    label: 'Wevo',
    icon: <Zap className="h-3 w-3" aria-hidden="true" />,
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    dot: 'bg-orange-400',
  },
  browser: {
    label: 'Scout',
    icon: <Globe className="h-3 w-3" aria-hidden="true" />,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    dot: 'bg-cyan-400',
  },
  cron: {
    label: 'Cron Job',
    icon: <Timer className="h-3 w-3" aria-hidden="true" />,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    dot: 'bg-amber-400',
  },
  navi: {
    label: 'Navi',
    icon: <Bot className="h-3 w-3" aria-hidden="true" />,
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    dot: 'bg-teal-400',
  },
  slack: {
    label: 'Slack',
    icon: <Cpu className="h-3 w-3" aria-hidden="true" />,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    dot: 'bg-rose-400',
  },
  webchat: {
    label: 'Web Chat',
    icon: <Bot className="h-3 w-3" aria-hidden="true" />,
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    dot: 'bg-indigo-400',
  },
  process: {
    label: 'Process',
    icon: <Cpu className="h-3 w-3" aria-hidden="true" />,
    color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    dot: 'bg-zinc-400',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function getOriginLabel(agent: AgentInfo): string | null {
  if (agent.source === 'process') return 'Local Process'
  if (!agent.sessionKey) return null
  const parts = agent.sessionKey.split(':')
  if (parts[2] === 'cron') return 'Cron Job'
  if (parts[2] === 'slack') return 'Slack'
  if (parts[2] === 'openai') return 'Web Chat'
  if (parts[3] === 'thread') return 'Slack Thread'
  return agent.sessionKey
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogLine {
  type: 'log' | 'thinking' | 'error' | 'tool' | 'system'
  content: string
  timestamp: number
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: AgentInfo['status'] }) {
  const label = status === 'running' ? 'Running' : status === 'idle' ? 'Idle' : 'Done'
  if (status === 'running') {
    return (
      <span className="relative flex h-2 w-2 shrink-0" role="img" aria-label={label}>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
    )
  }
  if (status === 'idle') {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400/80" role="img" aria-label={label} />
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-600" role="img" aria-label={label} />
}

function TypeBadge({ agentType }: { agentType: AgentType }) {
  const meta = TYPE_META[agentType]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.color}`}
    >
      {meta.icon}
      {meta.label}
    </span>
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
  now: number
}) {
  const origin = getOriginLabel(agent)
  const ticket = agent.ticket
  const ticketUrl = ticket ? `https://linear.app/naviagent/issue/${ticket.id}` : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`${agent.name} — ${agent.status}, ${TYPE_META[agent.agentType].label}`}
      className={`group min-h-[64px] w-full rounded-lg border p-3 text-left transition-all focus-ring ${
        isSelected
          ? 'border-zinc-700 bg-zinc-800 shadow-sm'
          : 'border-transparent hover:border-zinc-800 hover:bg-zinc-800/40'
      }`}
    >
      {/* Row 1: status + name + badge */}
      <div className="flex items-center gap-2">
        <StatusDot status={agent.status} />
        <span className="flex-1 truncate text-sm font-medium text-zinc-200">
          {agent.name}
        </span>
        <TypeBadge agentType={agent.agentType} />
      </div>

      {/* Row 2: ticket */}
      {ticket && ticketUrl && (
        <a
          href={ticketUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="mt-1 flex min-h-[44px] items-center gap-2 text-xs text-cyan-300 transition-colors hover:text-cyan-200 focus-visible:outline-none sm:min-h-0"
          title={`${ticket.id}: ${ticket.title}`}
        >
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
            {ticket.id}
          </span>
          <span className="line-clamp-1 text-zinc-400">{ticket.title}</span>
        </a>
      )}

      {/* Row 2: task */}
      <p
        className={`line-clamp-1 text-xs leading-relaxed text-zinc-500 ${ticket ? 'mt-1' : 'mt-1.5'}`}
        title={agent.task}
      >
        {agent.task}
      </p>

      {/* Row 3: meta */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-600">
        {agent.source === 'process' && agent.pid > 0 && (
          <span className="flex items-center gap-0.5">
            <Cpu className="h-2.5 w-2.5" aria-hidden="true" />
            PID {agent.pid}
          </span>
        )}
        {agent.model && (
          <span className="max-w-[100px] truncate">{agent.model.split('/').pop()}</span>
        )}
        {origin && (
          <span className="max-w-[80px] truncate">{origin}</span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" aria-hidden="true" />
          {timeElapsed(agent.startedAt)}
        </span>
      </div>
    </div>
  )
}

// ─── Log Viewer ───────────────────────────────────────────────────────────────

function LogEntry({ line }: { line: LogLine }) {
  const ts = new Date(line.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const tsEl = (
    <span className="mr-2 hidden shrink-0 select-none text-zinc-700 sm:inline" aria-hidden="true">{ts}</span>
  )

  if (line.type === 'thinking') {
    return (
      <div className="flex min-w-0 text-purple-400/90" role="listitem">
        {tsEl}
        <span className="mr-1.5 select-none" aria-hidden="true">🧠</span>
        <span className="min-w-0 break-words">{line.content}</span>
      </div>
    )
  }
  if (line.type === 'error') {
    return (
      <div className="flex min-w-0 text-red-400" role="listitem">
        {tsEl}
        <span className="mr-1.5 select-none text-red-600" aria-hidden="true">✗</span>
        <span className="min-w-0 break-words">{line.content}</span>
      </div>
    )
  }
  if (line.type === 'tool') {
    return (
      <div className="flex min-w-0 text-amber-400/80" role="listitem">
        {tsEl}
        <span className="mr-1.5 select-none" aria-hidden="true">⚙</span>
        <span className="min-w-0 break-words">{line.content}</span>
      </div>
    )
  }
  if (line.type === 'system') {
    return (
      <div className="flex min-w-0 text-zinc-600 italic" role="listitem">
        {tsEl}
        <span className="min-w-0 break-words">{line.content}</span>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 text-zinc-400" role="listitem">
      {tsEl}
      <span className="min-w-0 break-words">{line.content}</span>
    </div>
  )
}

function LogViewer({ agent }: { agent: AgentInfo }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)
  const [userScrolled, setUserScrolled] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false) // avoid stale closure in scroll handler
  const atBottomRef = useRef(true)

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  // ── Scroll detection ──────────────────────────────────────────────────────

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

  // ── Auto-scroll on new lines ──────────────────────────────────────────────
  // useLayoutEffect so scroll happens before browser paints (no flicker)

  useLayoutEffect(() => {
    if (!userScrolledRef.current) {
      const el = containerRef.current
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
        atBottomRef.current = true
      }
    }
  }, [lines])

  // ── SSE stream ────────────────────────────────────────────────────────────
  // State resets are handled by React unmount/remount via the key prop on LogViewer

  useEffect(() => {
    const es = new EventSource(
      `/api/agents/${encodeURIComponent(agent.id)}/logs`,
    )

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
      {/* Log toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 bg-zinc-950/50 px-3 py-2 sm:gap-3 sm:px-4">
        {/* Connection status */}
        <span className="flex items-center gap-1.5 text-[10px]" role="status" aria-label={connected ? 'Connected — live streaming' : 'Connecting to log stream'}>
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

        <span className="text-[10px] text-zinc-600" aria-label={`${lines.length} log lines`}>{lines.length} lines</span>

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

      {/* Log area — relative/absolute pattern for proper flex overflow */}
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

// ─── Agent detail header ──────────────────────────────────────────────────────

function AgentDetailHeader({ agent }: { agent: AgentInfo }) {
  const meta = TYPE_META[agent.agentType]
  const [elapsed, setElapsed] = useState(() => timeElapsed(agent.startedAt))

  useEffect(() => {
    if (agent.status === 'done') return
    const id = setInterval(() => setElapsed(timeElapsed(agent.startedAt)), 1000)
    return () => clearInterval(id)
  }, [agent.startedAt, agent.status])

  return (
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.color}`}
          aria-hidden="true"
        >
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-sm font-semibold text-zinc-100">{agent.name}</h1>
            <div className="flex items-center gap-1.5">
              <StatusDot status={agent.status} />
              <span
                className={`text-xs ${
                  agent.status === 'running'
                    ? 'text-emerald-400'
                    : agent.status === 'idle'
                      ? 'text-yellow-400'
                      : 'text-zinc-500'
                }`}
              >
                {agent.status}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <time>{elapsed}</time>
            </div>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500" title={agent.task}>
            {agent.task}
          </p>
          {(agent.pid > 0 || agent.sessionKey) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {agent.pid > 0 && (
                <span className="text-[10px] text-zinc-700">PID {agent.pid}</span>
              )}
              {agent.sessionKey && (
                <span
                  className="max-w-[200px] truncate text-[10px] text-zinc-700"
                  title={agent.sessionKey}
                >
                  {agent.sessionKey}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasAgents }: { hasAgents: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" role="status">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
        <Terminal className="h-8 w-8 text-zinc-700" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-400">
          {hasAgents ? 'Select an agent to view its logs' : 'No active agents'}
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          {hasAgents
            ? 'Click an agent on the left to tail its output'
            : 'Agents will appear here when active'}
        </p>
      </div>
    </div>
  )
}

// ─── Sidebar section ──────────────────────────────────────────────────────────

function AgentGroup({
  label,
  agents,
  selectedId,
  onSelect,
  now,
  collapsible = false,
  defaultCollapsed = false,
}: {
  label: string
  agents: AgentInfo[]
  selectedId: string | null
  onSelect: (id: string) => void
  now: number
  collapsible?: boolean
  defaultCollapsed?: boolean
}) {
  const hasSelected = agents.some((a) => a.id === selectedId)
  const [collapsed, setCollapsed] = useState(defaultCollapsed && !hasSelected)

  if (agents.length === 0) return null
  return (
    <section className="mb-2" aria-label={`${label} agents`}>
      {collapsible ? (
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="mb-1 flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600 transition-colors hover:text-zinc-400 focus-ring"
        >
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
            aria-hidden="true"
          />
          {label}
          <span className="ml-auto font-normal normal-case tracking-normal text-zinc-700">
            {agents.length}
          </span>
        </button>
      ) : (
        <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          {label}
        </h3>
      )}
      {!collapsed && (
        <div className="flex flex-col gap-0.5" role="list">
          {agents.map((agent) => (
            <div key={agent.id} role="listitem">
              <AgentCard
                agent={agent}
                isSelected={agent.id === selectedId}
                onSelect={() => onSelect(agent.id)}
                now={now}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsPageInner />
    </Suspense>
  )
}

function AgentsPageInner() {
  const searchParams = useSearchParams()
  const initialAgentId = searchParams.get('agentId')

  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialAgentId)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const anchoredStartsRef = useRef<Map<string, number>>(new Map())

  // Register back-action for mobile bottom nav
  const { registerAgentBack } = useMobileNav()

  useEffect(() => {
    if (selectedId !== null) {
      registerAgentBack(() => setSelectedId(null))
    } else {
      registerAgentBack(null)
    }
    return () => registerAgentBack(null)
  }, [selectedId, registerAgentBack])

  // ── Fetch agents ────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const data: AgentInfo[] = await res.json()
        const anchors = anchoredStartsRef.current
        const seen = new Set<string>()
        for (const agent of data) {
          seen.add(agent.id)
          if (!anchors.has(agent.id)) {
            anchors.set(agent.id, agent.startedAt)
          }
        }
        for (const id of anchors.keys()) {
          if (!seen.has(id)) anchors.delete(id)
        }
        setAgents(data)
        // Auto-select: prefer initialAgentId if it exists in the list, else null (no auto-select on mobile)
        setSelectedId((prev) => {
          if (prev) return prev
          if (initialAgentId) {
            const found = data.find((a) => a.id === initialAgentId)
            if (found) return found.id
          }
          return null
        })
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [initialAgentId])

  useEffect(() => {
    fetchAgents()
    const poll = setInterval(fetchAgents, POLL_INTERVAL)
    return () => clearInterval(poll)
  }, [fetchAgents])

  // ── Tick for elapsed timers ─────────────────────────────────────────────

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(tick)
  }, [])

  // ── Group agents by status ──────────────────────────────────────────────

  const anchoredAgents = useMemo(() => {
    const anchors = anchoredStartsRef.current
    return agents.map((agent) => {
      const anchoredStart = anchors.get(agent.id)
      if (anchoredStart === undefined || anchoredStart === agent.startedAt) return agent
      return { ...agent, startedAt: anchoredStart }
    })
  }, [agents])

  const running = anchoredAgents.filter((a) => a.status === 'running')
  const idle = anchoredAgents.filter((a) => a.status === 'idle')
  const done = anchoredAgents.filter((a) => a.status === 'done')

  const selectedAgent = anchoredAgents.find((a) => a.id === selectedId)

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-900 pb-20 md:pb-0">
      {/* ── Left panel — always visible on md+, toggles on mobile ──── */}
      <nav
        aria-label="Agent list"
        className={`glass flex w-full flex-col overflow-hidden border-r border-zinc-800/60 md:w-[280px] md:shrink-0 ${selectedAgent ? 'hidden md:flex' : 'flex'}`}
      >
        <SidebarNav />
        <Separator className="shrink-0 bg-zinc-800/60" />

        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            <h2 className="text-xs font-semibold text-zinc-300">Agents</h2>
            {agents.length > 0 && (
              <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400" aria-label={`${agents.length} agents`}>
                {agents.length}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setLoading(true)
              fetchAgents()
            }}
            aria-label="Refresh agent list"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </button>
        </div>
        <Separator className="shrink-0 bg-zinc-800/60" />

        {/* Scrollable agent list */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {agents.length === 0 && !loading && (
            <div className="px-3 py-10 text-center" role="status">
              <Terminal className="mx-auto h-8 w-8 text-zinc-800" aria-hidden="true" />
              <p className="mt-3 text-xs text-zinc-600">No active agents</p>
            </div>
          )}

          <AgentGroup
            label="Running"
            agents={running}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
          />
          <AgentGroup
            label="Idle"
            agents={idle}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
            collapsible
            defaultCollapsed
          />
          <AgentGroup
            label="Done"
            agents={done}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
            collapsible
            defaultCollapsed
          />
        </div>
      </nav>

      {/* ── Right panel — always visible on md+, toggles on mobile ── */}
      <main
        className={`flex-1 flex-col overflow-hidden ${selectedAgent ? 'flex' : 'hidden md:flex'}`}
        aria-label="Agent details"
      >
        {selectedAgent ? (
          <>
            {/* Mobile back button */}
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/60 bg-zinc-950/60 px-3 py-2 md:hidden">
              <button
                onClick={() => setSelectedId(null)}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200 focus-ring"
                aria-label="Back to agent list"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Agents
              </button>
            </div>
            <AgentDetailHeader agent={selectedAgent} />
            <LogViewer key={selectedAgent.id} agent={selectedAgent} />
          </>
        ) : (
          <EmptyState hasAgents={agents.length > 0} />
        )}
      </main>

      <MobileBottomNav />
    </div>
  )
}
