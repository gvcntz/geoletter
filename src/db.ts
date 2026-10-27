import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Kind = 'flower' | 'candle' | 'letter' | 'item';
export type Status = 'queued' | 'approved' | 'rejected' | 'failed';

export interface Offering {
  id: string;
  kind: Kind;
  lat: number;
  lng: number;
  place: string;
  to_name: string;
  from_name: string;
  body: string;
  lang: string | null;
  lang_hint: string | null;
  status: Status;
  mod_reason: string | null;
  mod_categories: string | null;
  mod_model: string | null;
  mod_ms: number | null;
  attempts: number;
  locked: number;
  lock_radius_m: number;
  author_key_hash: string;
  sender_hash: string | null;
  is_example: number;
  created_at: number;
  moderated_at: number | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS offerings (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('flower','candle','letter','item')),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  to_name TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  lang TEXT,
  lang_hint TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  mod_reason TEXT,
  mod_categories TEXT,
  mod_model TEXT,
  mod_ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  lock_radius_m INTEGER NOT NULL DEFAULT 200,
  author_key_hash TEXT NOT NULL,
  sender_hash TEXT,
  is_example INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  moderated_at INTEGER
);
CREATE INDEX IF NOT EXISTS offerings_status ON offerings (status, created_at);
CREATE INDEX IF NOT EXISTS offerings_geo ON offerings (lat, lng);

-- The recipient address lives here only until the guardian decides.
-- After sending (or rejection) the row is deleted; only hashes remain.
CREATE TABLE IF NOT EXISTS pending_emails (
  offering_id TEXT PRIMARY KEY REFERENCES offerings(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_hash TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  offering_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_log_sender ON email_log (sender_hash, created_at);
CREATE INDEX IF NOT EXISTS email_log_recipient ON email_log (email_hash, created_at);

CREATE TABLE IF NOT EXISTS email_blocklist (
  email_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS translations (
  offering_id TEXT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  body TEXT NOT NULL,
  model TEXT NOT NULL,
  ms INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (offering_id, lang)
);

CREATE TABLE IF NOT EXISTS geocache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

export type DB = DatabaseSync;
