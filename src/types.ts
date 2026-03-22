export const MEMORY_TYPES = [
  "setting",
  "bug",
  "decision",
  "procedure",
  "context",
  "feedback",
  "session",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  source: string;
  project: string;
  confidence: number;
  supersedes: string;
  created_at: string;
  updated_at: string;
  accessed_at: string;
  access_count: number;
  rank?: number;
}

export interface AddOptions {
  type?: MemoryType;
  title?: string;
  tags?: string[];
  source?: string;
  project?: string;
  confidence?: number;
  supersedes?: string;
}

export interface SearchOptions {
  type?: MemoryType;
  tags?: string[];
  project?: string;
  limit?: number;
}

export interface RecallOptions {
  max_tokens?: number;
  format?: "markdown" | "plain";
}
