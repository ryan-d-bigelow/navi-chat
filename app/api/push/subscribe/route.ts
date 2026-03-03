import { NextResponse } from 'next/server'
import { addSubscription, removeSubscription } from '@/lib/push-subscriptions'
import { getVapidKeys } from '@/lib/vapid'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { endpoint, keys } = body as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription: missing endpoint or keys' },
        { status: 400 },
      )
    }

    addSubscription({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const { endpoint } = body as { endpoint?: string }

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint' },
        { status: 400 },
      )
    }

    removeSubscription(endpoint)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Failed to remove subscription' },
      { status: 500 },
    )
  }
}

/** GET /api/push/subscribe — returns the VAPID public key for client-side subscription */
export async function GET() {
  try {
    const keys = getVapidKeys()
    return NextResponse.json({ publicKey: keys.publicKey })
  } catch {
    return NextResponse.json(
      { error: 'Failed to get VAPID keys' },
      { status: 500 },
    )
  }
}
