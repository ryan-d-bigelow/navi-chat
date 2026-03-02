import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(
  process.env.HOME ?? '/Users/naviagent',
  '.openclaw/workspace/data/navi.db'
)

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    _db.exec(`
      CREATE TABLE IF NOT EXISTS navi_chat_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS navi_chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES navi_chat_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `)
  }
  return _db
}

export interface DbConversation {
  id: string
  title: string
  created_at: number
  updated_at: number
}

export interface DbMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ConversationWithPreview extends DbConversation {
  last_message_preview: string | null
}

export function listConversations(): ConversationWithPreview[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT c.*, (
        SELECT substr(m.content, 1, 80)
        FROM navi_chat_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.timestamp DESC
        LIMIT 1
      ) AS last_message_preview
      FROM navi_chat_conversations c
      ORDER BY c.updated_at DESC`
    )
    .all() as ConversationWithPreview[]
}

export function createConversation(id: string, title: string): DbConversation {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    'INSERT INTO navi_chat_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, title, now, now)
  return { id, title, created_at: now, updated_at: now }
}

export function deleteConversation(id: string): boolean {
  const db = getDb()
  const result = db
    .prepare('DELETE FROM navi_chat_conversations WHERE id = ?')
    .run(id)
  return result.changes > 0
}

export function getMessages(conversationId: string): DbMessage[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM navi_chat_messages WHERE conversation_id = ? ORDER BY timestamp ASC'
    )
    .all(conversationId) as DbMessage[]
}

export function appendMessage(msg: DbMessage): DbMessage {
  const db = getDb()
  db.prepare(
    'INSERT INTO navi_chat_messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
  ).run(msg.id, msg.conversation_id, msg.role, msg.content, msg.timestamp)
  db.prepare(
    'UPDATE navi_chat_conversations SET updated_at = ? WHERE id = ?'
  ).run(msg.timestamp, msg.conversation_id)
  return msg
}

export function updateConversationTitle(id: string, title: string): void {
  const db = getDb()
  db.prepare(
    'UPDATE navi_chat_conversations SET title = ?, updated_at = ? WHERE id = ?'
  ).run(title, Date.now(), id)
}
