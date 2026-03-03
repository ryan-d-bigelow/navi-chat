import fs from 'fs'
import path from 'path'

export interface StoredSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

const DATA_DIR = path.join(
  process.env.HOME || '/tmp',
  '.openclaw',
  'workspace',
  'data',
)

const SUBSCRIPTIONS_PATH = path.join(DATA_DIR, 'push-subscriptions.json')

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function loadSubscriptions(): StoredSubscription[] {
  ensureDataDir()

  if (!fs.existsSync(SUBSCRIPTIONS_PATH)) {
    return []
  }

  try {
    const raw = fs.readFileSync(SUBSCRIPTIONS_PATH, 'utf-8')
    return JSON.parse(raw) as StoredSubscription[]
  } catch {
    return []
  }
}

export function saveSubscriptions(subs: StoredSubscription[]): void {
  ensureDataDir()
  fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(subs, null, 2), 'utf-8')
}

export function addSubscription(sub: StoredSubscription): void {
  const subs = loadSubscriptions()
  const existing = subs.findIndex((s) => s.endpoint === sub.endpoint)
  if (existing >= 0) {
    subs[existing] = sub
  } else {
    subs.push(sub)
  }
  saveSubscriptions(subs)
}

export function removeSubscription(endpoint: string): void {
  const subs = loadSubscriptions().filter((s) => s.endpoint !== endpoint)
  saveSubscriptions(subs)
}
