import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Memory } from "./memory";
import type { MemoryType } from "./types";
import { MEMORY_TYPES } from "./types";

export interface PackEntry {
  content: string;
  type?: MemoryType;
  title?: string;
  tags?: string[];
}

export interface Pack {
  name: string;
  description: string;
  version: string;
  author?: string;
  entries: PackEntry[];
}

const REGISTRY_URL = "https://raw.githubusercontent.com/Thezenmonster/agent-recall-packs/main";

export async function installPack(
  mem: Memory,
  source: string
): Promise<{ installed: number; skipped: number; name: string }> {
  let pack: Pack;

  if (source.startsWith("@packs/")) {
    // Registry pack — fetch from GitHub
    const packName = source.replace("@packs/", "");
    const url = `${REGISTRY_URL}/packs/${packName}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Pack not found: ${source} (${res.status} from ${url})`);
    }
    pack = (await res.json()) as Pack;
  } else if (source.endsWith(".json") && existsSync(source)) {
    // Local file
    pack = JSON.parse(readFileSync(source, "utf-8")) as Pack;
  } else {
    throw new Error(
      `Invalid pack source: ${source}. Use @packs/<name> for registry or path/to/pack.json for local.`
    );
  }

  if (!pack.name || !pack.entries?.length) {
    throw new Error("Invalid pack format: missing name or entries.");
  }

  // Check what's already installed to avoid duplicates
  const existing = mem.search(pack.name, { limit: 200 });
  const existingContents = new Set(existing.map((r) => r.content.slice(0, 100)));

  let installed = 0;
  let skipped = 0;

  for (const entry of pack.entries) {
    // Skip if similar content already exists
    if (existingContents.has(entry.content.slice(0, 100))) {
      skipped++;
      continue;
    }

    const tags = [...(entry.tags ?? []), `pack:${pack.name}`];

    mem.remember(entry.content, {
      type: entry.type && MEMORY_TYPES.includes(entry.type) ? entry.type : undefined,
      title: entry.title,
      tags,
      source: `pack:${pack.name}@${pack.version}`,
    });
    installed++;
  }

  return { installed, skipped, name: pack.name };
}

export function listInstalledPacks(mem: Memory): { name: string; count: number }[] {
  const rows = mem.search("pack:", { limit: 500 });
  const packs = new Map<string, number>();

  for (const row of rows) {
    const packTag = row.tags.find((t) => t.startsWith("pack:"));
    if (packTag) {
      const name = packTag.replace("pack:", "");
      packs.set(name, (packs.get(name) ?? 0) + 1);
    }
  }

  return Array.from(packs.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
