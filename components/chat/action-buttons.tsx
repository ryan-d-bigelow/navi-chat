'use client'

import { Button } from '@/components/ui/button'
import type { ActionOption } from '@/lib/action-buttons'

interface ActionButtonsProps {
  options: ActionOption[]
  onSelect: (value: string) => void
}

export function ActionButtons({ options, onSelect }: ActionButtonsProps) {
  return (
    <div
      className="flex flex-wrap gap-2 animate-fade-in"
      role="group"
      aria-label="Suggested replies"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant="outline"
          size="sm"
          onClick={() => onSelect(option.value)}
          className="border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700/80 hover:text-zinc-100"
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
