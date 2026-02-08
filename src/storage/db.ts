import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';

let db: DatabaseType | null = null;
let dbPath: string | null = null;

const SCHEMA = `
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

function runSchema(database: DatabaseType): void {
  for (const statement of SCHEMA.split(';').filter(s => s.trim())) {
    database.prepare(statement).run();
  }
}

/** Get the database instance, creating it lazily if needed */
export function getDb(): DatabaseType {
  if (!db) {
    if (!dbPath) {
      const dataDir = join(homedir(), '.311-voice');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      dbPath = join(dataDir, 'complaints.db');
    }
    db = new Database(dbPath);
    runSchema(db);
  }
  return db;
}

/** Initialize with a custom database path (call before first getDb) */
export function initDb(customPath: string): DatabaseType {
  closeDb();
  dbPath = customPath;
  return getDb();
}

/** Initialize an in-memory database for testing */
export function initTestDb(): DatabaseType {
  closeDb();
  dbPath = ':memory:';
  db = new Database(':memory:');
  runSchema(db);
  return db;
}

/** Close the database connection */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
  dbPath = null;
}

/** Reset database state (for test isolation) */
export function resetDb(): void {
  if (db) {
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM complaints').run();
  }
}
