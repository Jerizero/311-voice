import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';

const dataDir = join(homedir(), '.311-voice');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'complaints.db');
const db: DatabaseType = new Database(dbPath);

// Initialize schema using better-sqlite3's run method for DDL
const schema = `
  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    fields TEXT NOT NULL,
    confirmation_number TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    submitted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER REFERENCES complaints(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_complaints_type ON complaints(type);
  CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
`;

// Split and run each statement separately
for (const statement of schema.split(';').filter(s => s.trim())) {
  db.prepare(statement).run();
}

export default db;
