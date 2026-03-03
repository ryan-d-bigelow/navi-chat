'use client'

import { Bell, BellOff } from 'lucide-react'
import { usePushNotifications } from '@/lib/hooks/use-push-notifications'

export function NotificationToggle() {
  const { isSupported, isSubscribed, subscribe, unsubscribe } =
    usePushNotifications()

  if (!isSupported) return null

  return (
    <button
      onClick={isSubscribed ? unsubscribe : subscribe}
      aria-label={
        isSubscribed ? 'Disable notifications' : 'Enable notifications'
      }
      aria-pressed={isSubscribed}
      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-ring ${
        isSubscribed
          ? 'bg-zinc-800 text-amber-400'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
      }`}
    >
      {isSubscribed ? (
        <Bell className="h-4 w-4" aria-hidden="true" />
      ) : (
        <BellOff className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  )
}
