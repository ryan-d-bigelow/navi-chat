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
    <div className="flex items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-800 p-2">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Navi..."
        disabled={isLoading}
        className="min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0"
        rows={1}
      />
      <Button
        onClick={onSubmit}
        disabled={!input.trim() || isLoading}
        size="icon"
        className="h-8 w-8 shrink-0 rounded-lg bg-zinc-600 hover:bg-zinc-500"
      >
        <SendHorizonal className="h-4 w-4" />
      </Button>
    </div>
  )
}
