'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SendHorizonal } from 'lucide-react'
import { useCallback, useRef, type KeyboardEvent, useEffect } from 'react'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
}

export function ChatInput({
  input,
  setInput,
  onSubmit,
  isLoading,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [input, adjustHeight])

  // Auto-focus input on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (input.trim() && !isLoading) {
          onSubmit()
        }
      }
    },
    [input, isLoading, onSubmit]
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (input.trim() && !isLoading) onSubmit()
      }}
      className="flex items-end gap-2 rounded-2xl border border-zinc-700/60 bg-zinc-800/80 p-2 shadow-lg shadow-black/10 backdrop-blur-sm transition-colors focus-within:border-zinc-600"
      role="search"
      aria-label="Send a message"
    >
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Navi..."
        aria-label="Message input — press Enter to send, Shift+Enter for new line"
        disabled={isLoading}
        className="min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0"
        rows={1}
      />
      <Button
        type="submit"
        disabled={!input.trim() || isLoading}
        size="icon"
        aria-label={isLoading ? 'Sending message...' : 'Send message'}
        className="min-h-11 min-w-11 shrink-0 rounded-xl bg-zinc-600 transition-all hover:bg-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-800 disabled:opacity-40"
      >
        <SendHorizonal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  )
}
