-- Per-tool MCP entitlements (IA P2): admins can switch off individual tools
-- on a connector. null / [] = everything the server exposes stays available.
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "disabled_tools" jsonb;
