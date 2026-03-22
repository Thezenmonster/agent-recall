import type Database from "better-sqlite3";

export const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    tags         TEXT DEFAULT '',
    source       TEXT DEFAULT '',
    project      TEXT DEFAULT '',
    confidence   REAL DEFAULT 1.0,
    supersedes   TEXT DEFAULT '',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    accessed_at  TEXT NOT NULL,
    access_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    title,
    content,
    tags,
    content=memories,
    content_rowid=rowid,
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, title, content, tags)
    VALUES (new.rowid, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.tags);
    INSERT INTO memories_fts(rowid, title, content, tags)
    VALUES (new.rowid, new.title, new.content, new.tags);
END;

CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
`;

export function initDb(db: Database.Database): void {
  db.pragma("journal_mode = WAL");

  try {
    const row = db
      .prepare("SELECT MAX(version) as v FROM schema_version")
      .get() as { v: number } | undefined;
    if (row?.v && row.v >= SCHEMA_VERSION) return;
  } catch {
    // Table doesn't exist yet
  }

  db.exec(SCHEMA_SQL);
  db.prepare(
    "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, datetime('now'))"
  ).run(SCHEMA_VERSION);
}
