'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { LinearIssue } from '@/lib/linear-types'
import { PRIORITY_CONFIG } from '@/lib/linear-types'
import type { AgentInfo } from '@/lib/agents'
import { ChevronDown, ExternalLink, FileText, RefreshCw, Terminal, X } from 'lucide-react'

function TickerTitle({ title }: { title: string }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const [animating, setAnimating] = useState(false)
  const [offset, setOffset] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const overflow = el.scrollWidth - el.clientWidth
    if (overflow <= 2) return // not actually clipped
    setOffset(overflow)
    timerRef.current = setTimeout(() => setAnimating(true), 300)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setAnimating(false)
    setOffset(0)
  }, [])

  const duration = offset > 0 ? Math.max(2.5, offset / 50) : 0

  return (
    <span
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="overflow-hidden whitespace-nowrap text-sm leading-snug text-zinc-200"
      style={{ display: 'block', minWidth: 0 }}
    >
      <span
        className="ticker-text inline-block whitespace-nowrap"
        style={
          animating
            ? {
                animation: `ticker-scroll ${duration}s linear infinite`,
                '--ticker-offset': `-${offset}px`,
              } as React.CSSProperties
            : undefined
        }
      >
        {title}
      </span>
    </span>
  )
}

const REFRESH_INTERVAL = 60_000

const HOME_LABELS = ['home', 'home assistant', 'honey-do']
const BLOCKED_STATE_ID = '153e998a-f390-4dc6-8b51-1ecadff78cbb'
const DEFAULT_COLLAPSED_SECTIONS = new Set(['home', 'backlog', 'blocked'])

function isHomeIssue(issue: LinearIssue): boolean {
  return issue.labels.nodes.some((l) =>
    HOME_LABELS.includes(l.name.toLowerCase()),
  )
}

interface LinearPanelProps {
  onClose: () => void
}

type StateGroup = {
  label: string
  type: string
  issues: LinearIssue[]
  muted?: boolean
}

type NaviOp = {
  ticketId: string | null
  issueId: string | null
  pid: number
  phase: string
  startedAt: number | null
  projectName: string | null
  taskType: string
  title: string | null
  logPath: string | null
}

function isBlockedIssue(issue: LinearIssue): boolean {
  return issue.state.id === BLOCKED_STATE_ID
}

function groupIssues(issues: LinearIssue[]): StateGroup[] {
  const order: StateGroup[] = [
    { label: 'Blocked', type: 'blocked', issues: [] },
    { label: 'In Progress', type: 'started', issues: [] },
    { label: 'Todo', type: 'unstarted', issues: [] },
    { label: 'Backlog', type: 'backlog', issues: [] },
    { label: 'Triage', type: 'triage', issues: [] },
    { label: 'Done', type: 'completed', issues: [], muted: true },
    { label: 'Cancelled', type: 'cancelled', issues: [], muted: true },
  ]

  for (const issue of issues) {
    if (isBlockedIssue(issue)) {
      order[0].issues.push(issue)
      continue
    }
    const group = order.find((g) => g.type === issue.state.type)
    if (group) group.issues.push(issue)
    else order[2].issues.push(issue) // fallback to Todo
  }

  return order.filter((g) => g.issues.length > 0)
}

const PRIORITY_DOT: Record<number, string> = {
  0: 'bg-zinc-600',
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-yellow-400',
  4: 'bg-zinc-400',
}

function PriorityDot({ priority }: { priority: number }) {
  const cfg = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG]
  const label = cfg?.label ?? 'Unknown'
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[priority] ?? 'bg-zinc-600'}`}
      role="img"
      aria-label={`${label} priority`}
    />
  )
}

function LabelPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-1 py-0.5 font-mono text-[10px] leading-none"
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {name}
    </span>
  )
}

function IssueCard({
  issue,
  runningAgent,
  onAgentClick,
}: {
  issue: LinearIssue
  runningAgent?: AgentInfo
  onAgentClick?: (agentId: string) => void
}) {
  const blocked = isBlockedIssue(issue)
  return (
    <div className="group relative flex min-h-[44px] items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/60">
      {/* Pulsing running dot — top-right corner */}
      {runningAgent && (
        <span
          className="absolute right-1.5 top-1.5 flex h-2 w-2"
          role="img"
          aria-label="Agent running"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      )}

      <div className="mt-1.5 shrink-0">
        <PriorityDot priority={issue.priority} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-[11px] text-zinc-400">
            {issue.identifier}
          </span>
          {blocked && (
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-300">
              Blocked
            </span>
          )}
          <TickerTitle title={issue.title} />
        </div>
        {issue.labels.nodes.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {issue.labels.nodes.slice(0, 3).map((label) => (
              <LabelPill key={label.id} name={label.name} color={label.color} />
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {runningAgent && onAgentClick && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAgentClick(runningAgent.id)
            }}
            aria-label={`View agent for ${issue.identifier}`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-emerald-400 focus-ring"
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${issue.identifier} in Linear`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 focus-ring"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}

function SectionHeader({
  label,
  count,
  muted,
  collapsed,
  onToggle,
  controlsId,
}: {
  label: string
  count: number
  muted?: boolean
  collapsed: boolean
  onToggle: () => void
  controlsId: string
}) {
  return (
    <div className={`px-2 py-2 ${muted ? 'opacity-50' : ''}`} role="heading" aria-level={3}>
      <button
        type="button"
        className="group flex w-full items-center gap-2 rounded-md text-left focus-ring"
        aria-label={`Toggle ${label}`}
        aria-expanded={!collapsed}
        aria-controls={controlsId}
        onClick={onToggle}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-500 transition-transform group-hover:text-zinc-300 ${collapsed ? '-rotate-90' : ''}`}
          aria-hidden="true"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400" aria-label={`${count} issues`}>
          {count}
        </span>
        <div className="h-px flex-1 bg-zinc-800" aria-hidden="true" />
      </button>
    </div>
  )
}

function formatElapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return '—'
  const ms = Math.max(0, now - startedAt)
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function ActiveAgentCard({ op, now }: { op: NaviOp; now: number }) {
  const ticket = op.ticketId ?? op.issueId ?? 'Untracked'
  const agentLabel = op.projectName ?? op.title ?? 'Agent'
  const typeLabel = op.taskType ? op.taskType.replace(/_/g, ' ') : 'agent'
  const elapsed = formatElapsed(op.startedAt, now)
  const ticketNum = op.ticketId?.match(/(\d+)/)?.[1] ?? null
  const [logOpen, setLogOpen] = useState(false)
  const [logContent, setLogContent] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [logLoading, setLogLoading] = useState(false)

  useEffect(() => {
    if (!logOpen || !ticketNum) return
    const controller = new AbortController()
    const load = async () => {
      setLogLoading(true)
      setLogError(null)
      try {
        const res = await fetch(`/api/agent-logs/${ticketNum}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const text = await res.text()
        if (!res.ok) {
          throw new Error(text || `Failed to load log (HTTP ${res.status})`)
        }
        setLogContent(text)
      } catch (err) {
        if (controller.signal.aborted) return
        setLogContent(null)
        setLogError(err instanceof Error ? err.message : 'Failed to load log')
      } finally {
        if (!controller.signal.aborted) setLogLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [logOpen, ticketNum])

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-2 text-xs text-zinc-400">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
          {ticket}
        </span>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
          {op.phase}
        </span>
        <span className="ml-auto text-[10px] text-emerald-200/80">{elapsed}</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-zinc-300">
        <span className="rounded-full border border-zinc-700/60 bg-zinc-900/60 px-2 py-0.5 uppercase tracking-wide text-[9px] text-zinc-400">
          {typeLabel}
        </span>
        <span className="truncate">{agentLabel}</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>PID {op.pid}</span>
        {ticketNum ? (
          <Sheet open={logOpen} onOpenChange={setLogOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] text-emerald-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-100 focus-ring"
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                Log
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[92vw] max-w-xl border-zinc-800/80 bg-zinc-950 text-zinc-100"
            >
              <SheetHeader className="border-b border-zinc-800/60 pb-3">
                <SheetTitle className="text-sm">Agent Log · {ticket}</SheetTitle>
                <SheetDescription className="text-xs text-zinc-500">
                  PID {op.pid} · NAV-{ticketNum}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-auto px-4 pb-4">
                {logLoading && <p className="text-xs text-zinc-400">Loading log…</p>}
                {logError && <p className="text-xs text-red-400">{logError}</p>}
                {!logLoading && !logError && logContent !== null && (
                  <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-200">
                    {logContent.trim().length > 0 ? logContent : 'Log is empty.'}
                  </pre>
                )}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <span className="text-zinc-600">Log unavailable</span>
        )}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flex items-start gap-2.5 px-2 py-2" aria-hidden="true">
      <div className="mt-1.5 h-2 w-2 animate-pulse rounded-full bg-zinc-800 motion-reduce:animate-none" />
      <div className="flex-1 space-y-1.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-12 animate-pulse rounded bg-zinc-800 motion-reduce:animate-none" />
          <div className="h-3 flex-1 animate-pulse rounded bg-zinc-800 motion-reduce:animate-none" />
        </div>
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800 motion-reduce:animate-none" />
      </div>
    </div>
  )
}

export function LinearPanel({ onClose }: LinearPanelProps) {
  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [ops, setOps] = useState<NaviOp[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()

  const isSectionCollapsed = useCallback(
    (key: string, label: string) => {
      if (key in collapsedSections) return collapsedSections[key]
      return DEFAULT_COLLAPSED_SECTIONS.has(label.toLowerCase())
    },
    [collapsedSections],
  )

  const toggleSection = useCallback((key: string, label: string) => {
    setCollapsedSections((prev) => {
      const current = key in prev ? prev[key] : DEFAULT_COLLAPSED_SECTIONS.has(label.toLowerCase())
      return { ...prev, [key]: !current }
    })
  }, [])

  const fetchIssues = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const [linearRes, agentsRes, opsRes] = await Promise.all([
        fetch('/api/linear', { cache: 'no-store' }),
        fetch('/api/agents', { cache: 'no-store' }),
        fetch('/api/ops', { cache: 'no-store' }),
      ])
      if (!linearRes.ok) {
        const body = await linearRes.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${linearRes.status}`)
      }
      const data: LinearIssue[] = await linearRes.json()
      setIssues(data)
      if (agentsRes.ok) {
        const agentData: AgentInfo[] = await agentsRes.json()
        setAgents(agentData)
      }
      if (opsRes.ok) {
        const opData: NaviOp[] = await opsRes.json()
        setOps(opData)
      } else {
        setOps([])
      }
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchIssues()
    timerRef.current = setInterval(() => fetchIssues(true), REFRESH_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchIssues])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(tick)
  }, [])

  const workIssues = issues.filter((i) => !isHomeIssue(i))
  const homeIssues = issues.filter(isHomeIssue)
  const workGroups = groupIssues(workIssues)
  const homeGroups = groupIssues(homeIssues)
  const homeCount = homeGroups.reduce((sum, group) => sum + group.issues.length, 0)

  const runningAgentByTicket = useMemo(() => {
    const map = new Map<string, AgentInfo>()
    for (const agent of agents) {
      if (agent.status === 'running' && agent.ticket?.id) {
        map.set(agent.ticket.id, agent)
      }
    }
    return map
  }, [agents])

  const handleAgentClick = useCallback(
    (agentId: string) => {
      router.push(`/agents?agentId=${agentId}`)
    },
    [router],
  )

  return (
    <aside
      aria-label="Linear tasks"
      className="glass flex h-full w-full flex-col border-r border-zinc-800/60"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-3">
        <div className="flex items-center gap-2">
          {/* Linear brand mark */}
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#5E6AD2]" aria-hidden="true">
            <span className="text-[8px] font-bold leading-none text-white">L</span>
          </div>
          <h2 className="text-sm font-semibold text-zinc-200">Tasks</h2>
          {issues.length > 0 && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              NAV · {issues.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchIssues(true)}
            disabled={refreshing || loading}
            aria-label="Refresh tasks"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40 focus-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close tasks panel"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Body */}
      <ScrollArea className="flex-1 overflow-y-auto">
        {!loading && !error && ops.length > 0 && (
          <section aria-label="Active agents" className="border-b border-zinc-800/60 px-3 py-3">
            <SectionHeader
              label="Active Agents"
              count={ops.length}
              collapsed={isSectionCollapsed('active-agents', 'Active Agents')}
              onToggle={() => toggleSection('active-agents', 'Active Agents')}
              controlsId="active-agents-content"
            />
            {!isSectionCollapsed('active-agents', 'Active Agents') && (
              <div id="active-agents-content" className="mt-2 space-y-2">
                {ops.map((op) => (
                  <ActiveAgentCard key={`${op.ticketId ?? 'untracked'}-${op.pid}`} op={op} now={now} />
                ))}
              </div>
            )}
          </section>
        )}

        {loading && (
          <div className="space-y-1 pt-2" role="status" aria-label="Loading tasks">
            <span className="sr-only">Loading tasks...</span>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && error && (
          <div className="px-3 py-8 text-center" role="alert">
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={() => fetchIssues()}
              className="mt-2 min-h-[44px] rounded-lg px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-ring"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && issues.length === 0 && (
          <div className="px-3 py-10 text-center" role="status">
            <p className="text-xs text-zinc-500">No active tasks</p>
          </div>
        )}

        {!loading && !error && issues.length > 0 && (
          <div className="py-2">
            {workGroups.map((group) => {
              const sectionKey = `work-${group.type}`
              const collapsed = isSectionCollapsed(sectionKey, group.label)
              return (
                <section key={group.type} aria-label={group.label} className={group.muted ? 'opacity-60' : ''}>
                  <SectionHeader
                    label={group.label}
                    count={group.issues.length}
                    muted={group.muted}
                    collapsed={collapsed}
                    onToggle={() => toggleSection(sectionKey, group.label)}
                    controlsId={`${sectionKey}-content`}
                  />
                  {!collapsed && (
                    <div id={`${sectionKey}-content`} className="mb-2 px-1">
                      {group.issues.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          runningAgent={['started', 'blocked'].includes(group.type) ? runningAgentByTicket.get(issue.identifier) : undefined}
                          onAgentClick={['started', 'blocked'].includes(group.type) ? handleAgentClick : undefined}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}

            {homeGroups.length > 0 && (
              <section aria-label="Home" className="mt-3 border-t border-zinc-800/60 pt-2">
                <SectionHeader
                  label="Home"
                  count={homeCount}
                  collapsed={isSectionCollapsed('home', 'Home')}
                  onToggle={() => toggleSection('home', 'Home')}
                  controlsId="home-content"
                />
                {!isSectionCollapsed('home', 'Home') && (
                  <div id="home-content">
                    {homeGroups.map((group) => {
                      const sectionKey = `home-${group.type}`
                      const collapsed = isSectionCollapsed(sectionKey, group.label)
                      return (
                        <section key={`home-${group.type}`} aria-label={`Home: ${group.label}`} className={group.muted ? 'opacity-60' : ''}>
                          <SectionHeader
                            label={group.label}
                            count={group.issues.length}
                            muted={group.muted}
                            collapsed={collapsed}
                            onToggle={() => toggleSection(sectionKey, group.label)}
                            controlsId={`${sectionKey}-content`}
                          />
                          {!collapsed && (
                            <div id={`${sectionKey}-content`} className="mb-2 px-1">
                              {group.issues.map((issue) => (
                                <IssueCard
                                  key={issue.id}
                                  issue={issue}
                                  runningAgent={['started', 'blocked'].includes(group.type) ? runningAgentByTicket.get(issue.identifier) : undefined}
                                  onAgentClick={['started', 'blocked'].includes(group.type) ? handleAgentClick : undefined}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {lastUpdated && (
        <footer className="border-t border-zinc-800/60 px-3 py-2">
          <p className="text-[10px] text-zinc-500">
            Refreshes every 60s · Last:{' '}
            <time>{lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </p>
        </footer>
      )}
    </aside>
  )
}
