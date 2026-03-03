import fs from 'fs'
import path from 'path'
import webPush from 'web-push'

interface VapidKeys {
  publicKey: string
  privateKey: string
}

const DATA_DIR = path.join(
  process.env.HOME || '/tmp',
  '.openclaw',
  'workspace',
  'data',
)

const VAPID_PATH = path.join(DATA_DIR, 'vapid-keys.json')

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function getVapidKeys(): VapidKeys {
  ensureDataDir()

  if (fs.existsSync(VAPID_PATH)) {
    const raw = fs.readFileSync(VAPID_PATH, 'utf-8')
    return JSON.parse(raw) as VapidKeys
  }

  const keys = webPush.generateVAPIDKeys()
  const vapid: VapidKeys = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  }

  fs.writeFileSync(VAPID_PATH, JSON.stringify(vapid, null, 2), 'utf-8')
  return vapid
}

export function getConfiguredWebPush(): typeof webPush {
  const keys = getVapidKeys()
  webPush.setVapidDetails(
    'mailto:navi@localhost',
    keys.publicKey,
    keys.privateKey,
  )
  return webPush
}
