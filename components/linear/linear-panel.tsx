'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import type { LinearIssue } from '@/lib/linear-types'
import { PRIORITY_CONFIG } from '@/lib/linear-types'
import { ExternalLink, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const REFRESH_INTERVAL = 60_000

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
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[priority] ?? 'bg-zinc-600'}`}
      title={cfg?.label ?? 'Unknown'}
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
      className="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/60"
    >
      <div className="mt-1.5 shrink-0">
        <PriorityDot priority={issue.priority} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-[11px] text-zinc-500">
            {issue.identifier}
          </span>
          <span className="truncate text-sm leading-snug text-zinc-200">
            {issue.title}
          </span>
        </div>
        {issue.labels.nodes.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {issue.labels.nodes.slice(0, 3).map((label) => (
              <LabelPill key={label.id} name={label.name} color={label.color} />
            ))}
          </div>
        )}
      </div>
      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  )
}

function SectionHeader({ label, count, muted }: { label: string; count: number; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-2 ${muted ? 'opacity-50' : ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
        {count}
      </span>
      <div className="h-px flex-1 bg-zinc-800" />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flex items-start gap-2.5 px-2 py-2">
      <div className="mt-1.5 h-2 w-2 animate-pulse rounded-full bg-zinc-800" />
      <div className="flex-1 space-y-1.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-12 animate-pulse rounded bg-zinc-800" />
          <div className="h-3 flex-1 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
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

  const groups = groupIssues(issues)

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
        <div className="flex items-center gap-2">
          {/* Linear brand mark */}
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#5E6AD2]">
            <span className="text-[8px] font-bold leading-none text-white">L</span>
          </div>
          <span className="text-sm font-semibold text-zinc-200">Tasks</span>
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
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
            title="Refresh tasks"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            title="Close panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        {loading && (
          <div className="space-y-1 pt-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && error && (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={() => fetchIssues()}
              className="mt-2 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && issues.length === 0 && (
          <div className="px-3 py-10 text-center">
            <p className="text-xs text-zinc-500">No active tasks</p>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="py-2">
            {groups.map((group) => (
              <div key={group.type} className={group.muted ? 'opacity-60' : ''}>
                <SectionHeader label={group.label} count={group.issues.length} muted={group.muted} />
                <div className="mb-2 px-1">
                  {group.issues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {lastUpdated && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <p className="text-[10px] text-zinc-600">
            Refreshes every 60s · Last:{' '}
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  )
}
