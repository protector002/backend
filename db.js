// db.js — SQLite database setup
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'churchconnect.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT DEFAULT NULL,
      bio TEXT DEFAULT '',
      church_role TEXT DEFAULT 'member' CHECK(church_role IN ('pastor','leader','member','admin')),
      is_online INTEGER DEFAULT 0,
      last_seen TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT DEFAULT 'direct' CHECK(type IN ('direct','group','announcement')),
      name TEXT,
      description TEXT,
      avatar_url TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member' CHECK(role IN ('admin','moderator','member')),
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT REFERENCES users(id),
      type TEXT DEFAULT 'text' CHECK(type IN ('text','image','audio','file','bible_verse','prayer')),
      content TEXT NOT NULL,
      media_url TEXT,
      reply_to_id TEXT REFERENCES messages(id),
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_receipts (
      id TEXT PRIMARY KEY,
      message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'delivered' CHECK(status IN ('sent','delivered','read')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS prayer_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_anonymous INTEGER DEFAULT 0,
      is_answered INTEGER DEFAULT 0,
      pray_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      author_id TEXT REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT DEFAULT 'service',
      location TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('✅ Database initialized');
}

module.exports = { db, initDB };
