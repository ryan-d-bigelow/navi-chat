'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { LinearIssue } from '@/lib/linear-types'
import { PRIORITY_CONFIG } from '@/lib/linear-types'
import { ExternalLink, RefreshCw, X } from 'lucide-react'

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

function groupIssues(issues: LinearIssue[]): StateGroup[] {
  const order: StateGroup[] = [
    { label: 'In Progress', type: 'started', issues: [] },
    { label: 'Todo', type: 'unstarted', issues: [] },
    { label: 'Backlog', type: 'backlog', issues: [] },
    { label: 'Triage', type: 'triage', issues: [] },
    { label: 'Done', type: 'completed', issues: [], muted: true },
    { label: 'Cancelled', type: 'cancelled', issues: [], muted: true },
  ]

  for (const issue of issues) {
    const group = order.find((g) => g.type === issue.state.type)
    if (group) group.issues.push(issue)
    else order[1].issues.push(issue) // fallback to Todo
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

function IssueCard({ issue }: { issue: LinearIssue }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${issue.identifier}: ${issue.title}`}
      className="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/60 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
    >
      <div className="mt-1.5 shrink-0">
        <PriorityDot priority={issue.priority} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-[11px] text-zinc-400">
            {issue.identifier}
          </span>
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
      <ExternalLink
        className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      />
    </a>
  )
}

function SectionHeader({ label, count, muted }: { label: string; count: number; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-2 ${muted ? 'opacity-50' : ''}`} role="heading" aria-level={3}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
        {count}
      </span>
      <div className="h-px flex-1 bg-zinc-800" aria-hidden="true" />
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchIssues = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/linear', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data: LinearIssue[] = await res.json()
      setIssues(data)
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

  const workIssues = issues.filter((i) => !isHomeIssue(i))
  const homeIssues = issues.filter(isHomeIssue)
  const workGroups = groupIssues(workIssues)
  const homeGroups = groupIssues(homeIssues)

  return (
    <aside
      aria-label="Linear tasks"
      className="flex h-full w-[300px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
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
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close tasks panel"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Body */}
      <ScrollArea className="flex-1">
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
              className="mt-2 min-h-[44px] rounded px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && issues.length === 0 && (
          <div className="px-3 py-10 text-center">
            <p className="text-xs text-zinc-400">No active tasks</p>
          </div>
        )}

        {!loading && !error && issues.length > 0 && (
          <div className="py-2">
            {workGroups.map((group) => (
              <section key={group.type} aria-label={group.label} className={group.muted ? 'opacity-60' : ''}>
                <SectionHeader label={group.label} count={group.issues.length} muted={group.muted} />
                <div className="mb-2 px-1">
                  {group.issues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              </section>
            ))}

            {homeGroups.length > 0 && (
              <>
                <div className="mx-2 my-3 flex items-center gap-2" aria-hidden="true">
                  <div className="h-px flex-1 bg-zinc-700" />
                  <span className="text-xs font-semibold text-zinc-400">
                    <span role="img" aria-label="Home">🏠</span> Home
                  </span>
                  <div className="h-px flex-1 bg-zinc-700" />
                </div>
                {homeGroups.map((group) => (
                  <section key={`home-${group.type}`} aria-label={`Home: ${group.label}`} className={group.muted ? 'opacity-60' : ''}>
                    <SectionHeader label={group.label} count={group.issues.length} muted={group.muted} />
                    <div className="mb-2 px-1">
                      {group.issues.map((issue) => (
                        <IssueCard key={issue.id} issue={issue} />
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {lastUpdated && (
        <footer className="border-t border-zinc-800 px-3 py-2">
          <p className="text-[10px] text-zinc-500">
            Refreshes every 60s · Last:{' '}
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </footer>
      )}
    </aside>
  )
}
