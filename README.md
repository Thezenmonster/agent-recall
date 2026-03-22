# agent-recall

Your AI coding assistant forgets everything between sessions. Fix it in one command.

[![npm](https://img.shields.io/npm/v/agent-recall)](https://www.npmjs.com/package/agent-recall)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
npx agent-recall
```

That's it. Your AI assistant now has persistent memory.

## Setup (30 seconds)

Add agent-recall to your AI tool's MCP config:

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agent-recall": {
      "command": "npx",
      "args": ["-y", "agent-recall"]
    }
  }
}
```

### Cursor

Edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "agent-recall": {
      "command": "npx",
      "args": ["-y", "agent-recall"]
    }
  }
}
```

### Windsurf / Any MCP Client

Same pattern — point the MCP config at `npx agent-recall`.

Restart your AI tool. Done.

## What Your Agent Gets

Six tools that make it remember:

### `remember` — Store anything worth keeping

```
remember({ content: "The webpack config needs resolve.extensions for .tsx files" })
```

**Auto-categorises** — you don't pick a type. The system infers it:
- "error", "bug", "fix", "crash" → **bug**
- "always", "never", "prefer", "must" → **decision**
- "config", "setting", "port", "path" → **setting**
- "step 1", "then", "workflow" → **procedure**
- "prefers", "told me", "corrected" → **feedback**
- Everything else → **context**

### `recall` — Get context for what you're doing

```
recall({ query: "webpack build errors", max_tokens: 2000 })
```

Returns the most relevant memories **fitted to your token budget**. Ranked by text relevance, recency, access frequency, and confidence. This is the killer feature — one call loads exactly what the agent needs.

### `search` — Find something specific

```
search({ query: "loudnorm", type: "bug" })
```

### `forget` — Remove outdated memories

```
forget({ id: "memory-uuid-here" })
```

### `save_state` — Save working state before session ends

```
save_state({ summary: "Refactoring auth. Changed files: ... Blocked on: ..." })
```

### `load_state` — Pick up where you left off

```
load_state({})
```

The next session starts with full context of what the previous session was doing.

## How It Works

- **SQLite + FTS5** — instant full-text search, zero infrastructure
- **Auto-project detection** — reads your git repo name or package.json, scopes memories automatically
- **Token budgeting** — `recall()` fits results to your context window
- **WAL mode** — safe for concurrent reads
- **~/.agent-recall/memory.db** — one file, portable, inspectable

No vector database. No embeddings model. No API keys. No cloud.

## Why Not...

| Feature | mcp-memory | remember-mcp | agent-recall |
|---------|------------|--------------|--------------|
| Install | npm + 200MB embeddings | npm | **`npx` (zero install)** |
| Search | Vector (slow, heavy) | None | **FTS5 (instant)** |
| Token budget | No | No | **Yes** |
| Auto-typing | No | No | **Yes** |
| Session state | No | No | **Yes** |
| Auto-project | No | No | **Yes** |
| Dependencies | 5 + transformer model | 2 | **3** |
| Works offline | No (needs model) | Yes | **Yes** |

## CLI

```bash
npx agent-recall                    # start MCP server (default)
npx agent-recall search "webpack"   # search from terminal
npx agent-recall recall "auth"      # context-budgeted recall
npx agent-recall stats              # memory count + size
```

## Programmatic API

```typescript
import { Memory } from "agent-recall";

const mem = new Memory();

mem.remember("Never run migrations on Friday.");
mem.search("migration");
mem.recall("deployment checklist", { max_tokens: 2000 });

mem.saveState("Deploying v2.1. Database migrated. Waiting on CDN invalidation.");
mem.loadState(); // Next session picks up here
```

## Memory Types

| Type | Auto-detected when content contains | Example |
|------|-------------------------------------|---------|
| `bug` | error, fix, crash, fail | "CSS grid breaks in Safari 16" |
| `decision` | always, never, prefer, must | "Never use any in TypeScript" |
| `setting` | config, port, version, path | "API runs on port 3001 in dev" |
| `procedure` | step, first, then, workflow | "Deploy: build → test → push → tag" |
| `feedback` | prefers, told me, corrected | "User prefers functional components" |
| `context` | *(default)* | "This repo uses pnpm monorepo" |
| `session` | *(via save_state)* | Working state between sessions |

## License

MIT
