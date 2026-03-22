import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Memory } from "./memory";
import { MEMORY_TYPES } from "./types";

export async function startServer(options: {
  dbPath?: string;
  project?: string;
} = {}): Promise<void> {
  const mem = new Memory(options);
  const server = new Server(
    { name: "agent-recall", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "remember",
        description:
          "Remember something for future sessions. Use when you learn a bug fix, user preference, decision, setting, or procedure worth keeping. The system auto-detects the category — just provide the content.",
        inputSchema: {
          type: "object" as const,
          properties: {
            content: {
              type: "string",
              description: "What to remember. Be specific — include the fix, the setting value, the decision rationale.",
            },
            type: {
              type: "string",
              enum: [...MEMORY_TYPES],
              description: "Optional category override. Auto-detected if omitted.",
            },
            title: {
              type: "string",
              description: "Optional short title. Auto-generated if omitted.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags for filtering.",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "recall",
        description:
          "Get the most relevant memories for a topic, fitted to a token budget. Use at the start of a task to load context, or when you need to remember how something was done before.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "What you need context about.",
            },
            max_tokens: {
              type: "number",
              description: "Maximum tokens to return. Default 4000.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search",
        description:
          "Search memories by keyword. Use when you're looking for a specific thing you stored before.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: { type: "string" },
            type: { type: "string", enum: [...MEMORY_TYPES] },
            limit: { type: "number", description: "Max results. Default 10." },
          },
          required: ["query"],
        },
      },
      {
        name: "forget",
        description: "Delete a memory by ID. Use when a memory is outdated or wrong.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string", description: "Memory ID to delete." },
          },
          required: ["id"],
        },
      },
      {
        name: "save_state",
        description:
          "Save your current working state before the conversation ends. Capture what's in progress, what's blocked, what's done, and key decisions. The next session can load this to continue where you left off.",
        inputSchema: {
          type: "object" as const,
          properties: {
            summary: {
              type: "string",
              description: "Full session state: in-progress work, blocked items, completed items, key decisions.",
            },
          },
          required: ["summary"],
        },
      },
      {
        name: "load_state",
        description:
          "Load the most recent session state. Call this at the start of a conversation to pick up where the last session left off.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
    switch (name) {
      case "remember": {
        const record = mem.remember(args!.content as string, {
          type: args!.type as any,
          title: args!.title as string,
          tags: args!.tags as string[],
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Remembered: ${record.id}\n[${record.type}] ${record.title}`,
            },
          ],
        };
      }

      case "recall": {
        const context = mem.recall(args!.query as string, {
          max_tokens: (args!.max_tokens as number) ?? 4000,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: context || "No relevant memories found.",
            },
          ],
        };
      }

      case "search": {
        const results = mem.search(args!.query as string, {
          type: args!.type as any,
          limit: (args!.limit as number) ?? 10,
        });
        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: "No results found." }] };
        }
        const lines = results.map(
          (r) =>
            `[${r.type}] ${r.title}${r.rank != null ? ` (score: ${r.rank.toFixed(3)})` : ""}\nid: ${r.id}\n${r.content.slice(0, 200)}`
        );
        return {
          content: [{ type: "text" as const, text: lines.join("\n\n---\n\n") }],
        };
      }

      case "forget": {
        const deleted = mem.forget(args!.id as string);
        return {
          content: [
            {
              type: "text" as const,
              text: deleted ? `Deleted: ${args!.id}` : `Not found: ${args!.id}`,
            },
          ],
        };
      }

      case "save_state": {
        const record = mem.saveState(args!.summary as string);
        return {
          content: [
            {
              type: "text" as const,
              text: `State saved: ${record.id}\n${record.content.slice(0, 200)}...`,
            },
          ],
        };
      }

      case "load_state": {
        const record = mem.loadState();
        if (record) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Last session (${record.created_at}):\n\n${record.content}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: "No previous session found." }],
        };
      }

      default:
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${error?.message ?? String(error)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
