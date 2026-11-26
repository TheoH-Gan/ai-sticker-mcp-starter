import express from "express";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadCatalog, listPacks, publicSticker, searchCatalog } from "./catalog.js";

const PORT = Number(process.env.PORT ?? 8788);
const CATALOG_PATH = process.env.STICKER_CATALOG ?? "./data/stickers.example.json";
const catalog = await loadCatalog(CATALOG_PATH);
const byId = new Map(catalog.map((item) => [item.id, item]));

const textResult = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: value
});

function buildServer() {
  const server = new McpServer({ name: "ai-sticker-mcp-starter", version: "0.1.0" });

  server.registerTool("list_packs", {
    description: "List sticker packs with total and reviewed counts.",
    inputSchema: {}
  }, async () => textResult({ packs: listPacks(catalog) }));

  server.registerTool("search_stickers", {
    description: "Search enabled stickers by semantic text, tags, pack or tone. Pass recently used IDs in exclude_ids.",
    inputSchema: {
      query: z.string().max(200).optional(),
      tags: z.array(z.string()).max(20).optional(),
      pack: z.string().max(100).optional(),
      tone: z.array(z.string()).max(20).optional(),
      exclude_ids: z.array(z.string()).max(100).optional(),
      limit: z.number().int().min(1).max(20).default(5)
    }
  }, async (args) => textResult({ stickers: searchCatalog(catalog, args) }));

  server.registerTool("get_sticker", {
    description: "Get one enabled sticker by stable ID.",
    inputSchema: { id: z.string().min(1).max(200) }
  }, async ({ id }) => {
    const item = byId.get(id);
    if (!item || item.enabled === false) {
      return { isError: true, content: [{ type: "text", text: `Sticker not found: ${id}` }] };
    }
    return textResult(publicSticker(item));
  });

  server.registerTool("random_sticker", {
    description: "Choose a random enabled sticker after applying the same filters as search.",
    inputSchema: {
      query: z.string().max(200).optional(),
      tags: z.array(z.string()).max(20).optional(),
      pack: z.string().max(100).optional(),
      tone: z.array(z.string()).max(20).optional(),
      exclude_ids: z.array(z.string()).max(100).optional()
    }
  }, async (args) => {
    const candidates = searchCatalog(catalog, { ...args, limit: 20 });
    if (!candidates.length) return textResult({ sticker: null });
    const index = crypto.randomInt(candidates.length);
    return textResult({ sticker: candidates[index] });
  });

  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

const transports = new Map();

app.get("/health", (_req, res) => {
  res.json({ ok: true, stickers: catalog.length, packs: listPacks(catalog).length });
});

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => transports.set(id, transport)
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      await buildServer().connect(transport);
    }

    if (!transport) {
      res.status(400).json({ error: "Missing or invalid MCP session" });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/mcp", async (req, res) => {
  const transport = transports.get(req.headers["mcp-session-id"]);
  if (!transport) return res.status(400).send("Missing or invalid MCP session");
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const transport = transports.get(req.headers["mcp-session-id"]);
  if (!transport) return res.status(400).send("Missing or invalid MCP session");
  await transport.handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`Sticker MCP listening on http://localhost:${PORT}/mcp`);
});
