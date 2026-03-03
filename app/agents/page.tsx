'use client'

import { SidebarNav } from '@/components/chat/sidebar'
import { LogViewer } from '@/components/agents/log-viewer'
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav'
import { Separator } from '@/components/ui/separator'
import type { AgentInfo, AgentType } from '@/lib/agents'
import { getLocalConversationSessionKeys, LOCAL_CONVERSATION_INDEX_KEY } from '@/lib/storage'
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
  Zap,
} from 'lucide-react'
import { useMobileNav } from '@/app/context/mobile-nav-context'
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 8_000
const SLACK_DM_IDLE_MS = 5 * 60 * 1000

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

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function isSlackDm(agent: AgentInfo): boolean {
  return agent.agentType === 'slack' && agent.name === 'Slack DM'
}

function isSlackDmIdle(agent: AgentInfo, now: number): boolean {
  if (!isSlackDm(agent)) return false
  const lastActivity = agent.updatedAt ?? agent.startedAt
  return now - lastActivity > SLACK_DM_IDLE_MS
}

function getOriginLabel(agent: AgentInfo): string | null {
  if (agent.source === 'process') return 'Local Process'
  if (!agent.sessionKey) return null
  const parts = agent.sessionKey.split(':')
  if (parts[2] === 'cron') return 'Cron Job'
  if (parts[2] === 'slack') return 'Slack'
  if (parts[2] === 'openai' || parts[2] === 'openai-user') return 'Web Chat'
  if (parts[3] === 'thread') return agent.name
  return agent.sessionKey
}

function getConversationAgentLabel(agent: AgentInfo): string | null {
  if (agent.agentType !== 'slack' && agent.agentType !== 'webchat') return null
  const key = agent.sessionKey ?? ''
  if (key.startsWith('agent:main:openai:')) {
    return agent.model || 'OpenAI'
  }
  if (key.startsWith('agent:main:openai-user:')) {
    return agent.model || 'OpenAI'
  }
  if (key.startsWith('agent:main:main:thread:')) {
    return agent.name
  }
  if (agent.model) return agent.model
  if (agent.agentType === 'slack') return 'Slack'
  if (agent.agentType === 'webchat') return 'Web Chat'
  return agent.name
}

function inferAgentTypeFromSessionKey(sessionKey: string): AgentType {
  if (sessionKey.includes(':cron:')) return 'cron'
  if (sessionKey.includes(':slack:') || sessionKey.includes(':thread:')) return 'slack'
  if (sessionKey.includes(':openai:') || sessionKey.includes(':openai-user:')) return 'webchat'
  if (sessionKey.startsWith('agent:')) return 'navi'
  return 'process'
}

function buildFallbackAgent(agentId: string): AgentInfo | null {
  const now = Date.now()
  if (agentId.startsWith('agent:')) {
    const agentType = inferAgentTypeFromSessionKey(agentId)
    const name =
      agentType === 'webchat'
        ? 'Navi Chat'
        : agentType === 'slack'
          ? 'Slack'
          : agentType === 'cron'
            ? 'Cron Job'
            : agentType === 'navi'
              ? 'Navi'
              : 'Session'
    return {
      id: agentId,
      name,
      agentType,
      status: 'idle',
      model: '',
      task: 'Session logs',
      sessionKey: agentId,
      updatedAt: now,
      startedAt: now,
      pid: 0,
      source: 'session',
    }
  }

  if (agentId.startsWith('proc-')) {
    const pid = Number.parseInt(agentId.slice(5), 10)
    return {
      id: agentId,
      name: 'Process',
      agentType: 'process',
      status: 'idle',
      model: '',
      task: 'Process logs',
      updatedAt: now,
      startedAt: now,
      pid: Number.isNaN(pid) ? 0 : pid,
      source: 'process',
    }
  }

  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  now,
}: {
  agent: AgentInfo
  isSelected: boolean
  onSelect: () => void
  now: number
}) {
  const slackDmIdle = isSlackDmIdle(agent, now)
  const displayStatus: AgentInfo['status'] = slackDmIdle ? 'idle' : agent.status
  const origin = getOriginLabel(agent)
  const conversationAgent = getConversationAgentLabel(agent)
  const modelLabel = conversationAgent ?? agent.model
  const ticket = agent.ticket
  const ticketUrl = ticket ? `https://linear.app/naviagent/issue/${ticket.id}` : null
  const lastSeen =
    agent.source === 'session'
      ? timeAgo(agent.updatedAt ?? agent.startedAt)
      : timeElapsed(agent.startedAt)

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
      aria-label={`${agent.name} — ${displayStatus}, ${TYPE_META[agent.agentType].label}`}
      className={`group min-h-[64px] w-full rounded-lg border p-3 text-left transition-all focus-ring ${
        isSelected
          ? 'border-zinc-700 bg-zinc-800 shadow-sm'
          : 'border-transparent hover:border-zinc-800 hover:bg-zinc-800/40'
      } ${slackDmIdle ? 'opacity-60' : ''}`}
    >
      {/* Row 1: status + name + badge */}
      <div className="flex items-center gap-2">
        <StatusDot status={displayStatus} />
        <span className="flex-1 truncate text-sm font-medium text-zinc-200">
          {agent.name}
        </span>
        <TypeBadge agentType={agent.agentType} />
        {slackDmIdle && (
          <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-300">
            Idle
          </span>
        )}
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
        {modelLabel && (
          <span className="max-w-[120px] truncate" title={modelLabel}>
            {modelLabel.split('/').pop()}
          </span>
        )}
        {origin && (
          <span className="max-w-[80px] truncate">{origin}</span>
        )}
        {agent.sessionKey && (
          <span
            className="max-w-[120px] truncate text-zinc-700"
            title={agent.sessionKey}
          >
            {agent.sessionKey}
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" aria-hidden="true" />
          {lastSeen}
        </span>
      </div>
    </div>
  )
}

// ─── Log Viewer ───────────────────────────────────────────────────────────────

// ─── Agent detail header ──────────────────────────────────────────────────────

function AgentDetailHeader({ agent }: { agent: AgentInfo }) {
  const meta = TYPE_META[agent.agentType]
  const [elapsed, setElapsed] = useState(() => timeElapsed(agent.startedAt))
  const [now, setNow] = useState(Date.now())
  const slackDmIdle = isSlackDmIdle(agent, now)
  const displayStatus: AgentInfo['status'] = slackDmIdle ? 'idle' : agent.status

  useEffect(() => {
    if (agent.status === 'done') return
    const id = setInterval(() => setElapsed(timeElapsed(agent.startedAt)), 1000)
    return () => clearInterval(id)
  }, [agent.startedAt, agent.status])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

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
              <StatusDot status={displayStatus} />
              <span
                className={`text-xs ${
                  displayStatus === 'running'
                    ? 'text-emerald-400'
                    : displayStatus === 'idle'
                      ? 'text-yellow-400'
                      : 'text-zinc-500'
                }`}
              >
                {displayStatus}
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

function SessionEndedState({ agentId }: { agentId: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" role="status">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-800/40 bg-amber-950/30">
        <Clock className="h-8 w-8 text-amber-600" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-300">Session ended</p>
        <p className="mt-1 max-w-xs text-xs text-zinc-600">
          The agent session has ended or been pruned. Select an active agent from the list.
        </p>
        <p className="mt-2 max-w-xs truncate text-[10px] text-zinc-700" title={agentId}>
          {agentId}
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
  const [localChatSessionKeys, setLocalChatSessionKeys] = useState<Set<string> | null>(null)
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
        // Auto-select: match by id or sessionKey (stable across pruning)
        setSelectedId((prev) => {
          if (prev) return prev
          if (initialAgentId) {
            const found = data.find(
              (a) => a.id === initialAgentId || a.sessionKey === initialAgentId,
            )
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const loadKeys = () => {
      const keys = getLocalConversationSessionKeys()
      setLocalChatSessionKeys(new Set(keys))
    }
    loadKeys()
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOCAL_CONVERSATION_INDEX_KEY) {
        loadKeys()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
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

  const dedupedAgents = useMemo(() => {
    const registeredByPid = new Set<number>()
    const registeredByTask = new Set<string>()

    const isRegistered = (agent: AgentInfo) => Boolean(agent.ticket || agent.sessionKey)

    for (const agent of anchoredAgents) {
      if (!isRegistered(agent)) continue
      if (agent.pid > 0) registeredByPid.add(agent.pid)
      if (agent.task) registeredByTask.add(agent.task)
    }

    return anchoredAgents.filter((agent) => {
      if (isRegistered(agent)) return true
      if (agent.pid > 0 && registeredByPid.has(agent.pid)) return false
      if (agent.task && registeredByTask.has(agent.task)) return false
      return true
    })
  }, [anchoredAgents])

  const filteredAgents = useMemo(() => {
    if (!localChatSessionKeys || localChatSessionKeys.size === 0) return dedupedAgents
    return dedupedAgents.filter((agent) => {
      if (agent.agentType !== 'webchat') return true
      if (!agent.sessionKey) return true
      return localChatSessionKeys.has(agent.sessionKey)
    })
  }, [dedupedAgents, localChatSessionKeys])

  const activeAgents = filteredAgents.filter(
    (a) => a.agentType !== 'cron' && a.agentType !== 'slack' && a.agentType !== 'webchat',
  )
    .sort((a, b) => {
      if (a.agentType === 'navi' && b.agentType !== 'navi') return -1
      if (b.agentType === 'navi' && a.agentType !== 'navi') return 1
      return 0
    })
  const naviAgents = activeAgents.filter((a) => a.agentType === 'navi')
  const codingAgents = activeAgents.filter((a) => a.agentType !== 'navi')
  const recentConversations = filteredAgents.filter(
    (a) => a.agentType === 'slack' || a.agentType === 'webchat',
  )
  const systemSessions = filteredAgents.filter((a) => a.agentType === 'cron')

  const selectedAgent = filteredAgents.find((a) => a.id === selectedId)
  const fallbackAgent = useMemo(() => {
    if (!initialAgentId || selectedAgent) return null
    return buildFallbackAgent(initialAgentId)
  }, [initialAgentId, selectedAgent])
  const effectiveAgent = selectedAgent ?? fallbackAgent
  const showSessionEnded = Boolean(initialAgentId && !effectiveAgent && !loading)
  const hasDetailView = Boolean(effectiveAgent || showSessionEnded)

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-900 pb-20 md:pb-0">
      {/* ── Left panel — always visible on md+, toggles on mobile ──── */}
      <nav
        aria-label="Agent list"
        className={`glass flex w-full flex-col overflow-hidden border-r border-zinc-800/60 md:w-[280px] md:shrink-0 ${hasDetailView ? 'hidden md:flex' : 'flex'}`}
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
            label="Navi"
            agents={naviAgents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
          />
          <AgentGroup
            label="Coding Agents"
            agents={codingAgents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
            collapsible
          />
          <AgentGroup
            label="Recent Conversations"
            agents={recentConversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
            collapsible
          />
          <AgentGroup
            label="System"
            agents={systemSessions}
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
        className={`flex-1 flex-col overflow-hidden ${hasDetailView ? 'flex' : 'hidden md:flex'}`}
        aria-label="Agent details"
      >
        {effectiveAgent ? (
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
            <AgentDetailHeader agent={effectiveAgent} />
            <LogViewer key={effectiveAgent.id} agent={effectiveAgent} />
          </>
        ) : showSessionEnded && initialAgentId ? (
          <SessionEndedState agentId={initialAgentId} />
        ) : (
          <EmptyState hasAgents={agents.length > 0} />
        )}
      </main>

      <MobileBottomNav />
    </div>
  )
}
