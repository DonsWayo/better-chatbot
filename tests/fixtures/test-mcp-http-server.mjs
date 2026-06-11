// Remote (streamable HTTP) twin of test-mcp-server.js for e2e runs.
// Production builds enforce the cloud remote-only MCP posture, so specs that
// create MCP servers point at this fixture instead of a stdio command.
// Started by playwright.config.ts as a second webServer on E2E_MCP_PORT.
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.E2E_MCP_PORT || 3007);

function buildMcpServer() {
  const server = new McpServer({
    name: "custom-mcp-server",
    version: "0.0.1",
  });
  server.tool(
    "get_weather",
    "Get the current weather at a location.",
    { latitude: z.number(), longitude: z.number() },
    async ({ latitude, longitude }) => ({
      content: [
        {
          type: "text",
          text: `The current temperature in ${latitude}, ${longitude} is 20°C.`,
        },
      ],
    }),
  );
  return server;
}

const httpServer = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  try {
    // Stateless mode: a fresh transport per request, no session management —
    // exactly what the app's remote client needs for connect + tool listing.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => transport.close());
    await buildMcpServer().connect(transport);

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw.length > 0 ? JSON.parse(raw) : undefined;
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("test-mcp-http-server error:", err);
    if (!res.headersSent) res.writeHead(500).end("internal error");
  }
});

httpServer.listen(PORT, () => {
  console.log(`test-mcp-http-server listening on http://localhost:${PORT}`);
});
