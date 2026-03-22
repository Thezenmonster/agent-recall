import type Database from "better-sqlite3";
import type { MemoryRecord, MemoryType, SearchOptions, RecallOptions } from "./types";

const TYPE_PATTERNS: [RegExp, MemoryType][] = [
  [/\b(error|bug|broke|fix|crash|fail|exception|traceback|stack\s?trace)\b/i, "bug"],
  [/\b(always|never|prefer|don'?t|must|banned|rule|avoid)\b/i, "decision"],
  [/\b(config|setting|speed|port|version|path|env|variable|flag)\b/i, "setting"],
  [/\b(step\s?\d|first|then|workflow|pipeline|run|execute|deploy)\b/i, "procedure"],
  [/\b(likes?|prefers?|told me|said|corrected|feedback|wants)\b/i, "feedback"],
];

export function inferType(content: string): MemoryType {
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(content)) return type;
  }
  return "context";
}

export function generateTitle(content: string): string {
  const firstSentence = content.split(/[.!?\n]/)[0]?.trim() ?? "";
  if (firstSentence.length > 0 && firstSentence.length <= 120) return firstSentence;
  return content.slice(0, 80).trim() + "...";
}

function rowToRecord(row: any, rank?: number): MemoryRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    tags: row.tags ? row.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    source: row.source,
    project: row.project,
    confidence: row.confidence,
    supersedes: row.supersedes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    accessed_at: row.accessed_at,
    access_count: row.access_count,
    rank,
  };
}

function recencyScore(accessedAt: string): number {
  try {
    const delta = (Date.now() - new Date(accessedAt).getTime()) / 1000;
    return Math.pow(2, -delta / (7 * 86400)); // 7-day half-life
  } catch {
    return 0.5;
  }
}

function frequencyScore(accessCount: number): number {
  if (accessCount <= 0) return 0;
  return Math.min(1.0, Math.log1p(accessCount) / Math.log1p(100));
}

export function ftsSearch(
  db: Database.Database,
  query: string,
  options: SearchOptions = {}
): MemoryRecord[] {
  const { type, tags, project, limit = 10 } = options;

  const terms = query.replace(/"/g, '""').split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const ftsQuery = terms.map((t) => `"${t}"`).join(" OR ");

  let conditions = "";
  const params: any[] = [ftsQuery];

  if (type) {
    conditions += " AND m.type = ?";
    params.push(type);
  }
  if (project) {
    conditions += " AND m.project = ?";
    params.push(project);
  }
  if (tags?.length) {
    for (const tag of tags) {
      conditions += " AND m.tags LIKE ?";
      params.push(`%${tag}%`);
    }
  }

  params.push(limit * 5);

  const sql = `
    SELECT m.*, fts.rank as fts_rank
    FROM memories_fts fts
    JOIN memories m ON m.rowid = fts.rowid
    WHERE memories_fts MATCH ?
    ${conditions}
    ORDER BY fts.rank
    LIMIT ?
  `;

  let rows: any[];
  try {
    rows = db.prepare(sql).all(...params);
  } catch {
    return [];
  }

  const scored = rows.map((row) => {
    const ftsRank = -row.fts_rank;
    const recency = recencyScore(row.accessed_at);
    const frequency = frequencyScore(row.access_count);
    const confidence = row.confidence;
    const composite = ftsRank * 0.4 + recency * 0.2 + frequency * 0.2 + confidence * 0.2;
    return { row, score: composite };
  });

  scored.sort((a, b) => b.score - a.score);

  const now = new Date().toISOString();
  const results = scored.slice(0, limit).map(({ row, score }) => {
    db.prepare(
      "UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?"
    ).run(now, row.id);
    return rowToRecord(row, Math.round(score * 10000) / 10000);
  });

  return results;
}

function formatRecord(record: MemoryRecord, format: string): string {
  if (format === "markdown") {
    const parts = [`### [${record.type}] ${record.title}`, record.content];
    if (record.tags.length) parts.push(`*tags: ${record.tags.join(", ")}*`);
    return parts.join("\n");
  }
  return `[${record.type}] ${record.title}\n${record.content}`;
}

export function recall(
  db: Database.Database,
  query: string,
  options: RecallOptions = {},
  project: string = ""
): string {
  const { max_tokens = 4000, format = "markdown" } = options;
  const tokenCount = (text: string) => Math.ceil(text.length / 4);

  const candidates = ftsSearch(db, query, { project, limit: 50 });
  if (candidates.length === 0) return "";

  const selected: string[] = [];
  let usedTokens = 0;

  for (const record of candidates) {
    const formatted = formatRecord(record, format);
    const tokens = tokenCount(formatted);
    if (usedTokens + tokens > max_tokens) continue;
    selected.push(formatted);
    usedTokens += tokens;
  }

  if (selected.length === 0) {
    return formatRecord(candidates[0], format).slice(0, max_tokens * 4);
  }

  const separator = format === "markdown" ? "\n\n---\n\n" : "\n\n";
  return selected.join(separator);
}
