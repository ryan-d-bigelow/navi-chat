'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SidebarNav } from '@/components/chat/sidebar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { CodeBlock } from '@/components/chat/renderers/code-block'
import { RefreshCw, Save } from 'lucide-react'

function formatTime(ts: number | null) {
  if (!ts) return 'Not saved yet'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MemoryPage() {
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  const isDirty = draft !== content

  const loadMemory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/memory')
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || 'Failed to load memory')
      }
      const data = (await res.json()) as { content?: string }
      const next = typeof data.content === 'string' ? data.content : ''
      setContent(next)
      setDraft(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveMemory = useCallback(async () => {
    if (saving || !isDirty) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || 'Failed to save memory')
      }
      setContent(draft)
      setLastSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save memory')
    } finally {
      setSaving(false)
    }
  }, [draft, isDirty, saving])

  useEffect(() => {
    loadMemory()
  }, [loadMemory])

  const statusLabel = useMemo(() => {
    if (loading) return 'Loading memory…'
    if (saving) return 'Saving…'
    if (error) return 'Error'
    if (isDirty) return 'Unsaved changes'
    return 'Up to date'
  }, [loading, saving, error, isDirty])

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-900 text-zinc-100">
      {/* Desktop sidebar */}
      <aside className="glass hidden w-[220px] flex-col border-r border-zinc-800/60 md:flex">
        <SidebarNav />
        <Separator className="bg-zinc-800/60" />
        <div className="space-y-3 p-4 text-xs text-zinc-400">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Memory File
            </p>
            <p className="mt-2 break-words text-zinc-300">
              /Users/naviagent/.openclaw/workspace/MEMORY.md
            </p>
          </div>
          <Separator className="bg-zinc-800/60" />
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Status
            </p>
            <p className={error ? 'text-rose-400' : 'text-zinc-300'}>
              {statusLabel}
            </p>
            <p className="text-zinc-500">Last saved: {formatTime(lastSavedAt)}</p>
          </div>
          <Button
            variant="outline"
            onClick={loadMemory}
            disabled={loading || saving}
            className="w-full justify-start gap-2 border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </Button>
          <Button
            onClick={saveMemory}
            disabled={!isDirty || saving || loading}
            className="w-full justify-start gap-2 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
          >
            <Save className="h-3.5 w-3.5" />
            Save changes
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden">
          <SidebarNav />
          <Separator className="bg-zinc-800/60" />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 bg-zinc-950/60 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Memory Visualizer
            </p>
            <h1 className="text-lg font-semibold text-zinc-100">MEMORY.md</h1>
            <p className={`text-xs ${error ? 'text-rose-400' : 'text-zinc-500'}`}>
              {statusLabel} · Last saved: {formatTime(lastSavedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={loadMemory}
              disabled={loading || saving}
              className="gap-2 border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
            <Button
              onClick={saveMemory}
              disabled={!isDirty || saving || loading}
              className="gap-2 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>

        {error && (
          <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="grid h-full grid-rows-2 gap-4 md:grid-cols-2 md:grid-rows-1">
            <section className="flex min-h-0 flex-col rounded-xl border border-zinc-800/70 bg-zinc-950/40">
              <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
                <p className="text-xs font-semibold text-zinc-300">Rendered</p>
                <span className="text-[11px] text-zinc-500">Preview</span>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4 text-sm text-zinc-200">
                  {loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-3/4 bg-zinc-800" />
                      <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                      <Skeleton className="h-4 w-1/2 bg-zinc-800" />
                      <Skeleton className="h-4 w-5/6 bg-zinc-800" />
                    </div>
                  ) : (
                    <MarkdownPreview content={draft} />
                  )}
                </div>
              </ScrollArea>
            </section>

            <section className="flex min-h-0 flex-col rounded-xl border border-zinc-800/70 bg-zinc-950/40">
              <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
                <p className="text-xs font-semibold text-zinc-300">Raw Markdown</p>
                <span className="text-[11px] text-zinc-500">
                  {draft.length.toLocaleString()} chars
                </span>
              </div>
              <div className="min-h-0 flex-1 p-3">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="h-full min-h-0 resize-none border-zinc-800/70 bg-zinc-900/60 font-mono text-xs text-zinc-100 focus-visible:border-zinc-600 focus-visible:ring-zinc-500/40 md:text-sm"
                />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700/60 bg-zinc-900/40 p-4 text-center text-xs text-zinc-500">
        No memory content yet. Start typing to populate MEMORY.md.
      </div>
    )
  }

  return (
    <div className="text-sm leading-[1.6] text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            if (match) {
              return (
                <CodeBlock language={match[1]}>
                  {String(children).replace(/\n$/, '')}
                </CodeBlock>
              )
            }
            return (
              <code
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
          ul: ({ children }) => (
            <ul className="mb-3 list-disc pl-6 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal pl-6 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="mb-1">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline decoration-blue-400/30 underline-offset-2 transition-colors hover:text-blue-300 hover:decoration-blue-300/50 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            >
              {children}
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-zinc-600 pl-4 italic text-zinc-400 last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-700 px-3 py-1.5">{children}</td>
          ),
          h1: ({ children }) => (
            <h1 className="mb-3 text-xl font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 text-lg font-bold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-base font-semibold">{children}</h3>
          ),
          hr: () => <hr className="my-4 border-zinc-700" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
