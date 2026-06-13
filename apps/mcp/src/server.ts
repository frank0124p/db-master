/**
 * DB Master MCP Server
 *
 * Exposes read-only data governance tools for LLM clients (Claude Code,
 * Claude Desktop, custom chatbots) via Model Context Protocol.
 *
 * Modes:
 *   stdio (default) — for local Claude Code integration, trusted local process
 *   HTTP (MCP_HTTP_PORT) — for remote/multi-client usage, requires Bearer token
 *
 * Environment variables:
 *   DBMASTER_API_URL    — db-master API base URL (default: http://localhost:3005)
 *   DBMASTER_MCP_TOKEN  — Bearer token for HTTP mode auth
 *   MCP_HTTP_PORT       — if set, start HTTP server on this port instead of stdio
 *   MCP_ENABLE_ASK      — if "true", register the ask tool (off by default)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { DbMasterClient } from "./client.js";
import { verifyToken, RateLimiter } from "./auth.js";

import {
  SEARCH_ASSETS_NAME,
  SEARCH_ASSETS_DESCRIPTION,
  SEARCH_ASSETS_SCHEMA,
  handleSearchAssets,
} from "./tools/search-assets.js";
import {
  GET_ASSET_NAME,
  GET_ASSET_DESCRIPTION,
  GET_ASSET_SCHEMA,
  handleGetAsset,
} from "./tools/get-asset.js";
import {
  GET_JOIN_PATH_NAME,
  GET_JOIN_PATH_DESCRIPTION,
  GET_JOIN_PATH_SCHEMA,
  handleGetJoinPath,
} from "./tools/get-join-path.js";
import {
  LIST_CONCEPTS_NAME,
  LIST_CONCEPTS_DESCRIPTION,
  LIST_CONCEPTS_SCHEMA,
  handleListConcepts,
} from "./tools/list-concepts.js";
import {
  ASK_NAME,
  ASK_DESCRIPTION,
  ASK_SCHEMA,
  handleAsk,
} from "./tools/ask.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env["DBMASTER_API_URL"] ?? "http://localhost:3005";
const MCP_TOKEN = process.env["DBMASTER_MCP_TOKEN"] ?? "";
const HTTP_PORT = process.env["MCP_HTTP_PORT"] ? Number(process.env["MCP_HTTP_PORT"]) : undefined;
const ENABLE_ASK = process.env["MCP_ENABLE_ASK"] === "true";

// ── Tool definitions (JSON Schema format for low-level Server API) ────────────

type ToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

const TOOL_DEFS: ToolDef[] = [
  {
    name: SEARCH_ASSETS_NAME,
    description: SEARCH_ASSETS_DESCRIPTION,
    inputSchema: SEARCH_ASSETS_SCHEMA,
  },
  {
    name: GET_ASSET_NAME,
    description: GET_ASSET_DESCRIPTION,
    inputSchema: GET_ASSET_SCHEMA,
  },
  {
    name: GET_JOIN_PATH_NAME,
    description: GET_JOIN_PATH_DESCRIPTION,
    inputSchema: GET_JOIN_PATH_SCHEMA,
  },
  {
    name: LIST_CONCEPTS_NAME,
    description: LIST_CONCEPTS_DESCRIPTION,
    inputSchema: LIST_CONCEPTS_SCHEMA,
  },
];

if (ENABLE_ASK) {
  TOOL_DEFS.push({
    name: ASK_NAME,
    description: ASK_DESCRIPTION,
    inputSchema: ASK_SCHEMA,
  });
}

// ── Build MCP Server ──────────────────────────────────────────────────────────

function buildMcpServer(): Server {
  const client = new DbMasterClient(BASE_URL);

  const server = new Server(
    { name: "db-master", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "查詢公司資料欄位時：先 search_assets 定位資產 → get_asset 確認定義與血緣 → " +
        "跨表時必須以 get_join_path 的 on 條件寫 JOIN。" +
        "工具回傳 deprecated 警示時改用其 replacedBy。找不到路徑時不要猜，回報缺少的關聯。",
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS,
  }));

  // Dispatch tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
      let text: string;

      switch (name) {
        case SEARCH_ASSETS_NAME: {
          text = await handleSearchAssets(client, {
            query: String(safeArgs["query"] ?? ""),
            top_k: safeArgs["top_k"] != null ? Number(safeArgs["top_k"]) : undefined,
            kinds: Array.isArray(safeArgs["kinds"])
              ? (safeArgs["kinds"] as string[])
              : undefined,
          });
          break;
        }
        case GET_ASSET_NAME: {
          text = await handleGetAsset(client, {
            ref: String(safeArgs["ref"] ?? ""),
          });
          break;
        }
        case GET_JOIN_PATH_NAME: {
          text = await handleGetJoinPath(client, {
            from: String(safeArgs["from"] ?? ""),
            to: String(safeArgs["to"] ?? ""),
            max_hops: safeArgs["max_hops"] != null ? Number(safeArgs["max_hops"]) : undefined,
          });
          break;
        }
        case LIST_CONCEPTS_NAME: {
          text = await handleListConcepts(client, {
            domain: safeArgs["domain"] != null ? String(safeArgs["domain"]) : undefined,
            query: safeArgs["query"] != null ? String(safeArgs["query"]) : undefined,
          });
          break;
        }
        case ASK_NAME: {
          if (!ENABLE_ASK) {
            return {
              content: [{ type: "text", text: "ask tool is disabled. Set MCP_ENABLE_ASK=true to enable." }],
              isError: true,
            };
          }
          text = await handleAsk(client, {
            question: String(safeArgs["question"] ?? ""),
          });
          break;
        }
        default: {
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
        }
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── Start: stdio mode ─────────────────────────────────────────────────────────

async function startStdio(): Promise<void> {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio mode — keep process alive
}

// ── Start: HTTP mode ──────────────────────────────────────────────────────────

async function startHttp(port: number): Promise<void> {
  // Per-token rate limiter: 60 req/min
  const limiter = new RateLimiter(60, 60_000);

  // Transport map: sessionId → transport instance (stateful mode)
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Auth check
    if (!MCP_TOKEN || !verifyToken(req, MCP_TOKEN)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // Rate limit by token
    const authHeader = req.headers["authorization"] ?? "";
    const tokenKey = typeof authHeader === "string" ? authHeader : authHeader[0] ?? "";
    if (!limiter.consume(tokenKey)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded. Max 60 requests/minute." }));
      return;
    }

    // Handle MCP protocol
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing session transport
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.handleRequest(req, res);
        return;
      }
    }

    // New session: initialize transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const mcpServer = buildMcpServer();

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);

    // Store session after initialization
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
  });

  httpServer.listen(port, () => {
    process.stderr.write(
      `DB Master MCP Server (HTTP) listening on port ${port}\n` +
      `API: ${BASE_URL}\n` +
      `Tools: search_assets, get_asset, get_join_path, list_concepts${ENABLE_ASK ? ", ask" : ""}\n`,
    );
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (HTTP_PORT) {
  await startHttp(HTTP_PORT);
} else {
  await startStdio();
}
