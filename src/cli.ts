#!/usr/bin/env node

import { Command } from "commander";
import { Memory } from "./memory";
import { startServer } from "./server";

const program = new Command();

program
  .name("agent-recall")
  .description("Your AI coding assistant forgets everything between sessions. Fix it in one command.")
  .version("0.1.0");

program
  .command("serve", { isDefault: true })
  .description("Start the MCP memory server")
  .option("--db <path>", "Database path")
  .option("--project <name>", "Project scope")
  .action(async (opts) => {
    await startServer({ dbPath: opts.db, project: opts.project });
  });

program
  .command("search <query>")
  .description("Search memories")
  .option("--type <type>", "Filter by type")
  .option("--limit <n>", "Max results", "10")
  .option("--db <path>", "Database path")
  .action((query, opts) => {
    const mem = new Memory({ dbPath: opts.db });
    const results = mem.search(query, {
      type: opts.type,
      limit: parseInt(opts.limit),
    });
    if (results.length === 0) {
      console.log("No results.");
    } else {
      for (const r of results) {
        const score = r.rank != null ? ` (score: ${r.rank.toFixed(3)})` : "";
        console.log(`\n  [${r.type}] ${r.title}${score}`);
        console.log(`  id: ${r.id}`);
        console.log(`  ${r.content.slice(0, 120).replace(/\n/g, " ")}...`);
      }
    }
    mem.close();
  });

program
  .command("recall <query>")
  .description("Get context-budgeted memories")
  .option("--tokens <n>", "Max token budget", "4000")
  .option("--db <path>", "Database path")
  .action((query, opts) => {
    const mem = new Memory({ dbPath: opts.db });
    const context = mem.recall(query, { max_tokens: parseInt(opts.tokens) });
    console.log(context || "No relevant memories found.");
    mem.close();
  });

program
  .command("stats")
  .description("Show memory statistics")
  .option("--db <path>", "Database path")
  .action((opts) => {
    const mem = new Memory({ dbPath: opts.db });
    const s = mem.stats();
    console.log(`Total memories: ${s.total}`);
    console.log(`Database size: ${s.db_size_kb} KB`);
    console.log(`Project: ${mem.project}`);
    if (Object.keys(s.by_type).length) {
      console.log("By type:");
      for (const [t, c] of Object.entries(s.by_type).sort()) {
        console.log(`  ${t}: ${c}`);
      }
    }
    mem.close();
  });

program
  .command("install <source>")
  .description("Install a knowledge pack. Use @packs/<name> for registry or path/to/pack.json for local.")
  .option("--db <path>", "Database path")
  .action(async (source, opts) => {
    const { installPack } = require("./packs");
    const mem = new Memory({ dbPath: opts.db });
    try {
      const result = await installPack(mem, source);
      console.log(`Installed pack: ${result.name}`);
      console.log(`  ${result.installed} memories added, ${result.skipped} skipped (duplicates)`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    mem.close();
  });

program
  .command("packs")
  .description("List installed knowledge packs")
  .option("--db <path>", "Database path")
  .action((opts) => {
    const { listInstalledPacks } = require("./packs");
    const mem = new Memory({ dbPath: opts.db });
    const packs = listInstalledPacks(mem);
    if (packs.length === 0) {
      console.log("No packs installed. Try: npx agent-recall install @packs/ffmpeg");
    } else {
      console.log("Installed packs:");
      for (const p of packs) {
        console.log(`  ${p.name}: ${p.count} memories`);
      }
    }
    mem.close();
  });

program.parse();
