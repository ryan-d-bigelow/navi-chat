'use client'

import { useCallback, useEffect, useState } from 'react'

interface PushNotificationState {
  isSupported: boolean
  isSubscribed: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

export function usePushNotifications(): PushNotificationState {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    setIsSupported(true)

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        setRegistration(reg)
        return reg.pushManager.getSubscription()
      })
      .then((sub) => {
        setIsSubscribed(sub !== null)
      })
      .catch(() => {
        // Service worker registration failed — not supported in this context
        setIsSupported(false)
      })
  }, [])

  const subscribe = useCallback(async () => {
    if (!registration) return

    try {
      // Fetch the VAPID public key from the server
      const res = await fetch('/api/push/subscribe')
      const { publicKey } = (await res.json()) as { publicKey: string }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })

      const subJson = subscription.toJSON()

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      })

      setIsSubscribed(true)
    } catch {
      // User denied permission or subscription failed
    }
  }, [registration])

  const unsubscribe = useCallback(async () => {
    if (!registration) return

    try {
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) return

      const endpoint = subscription.endpoint

      await subscription.unsubscribe()

      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })

      setIsSubscribed(false)
    } catch {
      // Unsubscribe failed
    }
  }, [registration])

  return { isSupported, isSubscribed, subscribe, unsubscribe }
}
