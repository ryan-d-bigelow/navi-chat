import { NextResponse } from 'next/server'

const HA_URL = process.env.HOME_ASSISTANT_URL ?? 'http://10.0.0.74:8123'
const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwZDhmOGNhOTEyMDE0YjA5YWZmN2JiMTgyYzkwMDE2YyIsImlhdCI6MTc3MjA3OTc1NSwiZXhwIjoyMDg3NDM5NzU1fQ.qylYUKfc0nTCGrzTclSrXDr3WiC3YHy2S5CrDMZKOfA'

type HaState = {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
}

function pickLocks(states: HaState[]): HaState[] {
  return states.filter((s) => s.entity_id.startsWith('lock.')).slice(0, 3)
}

function pickTemps(states: HaState[]): HaState[] {
  const temps = states.filter((s) => {
    if (!s.entity_id.startsWith('sensor.')) return false
    const attrs = s.attributes ?? {}
    const deviceClass = String(attrs.device_class ?? '')
    const unit = String(attrs.unit_of_measurement ?? '')
    return deviceClass === 'temperature' || unit === '°F' || unit === '°C'
  })
  return temps.slice(0, 3)
}

function pickPresence(states: HaState[]): HaState[] {
  const persons = states.filter((s) => s.entity_id.startsWith('person.')).slice(0, 2)
  if (persons.length > 0) return persons
  return states.filter((s) => s.entity_id.startsWith('device_tracker.')).slice(0, 2)
}

export async function GET() {
  if (!HA_URL || !HA_TOKEN) {
    return NextResponse.json({ error: 'Home Assistant not configured' }, { status: 500 })
  }

  try {
    const base = HA_URL.replace(/\/$/, '')
    const res = await fetch(`${base}/api/states`, {
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Home Assistant API error: ${res.status}` }, { status: res.status })
    }

    const states = (await res.json()) as HaState[]

    return NextResponse.json({
      locks: pickLocks(states),
      temperatures: pickTemps(states),
      presence: pickPresence(states),
    })
  } catch (err) {
    console.error('[home ha] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch Home Assistant state' }, { status: 500 })
  }
}
