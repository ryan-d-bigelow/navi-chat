'use client'

import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface CodeBlockProps {
  language: string
  children: string
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  return (
    <div className="group relative mb-3 overflow-x-auto rounded-lg border border-zinc-700/50 last:mb-0">
      <div className="flex items-center justify-between bg-zinc-800/80 px-4 py-2 sm:py-1.5">
        <span className="text-xs text-zinc-400">{language}</span>
        <button
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : `Copy ${language} code`}
          className="flex min-h-[44px] items-center gap-1 rounded px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-800 sm:min-h-0 sm:px-1.5 sm:py-0.5"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '0.8125rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
