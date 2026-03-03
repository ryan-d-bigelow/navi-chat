import { NextResponse } from 'next/server'
import { loadSubscriptions, saveSubscriptions } from '@/lib/push-subscriptions'
import { getConfiguredWebPush } from '@/lib/vapid'

interface SendRequest {
  title?: string
  body?: string
  url?: string
}

export async function POST(req: Request) {
  try {
    const { title, body, url } = (await req.json()) as SendRequest

    if (!title && !body) {
      return NextResponse.json(
        { error: 'At least title or body is required' },
        { status: 400 },
      )
    }

    const wp = getConfiguredWebPush()
    const subs = loadSubscriptions()

    if (subs.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No subscriptions' })
    }

    const payload = JSON.stringify({
      title: title || 'Navi Chat',
      body: body || 'Notification from Navi Chat',
      url: url || '/',
    })

    const expiredEndpoints: string[] = []
    let sent = 0

    const results = await Promise.allSettled(
      subs.map((sub) =>
        wp.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          payload,
        ),
      ),
    )

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        sent++
      } else {
        const statusCode = result.reason?.statusCode as number | undefined
        // 404 or 410 means the subscription is no longer valid
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(subs[i].endpoint)
        }
      }
    })

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      const remaining = subs.filter(
        (s) => !expiredEndpoints.includes(s.endpoint),
      )
      saveSubscriptions(remaining)
    }

    return NextResponse.json({
      sent,
      expired: expiredEndpoints.length,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to send notifications' },
      { status: 500 },
    )
  }
}
