import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

import { initDb } from "./schema";
import { ftsSearch, recall, inferType, generateTitle } from "./search";
import type { MemoryRecord, MemoryType, AddOptions, SearchOptions, RecallOptions } from "./types";
import { MEMORY_TYPES } from "./types";

function detectProject(cwd: string): string {
  // 1. Git repo name
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return basename(gitRoot);
  } catch {
    // Not a git repo
  }

  // 2. package.json name
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name.replace(/^@[^/]+\//, "");
    } catch {
      // Invalid package.json
    }
  }

  // 3. Directory basename
  return basename(cwd);
}

function defaultDbPath(cwd: string): string {
  // Project-local override
  const localDir = join(cwd, ".agent-recall");
  if (existsSync(localDir)) return join(localDir, "memory.db");

  // Global default
  const globalDir = join(homedir(), ".agent-recall");
  return join(globalDir, "memory.db");
}

export class Memory {
  private db: Database.Database;
  readonly project: string;
  readonly dbPath: string;

  constructor(options: { dbPath?: string; project?: string; cwd?: string } = {}) {
    const cwd = options.cwd ?? process.cwd();
    this.project = options.project ?? detectProject(cwd);
    this.dbPath = options.dbPath ?? defaultDbPath(cwd);

    // Ensure directory exists
    const dir = join(this.dbPath, "..");
    const { mkdirSync } = require("fs");
    mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    initDb(this.db);
  }

  remember(content: string, options: AddOptions = {}): MemoryRecord {
    const type = options.type ?? inferType(content);
    const title = options.title ?? generateTitle(content);
    return this.add(type, title, content, options);
  }

  add(
    type: MemoryType,
    title: string,
    content: string,
    options: AddOptions = {}
  ): MemoryRecord {
    if (!MEMORY_TYPES.includes(type)) {
      throw new Error(`Invalid type '${type}'. Must be one of: ${MEMORY_TYPES.join(", ")}`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const tags = options.tags?.join(",") ?? "";
    const project = options.project ?? this.project;

    this.db
      .prepare(
        `INSERT INTO memories
         (id, type, title, content, tags, source, project, confidence,
          supersedes, created_at, updated_at, accessed_at, access_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        id, type, title, content, tags,
        options.source ?? "api", project,
        options.confidence ?? 1.0, options.supersedes ?? "",
        now, now, now
      );

    return {
      id, type, title, content,
      tags: options.tags ?? [],
      source: options.source ?? "api",
      project,
      confidence: options.confidence ?? 1.0,
      supersedes: options.supersedes ?? "",
      created_at: now, updated_at: now, accessed_at: now,
      access_count: 0,
    };
  }

  get(id: string): MemoryRecord | null {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as any;
    if (!row) return null;

    this.db
      .prepare("UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?")
      .run(new Date().toISOString(), id);

    return {
      ...row,
      tags: row.tags ? row.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    };
  }

  update(id: string, updates: Partial<Pick<MemoryRecord, "title" | "content" | "tags" | "type" | "confidence">>): MemoryRecord | null {
    const record = this.get(id);
    if (!record) return null;

    const sets: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) { sets.push("title = ?"); values.push(updates.title); }
    if (updates.content !== undefined) { sets.push("content = ?"); values.push(updates.content); }
    if (updates.tags !== undefined) { sets.push("tags = ?"); values.push(updates.tags.join(",")); }
    if (updates.type !== undefined) { sets.push("type = ?"); values.push(updates.type); }
    if (updates.confidence !== undefined) { sets.push("confidence = ?"); values.push(updates.confidence); }

    if (sets.length === 0) return record;

    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return this.get(id);
  }

  forget(id: string): boolean {
    const result = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    return result.changes > 0;
  }

  search(query: string, options: SearchOptions = {}): MemoryRecord[] {
    return ftsSearch(this.db, query, { ...options, project: options.project ?? this.project });
  }

  recall(query: string, options: RecallOptions = {}): string {
    return recall(this.db, query, options, this.project);
  }

  list(options: { type?: MemoryType; limit?: number; since?: string } = {}): MemoryRecord[] {
    const { type, limit = 50, since } = options;
    const conditions: string[] = [];
    const params: any[] = [];

    conditions.push("project = ?");
    params.push(this.project);

    if (type) { conditions.push("type = ?"); params.push(type); }
    if (since) { conditions.push("created_at >= ?"); params.push(since); }

    params.push(limit);

    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)
      .all(...params) as any[];

    return rows.map((row) => ({
      ...row,
      tags: row.tags ? row.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    }));
  }

  saveState(summary: string, tags: string[] = ["session", "state"]): MemoryRecord {
    const prev = this.db
      .prepare("SELECT id FROM memories WHERE type = 'session' AND project = ? ORDER BY created_at DESC LIMIT 1")
      .get(this.project) as { id: string } | undefined;

    return this.add("session", `Session state — ${this.project}`, summary, {
      tags,
      source: "session",
      supersedes: prev?.id ?? "",
    });
  }

  loadState(): MemoryRecord | null {
    const row = this.db
      .prepare("SELECT * FROM memories WHERE type = 'session' AND project = ? ORDER BY created_at DESC LIMIT 1")
      .get(this.project) as any;

    if (!row) return null;

    this.db
      .prepare("UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?")
      .run(new Date().toISOString(), row.id);

    return {
      ...row,
      tags: row.tags ? row.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    };
  }

  stats(): { total: number; by_type: Record<string, number>; db_size_kb: number } {
    const total = (this.db.prepare("SELECT COUNT(*) as c FROM memories").get() as any).c;
    const by_type: Record<string, number> = {};
    const rows = this.db.prepare("SELECT type, COUNT(*) as c FROM memories GROUP BY type").all() as any[];
    for (const row of rows) by_type[row.type] = row.c;

    let db_size_kb = 0;
    try { db_size_kb = Math.round(statSync(this.dbPath).size / 1024 * 10) / 10; } catch {}

    return { total, by_type, db_size_kb };
  }

  close(): void {
    this.db.close();
  }
}
