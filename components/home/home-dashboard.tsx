'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { LinearIssue } from '@/lib/linear-types'
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Home,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react'

const POLL_INTERVAL = 30_000

type AgentTask = {
  id: string
  title: string
  status: string
  updatedAt: number | null
  startedAt: number | null
  pid: number | null
}

type AgentsPayload = {
  running: number
  total: number
  tasks: AgentTask[]
}

type LinearPayload = {
  issues: LinearIssue[]
}

type HaEntity = {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
}

type HaPayload = {
  locks: HaEntity[]
  temperatures: HaEntity[]
  presence: HaEntity[]
}

type LoadState<T> = {
  status: 'loading' | 'ready' | 'error'
  data: T | null
  error?: string
}

function usePolling<T>(url: string) {
  const [state, setState] = useState<LoadState<T>>({
    status: 'loading',
    data: null,
  })

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`${res.status}`)
      }
      const data = (await res.json()) as T
      setState({ status: 'ready', data })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      setState({ status: 'error', data: null, error: message })
    }
  }, [url])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!mounted) return
      await fetchData()
    }
    load()
    const id = setInterval(load, POLL_INTERVAL)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [fetchData])

  return { state, refresh: fetchData }
}

function formatDateTime(now: Date) {
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(now)
  return { date, time }
}

function getFriendlyName(entity: HaEntity): string {
  const name = entity.attributes?.friendly_name
  if (typeof name === 'string' && name.length > 0) return name
  return entity.entity_id.split('.').slice(1).join(' ')
}

function formatTemp(entity: HaEntity): string {
  const unit = entity.attributes?.unit_of_measurement
  if (typeof unit === 'string') return `${entity.state}${unit}`
  return entity.state
}

function isRunningStatus(status: string): boolean {
  return ['running', 'active', 'in_progress', 'started', 'processing'].includes(status)
}

export function HomeDashboard() {
  const agents = usePolling<AgentsPayload>('/api/home/agents')
  const linear = usePolling<LinearPayload>('/api/home/linear')
  const ha = usePolling<HaPayload>('/api/home/ha')

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const { date, time } = useMemo(() => formatDateTime(now), [now])

  const runningAgents = agents.state.data?.running ?? 0
  const agentsReady = agents.state.status === 'ready'

  return (
    <div className="min-h-dvh overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 md:py-14">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/70">
                Navi Command
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold text-white md:text-4xl">
                  Hey Ryan 🧚
                </h1>
                <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-400">
                  {date} · {time}
                </span>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-zinc-400">
                Live system overview with agent health, Linear momentum, and smart home status.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  runningAgents > 0 ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]' : 'bg-zinc-600'
                }`}
                aria-hidden="true"
              />
              <div className="text-xs">
                <p className="text-zinc-400">System Health</p>
                <p className="font-semibold text-zinc-100">
                  {runningAgents > 0 ? `${runningAgents} agents running` : agentsReady ? 'All agents idle' : 'Checking agents'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Button asChild size="lg" className="h-16 justify-between rounded-2xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
              <Link href="/chat">
                <span className="flex items-center gap-3 text-lg font-semibold">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                  New Task
                </span>
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" className="h-16 justify-between rounded-2xl bg-zinc-800 text-white hover:bg-zinc-700">
              <Link href="/agents">
                <span className="flex items-center gap-3 text-lg font-semibold">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                  Check Agents
                </span>
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" className="h-16 justify-between rounded-2xl border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800">
              <Link href="/chat">
                <span className="flex items-center gap-3 text-lg font-semibold">
                  <Home className="h-5 w-5" aria-hidden="true" />
                  Home Controls
                </span>
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" className="h-16 justify-between rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20">
              <a href="https://linear.app" target="_blank" rel="noreferrer">
                <span className="flex items-center gap-3 text-lg font-semibold">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                  View Tickets
                </span>
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/60 p-6 shadow-[0_0_30px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Zap className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                Active Agents
              </div>
              <button
                onClick={agents.refresh}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:text-white"
                aria-label="Refresh agents"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-3xl font-semibold text-white">
                  {agents.state.data?.running ?? '—'}
                </p>
                <p className="text-xs text-zinc-400">Running agents</p>
              </div>
              <div className="text-right text-xs text-zinc-500">
                {agents.state.data ? `${agents.state.data.total} total tasks` : 'Loading tasks'}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {agents.state.status === 'error' && (
                <p className="text-xs text-red-400">Agents data unavailable.</p>
              )}
              {agents.state.status === 'ready' && agents.state.data?.tasks.length === 0 && (
                <p className="text-xs text-zinc-500">No recent agent activity.</p>
              )}
              {agents.state.status === 'ready' &&
                agents.state.data?.tasks
                  .filter((task) => isRunningStatus(task.status))
                  .slice(0, 3)
                  .map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs"
                    >
                      <span className="truncate text-zinc-200">{task.title}</span>
                      <span className="ml-3 inline-flex items-center gap-1 text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                        Running
                      </span>
                    </div>
                  ))}
              {agents.state.status === 'ready' &&
                agents.state.data?.tasks.filter((task) => isRunningStatus(task.status)).length === 0 && (
                  <p className="text-xs text-zinc-500">All agents idle. Launch a new task to get moving.</p>
                )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/60 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ClipboardList className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Linear In Progress
              </div>
              <button
                onClick={linear.refresh}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:text-white"
                aria-label="Refresh Linear issues"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-3xl font-semibold text-white">
                  {linear.state.data?.issues.length ?? '—'}
                </p>
                <p className="text-xs text-zinc-400">Active tickets</p>
              </div>
              <div className="text-right text-xs text-zinc-500">
                Team c2323…7d
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {linear.state.status === 'error' && (
                <p className="text-xs text-red-400">Linear data unavailable.</p>
              )}
              {linear.state.status === 'ready' && linear.state.data?.issues.length === 0 && (
                <p className="text-xs text-zinc-500">No tickets in progress.</p>
              )}
              {linear.state.status === 'ready' &&
                linear.state.data?.issues.slice(0, 3).map((issue) => (
                  <a
                    key={issue.id}
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-[44px] items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3 py-3 text-xs text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-950/80 sm:py-2"
                  >
                    <span className="truncate">
                      <span className="mr-2 font-mono text-zinc-500">{issue.identifier}</span>
                      {issue.title}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                  </a>
                ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/60 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Home className="h-4 w-4 text-amber-300" aria-hidden="true" />
                Home Assistant
              </div>
              <button
                onClick={ha.refresh}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:text-white"
                aria-label="Refresh Home Assistant"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-xs">
              {ha.state.status === 'error' && (
                <p className="text-xs text-red-400">Home Assistant unavailable.</p>
              )}
              {ha.state.status !== 'error' && (
                <>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Locks</p>
                    <div className="mt-2 space-y-2">
                      {ha.state.data?.locks.map((lock) => (
                        <div key={lock.entity_id} className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                          <span className="truncate text-zinc-200">{getFriendlyName(lock)}</span>
                          <span className={`inline-flex items-center gap-1 ${lock.state === 'locked' ? 'text-emerald-300' : 'text-red-300'}`}>
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {lock.state}
                          </span>
                        </div>
                      ))}
                      {ha.state.data && ha.state.data.locks.length === 0 && (
                        <p className="text-xs text-zinc-500">No locks detected.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Temperature</p>
                    <div className="mt-2 space-y-2">
                      {ha.state.data?.temperatures.map((temp) => (
                        <div key={temp.entity_id} className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                          <span className="truncate text-zinc-200">{getFriendlyName(temp)}</span>
                          <span className="text-amber-200">{formatTemp(temp)}</span>
                        </div>
                      ))}
                      {ha.state.data && ha.state.data.temperatures.length === 0 && (
                        <p className="text-xs text-zinc-500">No temperature sensors detected.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Presence</p>
                    <div className="mt-2 space-y-2">
                      {ha.state.data?.presence.map((person) => (
                        <div key={person.entity_id} className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                          <span className="truncate text-zinc-200">{getFriendlyName(person)}</span>
                          <span className="text-sky-200">{person.state}</span>
                        </div>
                      ))}
                      {ha.state.data && ha.state.data.presence.length === 0 && (
                        <p className="text-xs text-zinc-500">No presence entities detected.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
