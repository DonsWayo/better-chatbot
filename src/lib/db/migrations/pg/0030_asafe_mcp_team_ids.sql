-- Multi-team support for company MCP servers.
-- A team-scoped MCP server may be shared with one OR multiple teams.
-- The legacy single `team_id` column is kept in sync with team_ids[0].
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "team_ids" uuid[];
