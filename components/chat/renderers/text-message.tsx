'use client'

import type { UIMessage } from 'ai'
import { useId, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CanvasBlock } from './canvas-block'
import { parseCanvasSegments } from './canvas-parser'
import { CodeBlock } from './code-block'
import { getMessageText } from '@/lib/ui-message-text'

interface TextMessageProps {
  message: UIMessage
  isStreaming?: boolean
}

export function TextMessage({ message }: TextMessageProps) {
  const content = getMessageText(message, { includeToolOutputs: true })
  const segments = parseCanvasSegments(content)
  const contentId = useId()
  const isLong = useMemo(() => {
    if (!content) return false
    const lineCount = content.split(/\r?\n/).length
    return content.length > 2400 || lineCount > 40
  }, [content])
  const [isExpanded, setIsExpanded] = useState(!isLong)

  return (
    <div className="text-sm leading-[1.6] text-zinc-200">
      <div
        id={contentId}
        className={`relative ${
          isExpanded || !isLong
            ? 'max-h-none'
            : 'max-h-[420px] overflow-hidden'
        }`}
      >
        {segments.map((segment, index) => {
          if (segment.type === 'canvas') {
            return (
              <CanvasBlock
                key={`canvas-${index}-${segment.content}`}
                content={segment.content}
              />
            )
          }

          if (!segment.content) return null

          return (
            <ReactMarkdown
              key={`text-${index}`}
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-3 last:mb-0">{children}</p>
                ),
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
                pre: ({ children }) => (
                  <pre className="mb-3 last:mb-0">{children}</pre>
                ),
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
                  <td className="border border-zinc-700 px-3 py-1.5">
                    {children}
                  </td>
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
              {segment.content}
            </ReactMarkdown>
          )
        })}
        {isLong && !isExpanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-zinc-900" />
        )}
      </div>
      {isLong && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            className="rounded-full border border-zinc-700/70 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
}
