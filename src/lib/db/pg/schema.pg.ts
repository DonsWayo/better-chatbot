import { TipTapMentionJsonContent } from "@/types/util";
import { UIMessage } from "ai";
import { Agent } from "app-types/agent";
import { ChatMetadata } from "app-types/chat";
import { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import { UserPreferences } from "app-types/user";
import { DBEdge, DBNode, DBWorkflow } from "app-types/workflow";
import { relations, sql } from "drizzle-orm";
import { isNotNull } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  json,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const ChatThreadTable = pgTable(
  "chat_thread",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    title: text("title").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // Teamspaces phase 1: optional folder placement + sharing visibility.
    // "team" = read-only visible to members of the containing folder's team.
    folderId: uuid("folder_id").references(() => FolderTable.id, {
      onDelete: "set null",
    }),
    visibility: varchar("visibility", { enum: ["private", "team"] })
      .notNull()
      .default("private"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // Sidebar thread list: WHERE user_id ORDER BY latest message time.
    index("chat_thread_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const ChatMessageTable = pgTable(
  "chat_message",
  {
    id: text("id").primaryKey().notNull(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => ChatThreadTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<UIMessage["role"]>(),
    parts: json("parts").notNull().array().$type<UIMessage["parts"]>(),
    metadata: json("metadata").$type<ChatMetadata>(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // selectMessagesByThreadId: WHERE thread_id ORDER BY created_at.
    index("chat_message_thread_id_created_at_idx").on(
      table.threadId,
      table.createdAt,
    ),
  ],
);

export const AgentTable = pgTable("agent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: json("icon").$type<Agent["icon"]>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  instructions: json("instructions").$type<Agent["instructions"]>(),
  // Unified visibility model (docs/design/visibility-model.md): stores the
  // literal four-level value since migration 0041. Legacy "public"/"readonly"
  // rows remain readable (resolver maps them); 0041 rewrote public → company
  // and private-with-teamIds → team.
  visibility: varchar("visibility", {
    enum: ["private", "shared", "team", "company", "public", "readonly"],
  })
    .notNull()
    .default("private"),
  // Teams this agent is visible to when shared at "team" level. null = none.
  teamIds: jsonb("team_ids").$type<string[] | null>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const BookmarkTable = pgTable(
  "bookmark",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    itemType: varchar("item_type", {
      enum: ["agent", "workflow", "mcp"],
    }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique().on(table.userId, table.itemId, table.itemType),
    index("bookmark_user_id_idx").on(table.userId),
    index("bookmark_item_idx").on(table.itemId, table.itemType),
  ],
);

export const McpServerTable = pgTable("mcp_server", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  config: json("config").notNull().$type<MCPServerConfig>(),
  enabled: boolean("enabled").notNull().default(true),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  visibility: varchar("visibility", {
    enum: ["public", "private"],
  })
    .notNull()
    .default("private"),
  toolInfo: json("tool_info").$type<MCPToolInfo[]>(),
  toolInfoUpdatedAt: timestamp("tool_info_updated_at"),
  lastConnectionStatus: varchar("last_connection_status", {
    enum: ["connected", "error"],
  }),
  scope: varchar("scope", { enum: ["personal", "org", "team"] })
    .notNull()
    .default("personal"),
  // Legacy single-team pointer; kept in sync with teamIds[0] for back-compat.
  teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
    onDelete: "set null",
  }),
  // A team-scoped MCP server may be shared with one OR multiple teams.
  teamIds: uuid("team_ids").array(),
  // Per-tool entitlement gate: tool names admins switched off for this server.
  // null/[] = every tool the server exposes is available.
  disabledTools: jsonb("disabled_tools").$type<string[] | null>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const UserTable = pgTable("user", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  password: text("password"),
  image: text("image"),
  preferences: json("preferences").default({}).$type<UserPreferences>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  role: text("role").notNull().default("user"),
  // W8: GDPR/EU AI Act — acceptable-use acknowledgment
  acceptedAupAt: timestamp("accepted_aup_at", { withTimezone: true }),
});

// Role tables removed - using Better Auth's built-in role system
// Roles are now managed via the 'role' field on UserTable

export const SessionTable = pgTable("session", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  // Admin plugin field (from better-auth generated schema)
  impersonatedBy: text("impersonated_by"),
});

export const AccountTable = pgTable("account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const VerificationTable = pgTable("verification", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

// Tool customization table for per-user additional instructions
export const McpToolCustomizationTable = pgTable(
  "mcp_server_tool_custom_instructions",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique().on(table.userId, table.toolName, table.mcpServerId)],
);

export const McpServerCustomizationTable = pgTable(
  "mcp_server_custom_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.mcpServerId)],
);

export const WorkflowTable = pgTable("workflow", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  name: text("name").notNull(),
  icon: json("icon").$type<DBWorkflow["icon"]>(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  // Unified visibility model (docs/design/visibility-model.md): stores the
  // literal four-level value since migration 0041. Legacy "public"/"readonly"
  // rows remain readable (resolver maps them); 0041 rewrote public → company
  // and private-with-teamIds → team.
  visibility: varchar("visibility", {
    enum: ["private", "shared", "team", "company", "public", "readonly"],
  })
    .notNull()
    .default("private"),
  // Teams this workflow is visible to when shared at "team" level. null = none.
  teamIds: jsonb("team_ids").$type<string[] | null>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const WorkflowNodeDataTable = pgTable(
  "workflow_node",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    version: text("version").notNull().default("0.1.0"),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => WorkflowTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    uiConfig: json("ui_config").$type<DBNode["uiConfig"]>().default({}),
    nodeConfig: json("node_config")
      .$type<Partial<DBNode["nodeConfig"]>>()
      .default({}),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("workflow_node_kind_idx").on(t.kind)],
);

export const WorkflowEdgeTable = pgTable("workflow_edge", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => WorkflowTable.id, { onDelete: "cascade" }),
  source: uuid("source")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  target: uuid("target")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  uiConfig: json("ui_config").$type<DBEdge["uiConfig"]>().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveTable = pgTable("archive", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveItemTable = pgTable(
  "archive_item",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    archiveId: uuid("archive_id")
      .notNull()
      .references(() => ArchiveTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("archive_item_item_id_idx").on(t.itemId)],
);

export const McpOAuthSessionTable = pgTable(
  "mcp_oauth_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    clientInfo: json("client_info"),
    tokens: json("tokens"),
    codeVerifier: text("code_verifier"),
    state: text("state").unique(), // OAuth state parameter for current flow (unique for security)
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("mcp_oauth_session_server_id_idx").on(t.mcpServerId),
    index("mcp_oauth_session_state_idx").on(t.state),
    // Partial index for sessions with tokens for better performance
    index("mcp_oauth_session_tokens_idx")
      .on(t.mcpServerId)
      .where(isNotNull(t.tokens)),
  ],
);

export type McpServerEntity = typeof McpServerTable.$inferSelect;
export type ChatThreadEntity = typeof ChatThreadTable.$inferSelect;
export type ChatMessageEntity = typeof ChatMessageTable.$inferSelect;

export type AgentEntity = typeof AgentTable.$inferSelect;
export type UserEntity = typeof UserTable.$inferSelect;
export type SessionEntity = typeof SessionTable.$inferSelect;

export type ToolCustomizationEntity =
  typeof McpToolCustomizationTable.$inferSelect;
export type McpServerCustomizationEntity =
  typeof McpServerCustomizationTable.$inferSelect;

export const ChatExportTable = pgTable("chat_export", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  exporterId: uuid("exporter_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  originalThreadId: uuid("original_thread_id"),
  messages: json("messages").notNull().$type<
    Array<{
      id: string;
      role: UIMessage["role"];
      parts: UIMessage["parts"];
      metadata?: ChatMetadata;
    }>
  >(),
  exportedAt: timestamp("exported_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  expiresAt: timestamp("expires_at"),
});

export const ChatExportCommentTable = pgTable("chat_export_comment", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  exportId: uuid("export_id")
    .notNull()
    .references(() => ChatExportTable.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references(() => ChatExportCommentTable.id, {
    onDelete: "cascade",
  }),
  content: json("content").notNull().$type<TipTapMentionJsonContent>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type ArchiveEntity = typeof ArchiveTable.$inferSelect;
export type ArchiveItemEntity = typeof ArchiveItemTable.$inferSelect;
export type BookmarkEntity = typeof BookmarkTable.$inferSelect;

// ---------------------------------------------------------------------------
// Wave 3 – Team / Budget / Usage tables (ADR-0002, ADR-0003)
// ---------------------------------------------------------------------------

/**
 * Per-team model entitlement override, layered on the org base allow-list
 * (ERP price-list style; see lib/admin/model-policy.ts):
 * - "inherit": effective = org base + `add` − `remove`
 * - "replace": effective = exactly `models` (org base ignored)
 */
export type TeamModelPolicy = {
  mode: "inherit" | "replace";
  add?: string[];
  remove?: string[];
  models?: string[];
};

export const AsafeTeamTable = pgTable("asafe_team", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  // W9: per-team guardrail posture and multimodal feature gates
  guardrailPolicy: varchar("guardrail_policy", { length: 20 })
    .notNull()
    .default("standard"),
  allowImageGen: boolean("allow_image_gen").notNull().default(false),
  allowVision: boolean("allow_vision").notNull().default(false),
  allowSpeech: boolean("allow_speech").notNull().default(false),
  // Per-tool team policy flags — DEFAULT TRUE so existing teams are unchanged
  // (absence/true = the tool is allowed). Enforced server-side in the chat
  // tool-loading WITHIN the canUseTools (admin/editor) gate.
  allowWebSearch: boolean("allow_web_search").notNull().default(true),
  allowCodeExec: boolean("allow_code_exec").notNull().default(true),
  allowHttp: boolean("allow_http").notNull().default(true),
  // W4: model allow-list — empty array = all approved models allowed
  modelAllowList: jsonb("model_allow_list")
    .$type<string[]>()
    .notNull()
    .default([]),
  // Layered model entitlement override (null = no override → legacy
  // model_allow_list if non-empty, else the org base list applies as-is)
  modelPolicy: jsonb("model_policy").$type<TeamModelPolicy>(),
  // W5+: email domain allow-list — empty array = any email domain allowed
  allowedEmailDomains: jsonb("allowed_email_domains")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const AsafeTeamMemberTable = pgTable(
  "asafe_team_member",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => AsafeTeamTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("member"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique().on(table.teamId, table.userId)],
);

// ── Teamspaces (phase 1) ─────────────────────────────────────────────────────
// Notion-style folders. teamId null = personal folder; teamId set = a team
// folder whose threads with visibility "team" are readable (read-only) by
// every member of that team.
export const FolderTable = pgTable(
  "folder",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => FolderTable.id, {
      onDelete: "cascade",
    }),
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "set null",
    }),
    ownerId: uuid("owner_id").notNull(),
    visibility: varchar("visibility", { enum: ["private", "team"] })
      .notNull()
      .default("private"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("folder_owner_id_idx").on(table.ownerId),
    index("folder_team_id_idx").on(table.teamId),
    index("folder_parent_id_idx").on(table.parentId),
  ],
);

export type FolderEntity = typeof FolderTable.$inferSelect;

// Electric realtime phase 3 — presence heartbeats. Writes go through a Server
// Action (Postgres only); reads stream via the authenticated shape proxy.
export const AsafePresenceTable = pgTable(
  "asafe_presence",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    contextType: varchar("context_type", {
      // "document" = a public chat-export page (/export/[id]). Unlike
      // thread/folder (which stream over the authenticated Electric shape
      // proxy), document presence is POLLED — the export page is public and the
      // proxy can't serve anonymous viewers. context_id is a chat-export id
      // (nanoid, not a uuid), which the `text` column already accepts.
      // See content/docs/collaboration/realtime.mdx#document-presence.
      enum: ["thread", "folder", "document"],
    }).notNull(),
    contextId: text("context_id").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull().default(sql`now()`),
    // Electric phase 4: true while the user is actively composing in the
    // context; cleared by the next non-typing heartbeat.
    typing: boolean("typing").notNull().default(false),
  },
  (table) => [
    unique("asafe_presence_user_context_unique").on(
      table.userId,
      table.contextType,
      table.contextId,
    ),
    index("asafe_presence_context_idx").on(
      table.contextType,
      table.contextId,
      table.lastSeenAt,
    ),
  ],
);

export type AsafePresenceEntity = typeof AsafePresenceTable.$inferSelect;

// Same pgvector customType as the Wave 6 RAG helper below (that one is
// declared later in the file, so a local copy avoids a TDZ error here).
const memoryVector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value) {
      return JSON.stringify(value);
    },
    fromDriver(value) {
      if (typeof value === "string") return JSON.parse(value);
      return value as number[];
    },
  })(name);

// User memory (docs/design/user-memory.md): typed per-user facts retained
// across conversations. sourceThreadId is provenance only — NO FK, because
// deleting a chat must not delete derived memories (erasure targets this
// table directly; GDPR right-to-erasure design).
export const UserMemoryTable = pgTable(
  "user_memory",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    scopeId: text("scope_id"),
    kind: varchar("kind", {
      enum: ["preference", "decision", "profile", "project_context"],
    }).notNull(),
    content: text("content").notNull(),
    embedding: memoryVector("embedding", 1536),
    sourceThreadId: uuid("source_thread_id"),
    confidence: real("confidence").notNull().default(0.5),
    supersededBy: uuid("superseded_by").references(
      (): AnyPgColumn => UserMemoryTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  },
  (table) => [index("user_memory_user_idx").on(table.userId, table.scopeId)],
);

export type UserMemoryEntity = typeof UserMemoryTable.$inferSelect;

export const AsafeUsageEventTable = pgTable(
  "asafe_usage_event",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id"),
    model: varchar("model", { length: 120 }).notNull(),
    provider: varchar("provider", { length: 60 }).notNull(),
    taskClass: varchar("task_class", { length: 30 }),
    tier: varchar("tier", { length: 20 }),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("asafe_usage_event_user_id_idx").on(table.userId),
    index("asafe_usage_event_team_id_idx").on(table.teamId),
    index("asafe_usage_event_created_at_idx").on(table.createdAt),
  ],
);

export const AsafeTeamBudgetTable = pgTable("asafe_team_budget", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .unique()
    .references(() => AsafeTeamTable.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  budgetUsd: numeric("budget_usd", { precision: 12, scale: 2 }).notNull(),
  usedUsd: numeric("used_usd", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Relations

export const AsafeTeamRelations = relations(
  AsafeTeamTable,
  ({ many, one }) => ({
    members: many(AsafeTeamMemberTable),
    usageEvents: many(AsafeUsageEventTable),
    budget: one(AsafeTeamBudgetTable, {
      fields: [AsafeTeamTable.id],
      references: [AsafeTeamBudgetTable.teamId],
    }),
  }),
);

export const AsafeTeamMemberRelations = relations(
  AsafeTeamMemberTable,
  ({ one }) => ({
    team: one(AsafeTeamTable, {
      fields: [AsafeTeamMemberTable.teamId],
      references: [AsafeTeamTable.id],
    }),
    user: one(UserTable, {
      fields: [AsafeTeamMemberTable.userId],
      references: [UserTable.id],
    }),
  }),
);

export const AsafeUsageEventRelations = relations(
  AsafeUsageEventTable,
  ({ one }) => ({
    user: one(UserTable, {
      fields: [AsafeUsageEventTable.userId],
      references: [UserTable.id],
    }),
    team: one(AsafeTeamTable, {
      fields: [AsafeUsageEventTable.teamId],
      references: [AsafeTeamTable.id],
    }),
  }),
);

export const AsafeTeamBudgetRelations = relations(
  AsafeTeamBudgetTable,
  ({ one }) => ({
    team: one(AsafeTeamTable, {
      fields: [AsafeTeamBudgetTable.teamId],
      references: [AsafeTeamTable.id],
    }),
  }),
);

export type AsafeTeamEntity = typeof AsafeTeamTable.$inferSelect;
export type AsafeTeamMemberEntity = typeof AsafeTeamMemberTable.$inferSelect;
export type AsafeUsageEventEntity = typeof AsafeUsageEventTable.$inferSelect;
export type AsafeTeamBudgetEntity = typeof AsafeTeamBudgetTable.$inferSelect;

// ---------------------------------------------------------------------------
// Wave 5 – Company MCP audit log
// Wave 6 – RAG knowledge collections + embeddings (ADR-0007)
// ---------------------------------------------------------------------------

const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value) {
      return JSON.stringify(value);
    },
    fromDriver(value) {
      if (typeof value === "string") return JSON.parse(value);
      return value as number[];
    },
  })(name);

export const AsafeMcpInvocationLogTable = pgTable("asafe_mcp_invocation_log", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
    onDelete: "set null",
  }),
  mcpServerId: uuid("mcp_server_id").references(() => McpServerTable.id, {
    onDelete: "set null",
  }),
  toolName: varchar("tool_name", { length: 200 }).notNull(),
  outcome: varchar("outcome", { enum: ["success", "error"] }).notNull(),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const AsafeKnowledgeCollectionTable = pgTable(
  "asafe_knowledge_collection",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    // Legacy single-team pointer; kept in sync with teamIds[0] for back-compat.
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "cascade",
    }),
    teamIds: jsonb("team_ids").$type<string[] | null>(),
    // Unified visibility model (docs/design/visibility-model.md). Legacy rows
    // hold "org" (= company) and "team"; the resolver maps both.
    visibility: varchar("visibility", {
      enum: ["private", "shared", "team", "company", "org"],
    })
      .notNull()
      .default("org"),
    createdBy: uuid("created_by").references(() => UserTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export const EMBEDDING_DIMENSION = 1536; // text-embedding-3-small; pinned — see ADR-0007

export const AsafeDocumentChunkTable = pgTable("asafe_document_chunk", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  collectionId: uuid("collection_id")
    .notNull()
    .references(() => AsafeKnowledgeCollectionTable.id, {
      onDelete: "cascade",
    }),
  sourceRef: text("source_ref").notNull(), // filename, URL, archive item ID, etc.
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: vector("embedding", EMBEDDING_DIMENSION).notNull(),
  metadata: json("metadata").default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const asafeMcpInvocationLogRelations = relations(
  AsafeMcpInvocationLogTable,
  ({ one }) => ({
    user: one(UserTable, {
      fields: [AsafeMcpInvocationLogTable.userId],
      references: [UserTable.id],
    }),
    team: one(AsafeTeamTable, {
      fields: [AsafeMcpInvocationLogTable.teamId],
      references: [AsafeTeamTable.id],
    }),
    mcpServer: one(McpServerTable, {
      fields: [AsafeMcpInvocationLogTable.mcpServerId],
      references: [McpServerTable.id],
    }),
  }),
);

export const asafeKnowledgeCollectionRelations = relations(
  AsafeKnowledgeCollectionTable,
  ({ one, many }) => ({
    team: one(AsafeTeamTable, {
      fields: [AsafeKnowledgeCollectionTable.teamId],
      references: [AsafeTeamTable.id],
    }),
    chunks: many(AsafeDocumentChunkTable),
  }),
);

export const asafeDocumentChunkRelations = relations(
  AsafeDocumentChunkTable,
  ({ one }) => ({
    collection: one(AsafeKnowledgeCollectionTable, {
      fields: [AsafeDocumentChunkTable.collectionId],
      references: [AsafeKnowledgeCollectionTable.id],
    }),
  }),
);

export type AsafeMcpInvocationLogEntity =
  typeof AsafeMcpInvocationLogTable.$inferSelect;
export type AsafeKnowledgeCollectionEntity =
  typeof AsafeKnowledgeCollectionTable.$inferSelect;
export type AsafeDocumentChunkEntity =
  typeof AsafeDocumentChunkTable.$inferSelect;

// ---------------------------------------------------------------------------
// Wave 9 – Response feedback (ADR-0009 quality loop)
// ---------------------------------------------------------------------------

export const AsafeMessageFeedbackTable = pgTable(
  "asafe_message_feedback",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    messageId: text("message_id").notNull(), // ChatMessage id (text, not uuid)
    threadId: text("thread_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    rating: varchar("rating", { enum: ["up", "down"] }).notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("uniq_feedback_user_msg").on(t.userId, t.messageId)],
);

export const asafeMessageFeedbackRelations = relations(
  AsafeMessageFeedbackTable,
  ({ one }) => ({
    user: one(UserTable, {
      fields: [AsafeMessageFeedbackTable.userId],
      references: [UserTable.id],
    }),
  }),
);

export type AsafeMessageFeedbackEntity =
  typeof AsafeMessageFeedbackTable.$inferSelect;

// ---------------------------------------------------------------------------
// Wave 9 – Shared prompt library (ADR-0009)
// ---------------------------------------------------------------------------

export const AsafePromptTemplateTable = pgTable("asafe_prompt_template", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }),
  authorId: uuid("author_id").references(() => UserTable.id, {
    onDelete: "set null",
  }),
  teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
    onDelete: "cascade",
  }),
  visibility: varchar("visibility", { enum: ["private", "team", "org"] })
    .notNull()
    .default("private"),
  isFeatured: boolean("is_featured").notNull().default(false),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const asafePromptTemplateRelations = relations(
  AsafePromptTemplateTable,
  ({ one }) => ({
    author: one(UserTable, {
      fields: [AsafePromptTemplateTable.authorId],
      references: [UserTable.id],
    }),
    team: one(AsafeTeamTable, {
      fields: [AsafePromptTemplateTable.teamId],
      references: [AsafeTeamTable.id],
    }),
  }),
);

export type AsafePromptTemplateEntity =
  typeof AsafePromptTemplateTable.$inferSelect;

// ---------------------------------------------------------------------------
// Wave 1 – Postgres-backed KV cache (replaces Redis)
// ---------------------------------------------------------------------------

export const AsafeKvCacheTable = pgTable("asafe_kv_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const AsafeRateLimitBucketTable = pgTable(
  "asafe_rate_limit_bucket",
  {
    userId: text("user_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.userId, t.windowStart] })],
);

// ── W8 Compliance Audit Log ──────────────────────────────────────────────────

export const AsafeAuditLogTable = pgTable("asafe_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Who
  userId: text("user_id").notNull(),
  teamId: uuid("team_id"),
  // Whether a human or an agent session performed the action (B90 #23)
  actorType: varchar("actor_type", { enum: ["human", "agent"] })
    .notNull()
    .default("human"),
  agentSessionId: uuid("agent_session_id"),
  // What type of event
  eventType: text("event_type").notNull(), // "chat_request"|"admin_action"|"rag_retrieval"|"tool_call"|"guardrail"|"user_erasure"
  // Serialised details — kept minimal (no raw prompt content; content hash only)
  details: jsonb("details").notNull().default("{}"),
  // Immutable timestamp — use now() at DB level so app clock skew can't falsify it
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AsafeAuditLogEntity = typeof AsafeAuditLogTable.$inferSelect;

// ── W7 Guardrail Events ──────────────────────────────────────────────────────

export const AsafeGuardrailEventTable = pgTable("asafe_guardrail_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  blocked: boolean("blocked").notNull().default(false),
  firings: jsonb("firings").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AsafeGuardrailEventEntity =
  typeof AsafeGuardrailEventTable.$inferSelect;

// ── W5 Per-user model grants ─────────────────────────────────────────────────
// Admins can grant a specific user access to a model that their team's
// allow-list would otherwise block. expiresAt=null means permanent.

export const AsafeUserModelGrantTable = pgTable(
  "asafe_user_model_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    modelId: text("model_id").notNull(),
    grantedBy: text("granted_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_user_model_grant_user_id").on(t.userId),
    unique("uq_user_model_grant").on(t.userId, t.modelId),
  ],
);

export type AsafeUserModelGrantEntity =
  typeof AsafeUserModelGrantTable.$inferSelect;

// ── W12 Feature Flags (kill switch + future toggles) ─────────────────────────

export const AsafeFeatureFlagTable = pgTable("asafe_feature_flag", {
  name: text("name").primaryKey(), // e.g. "kill_switch", "compression_enabled"
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AsafeFeatureFlagEntity = typeof AsafeFeatureFlagTable.$inferSelect;

// ── Org-wide settings (key-value, jsonb) ─────────────────────────────────────
// Generic global settings store. First key: "org_base_model_allow_list" — the
// org-wide BASE model allow-list (null/absent = no restriction). See
// lib/admin/model-policy.ts for the resolution semantics.

export const AsafeOrgSettingsTable = pgTable("asafe_org_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AsafeOrgSettingEntity = typeof AsafeOrgSettingsTable.$inferSelect;

// ── W8 AUP Acceptance (GDPR/EU AI Act: informed consent record) ──────────────

export const AsafeAupAcceptanceTable = pgTable(
  "asafe_aup_acceptance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    aupVersion: text("aup_version").notNull().default("1.0"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_aup_user_version").on(t.userId, t.aupVersion),
    index("idx_aup_user_id").on(t.userId),
  ],
);

export type AsafeAupAcceptanceEntity =
  typeof AsafeAupAcceptanceTable.$inferSelect;

// ── Storage object ownership ─────────────────────────────────────────────────
// Per-key owner binding for uploaded files. Without this, any authenticated
// user could read any uploaded file by guessing the key UUID (storage keys
// carry no per-user binding). Written at upload time; enforced at ingest time.
// userId is TEXT (the modern asafe convention) and intentionally has NO FK to
// user.id — that column is uuid, so any join must cast (asafe_text vs core_uuid
// audit-log lesson). Access is owner-only today; extensible to grants/team.

export const AsafeStorageObjectTable = pgTable(
  "asafe_storage_object",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull().unique(),
    uploaderUserId: text("uploader_user_id").notNull(),
    teamId: uuid("team_id"),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // storage_key already has a unique index (covers lookups by key).
    index("idx_storage_object_uploader_user_id").on(t.uploaderUserId),
  ],
);

export type AsafeStorageObjectEntity =
  typeof AsafeStorageObjectTable.$inferSelect;

// ── Agent Platform #21: sessions + steps (docs/design/agent-platform.md) ─────
// One governed execution of an agent/workflow revision. `definitionId` is
// intentionally FK-less: it is polymorphic across the agent and workflow
// tables. `revisionId` / `folderId` gain FKs once those tables land (#19/#17).

export const AgentSessionTable = pgTable(
  "agent_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    kind: varchar("kind", {
      enum: ["workflow", "conversational", "opencode"],
    }).notNull(),
    // Polymorphic pointer into agent/workflow tables — no FK on purpose.
    definitionId: uuid("definition_id").notNull(),
    // Pinned immutable revision; nullable until the revisions table exists.
    revisionId: uuid("revision_id"),
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // Folders/teamspaces table comes later (#17) — no FK yet.
    folderId: uuid("folder_id"),
    originSurface: varchar("origin_surface", {
      enum: ["web", "desktop", "schedule", "webhook", "api"],
    })
      .notNull()
      .default("web"),
    mode: varchar("mode", {
      enum: ["interactive", "plan", "autopilot"],
    })
      .notNull()
      .default("interactive"),
    status: varchar("status", {
      enum: [
        "queued",
        "running",
        "awaiting_approval",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("queued"),
    costSoFar: real("cost_so_far").notNull().default(0),
    inputPayload: jsonb("input_payload").$type<unknown>(),
    error: text("error"),
    // Sub-agent tree (cost rolls up; Runs drawer shows the tree).
    parentSessionId: uuid("parent_session_id").references(
      (): AnyPgColumn => AgentSessionTable.id,
      { onDelete: "set null" },
    ),
    // Worker-liveness heartbeat for detached runs (SKIP LOCKED reclaim).
    heartbeatAt: timestamp("heartbeat_at"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("agent_session_user_id_idx").on(t.userId),
    index("agent_session_team_id_idx").on(t.teamId),
    index("agent_session_status_idx").on(t.status),
    index("agent_session_parent_session_id_idx").on(t.parentSessionId),
  ],
);

// Per-node / per-turn checkpoint within a session. Upserted on
// (sessionId, stepIndex): NODE_START inserts `running`, NODE_END flips it to
// completed/failed with output — that unique pair is the resume key.

export const AgentStepTable = pgTable(
  "agent_step",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => AgentSessionTable.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeKind: text("node_kind"),
    stepIndex: integer("step_index").notNull(),
    status: varchar("status", {
      enum: ["running", "completed", "failed", "skipped"],
    })
      .notNull()
      .default("running"),
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    costUsd: real("cost_usd").notNull().default(0),
    startedAt: timestamp("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    endedAt: timestamp("ended_at"),
  },
  (t) => [
    index("agent_step_session_id_idx").on(t.sessionId),
    unique("agent_step_session_id_step_index_unique").on(
      t.sessionId,
      t.stepIndex,
    ),
  ],
);

export type AgentSessionEntity = typeof AgentSessionTable.$inferSelect;
export type AgentStepEntity = typeof AgentStepTable.$inferSelect;

export const ApprovalRequestTable = pgTable(
  "approval_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => AgentSessionTable.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    // What the approver sees: numbered plan, diff, payload summary
    payload: jsonb("payload"),
    // Role required to decide: "owner" | "team-admin" | "admin"
    requestedRole: varchar("requested_role", {
      enum: ["owner", "team-admin", "admin"],
    })
      .notNull()
      .default("team-admin"),
    status: varchar("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    decidedBy: uuid("decided_by"),
    reason: text("reason"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    decidedAt: timestamp("decided_at"),
  },
  (table) => [
    index("approval_request_session_id_idx").on(table.sessionId),
    index("approval_request_status_idx").on(table.status),
  ],
);

export type ApprovalRequestEntity = typeof ApprovalRequestTable.$inferSelect;

export const WorkflowScheduleTable = pgTable(
  "workflow_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull(),
    // "latest" tracks the latest published revision; "pinned" stays on pinnedRevisionId
    revisionPin: varchar("revision_pin", { enum: ["latest", "pinned"] })
      .notNull()
      .default("latest"),
    pinnedRevisionId: uuid("pinned_revision_id"),
    cronExpr: text("cron_expr").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: boolean("enabled").notNull().default(true),
    inputTemplate: jsonb("input_template"),
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").notNull(),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("workflow_schedule_due_idx").on(table.enabled, table.nextRunAt),
    index("workflow_schedule_team_id_idx").on(table.teamId),
  ],
);

export type WorkflowScheduleEntity = typeof WorkflowScheduleTable.$inferSelect;

// ── Agent Platform #19: immutable revisions + publish lifecycle ──────────────
// One row per published-or-drafted version of an agent ("conversational") or
// workflow. `sourceId` is a polymorphic, FK-less pointer into the agent /
// workflow tables (same convention as agent_session.definitionId).
// `configSnapshot` freezes the full definition at submission time: the agent
// row, or `{ workflow, nodes, edges }` for workflows. Lifecycle:
// draft → pending_review → published → archived; at most ONE published
// revision per (kind, sourceId). Multi-team visibility mirrors the MCP
// catalog `teamIds` jsonb pattern (null = personal); orgWide is admin-only.

export const AgentRevisionTable = pgTable(
  "agent_revision",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    kind: varchar("kind", {
      enum: ["conversational", "workflow"],
    }).notNull(),
    // Polymorphic pointer to agent.id or workflow.id — no FK on purpose.
    sourceId: uuid("source_id").notNull(),
    version: integer("version").notNull(),
    // Full agent config OR full { workflow, nodes, edges } structure.
    configSnapshot: jsonb("config_snapshot").$type<unknown>().notNull(),
    status: varchar("status", {
      enum: ["draft", "pending_review", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    authorId: uuid("author_id").notNull(),
    approvedBy: uuid("approved_by"),
    changelog: text("changelog"),
    // Multi-team visibility (MCP catalog pattern); null = personal.
    teamIds: jsonb("team_ids").$type<string[] | null>(),
    orgWide: boolean("org_wide").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("agent_revision_kind_source_id_version_unique").on(
      t.kind,
      t.sourceId,
      t.version,
    ),
    index("agent_revision_source_id_idx").on(t.sourceId),
    index("agent_revision_status_idx").on(t.status),
    index("agent_revision_kind_status_idx").on(t.kind, t.status),
  ],
);

export type AgentRevisionEntity = typeof AgentRevisionTable.$inferSelect;

// ── Unified visibility model: per-user grants for "shared" entities ──────────
// docs/design/visibility-model.md. One generic grant table for EVERY shareable
// entity type. `entityId` is a polymorphic, FK-less pointer (same convention
// as agent_revision.sourceId). A grant gives `granteeUserId` the named
// capability on the entity; capabilities form a hierarchy
// (manage > edit > use > view) resolved in src/lib/visibility.

export const EntityGrantTable = pgTable(
  "entity_grant",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    entityType: varchar("entity_type", {
      enum: [
        "workflow",
        "agent",
        "thread",
        "folder",
        "knowledge_collection",
        "mcp_server",
        "document",
      ],
    }).notNull(),
    // Polymorphic pointer into the entity's table — no FK on purpose.
    entityId: uuid("entity_id").notNull(),
    granteeUserId: uuid("grantee_user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    capability: varchar("capability", {
      enum: ["view", "use", "edit", "manage"],
    })
      .notNull()
      .default("use"),
    grantedBy: uuid("granted_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("entity_grant_entity_grantee_capability_unique").on(
      t.entityType,
      t.entityId,
      t.granteeUserId,
      t.capability,
    ),
    index("entity_grant_entity_idx").on(t.entityType, t.entityId),
    index("entity_grant_grantee_idx").on(t.granteeUserId),
  ],
);

export type EntityGrantEntity = typeof EntityGrantTable.$inferSelect;

// ── Public programmatic API keys (migration 0046) ────────────────────────────
// API keys authenticate the public /api/v1 surface so external systems
// (CI/CD, ERP triggers, partners) can run agents/workflows without a cookie
// session. Only the sha256 hash of the secret is stored — the plaintext
// `ck_live_<random>` is shown ONCE at creation and never persisted. A key acts
// as its creating user's identity for entitlement/budget/ownership; teamId
// pins the scope the key runs as.
export const AsafeApiKeyTable = pgTable(
  "asafe_api_key",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    // sha256 hex of the plaintext secret — the only stored form of the key.
    keyHash: text("key_hash").notNull().unique(),
    // First ~10 chars of the plaintext (e.g. "ck_live_AbC") for display only.
    keyPrefix: text("key_prefix").notNull(),
    name: text("name").notNull(),
    // The user the key acts as (no FK — accountable admin identity, text id).
    createdBy: text("created_by").notNull(),
    // The team scope the key runs as (null = the creator's primary team).
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "set null",
    }),
    // Capability scopes, e.g. ["agents:read","sessions:write"]. Default full.
    scopes: jsonb("scopes")
      .$type<string[]>()
      .notNull()
      .default(sql`'["*"]'::jsonb`),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("asafe_api_key_key_hash_idx").on(t.keyHash),
    index("asafe_api_key_team_id_idx").on(t.teamId),
    index("asafe_api_key_created_by_idx").on(t.createdBy),
  ],
);

export type AsafeApiKeyEntity = typeof AsafeApiKeyTable.$inferSelect;

// ---------------------------------------------------------------------------
// Collaborative documents (migration 0047) — Confluence/Notion-style rich-text
// docs. Governed by the unified visibility model (docs/design/visibility-model.md)
// exactly like agents/workflows: owner + admins always manage; "company"/"team"/
// "shared" widen read/edit. Realtime is near-live over Electric (last-write-wins,
// single-author soft lock): the Electric shape exposes only a CHANGE SIGNAL
// (id, updated_at, last_edited_by, last_edited_at) — never the heavy `content`
// jsonb — so viewers learn a doc changed and refetch the body via an action.
// ---------------------------------------------------------------------------

/** Empty ProseMirror/TipTap document — the default body for a fresh doc. */
const EMPTY_DOC = { type: "doc", content: [] } as const;

export const AsafeDocumentTable = pgTable(
  "asafe_document",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    title: text("title").notNull().default("Untitled"),
    // TipTap/ProseMirror document JSON.
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(EMPTY_DOC),
    // Owner. FK to user like every other core table (uuid).
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    // Team this doc is scoped to when shared at "team" level. null = none.
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "set null",
    }),
    // Unified four-level visibility (matches agent/workflow literal set).
    visibility: varchar("visibility", {
      enum: ["private", "shared", "team", "company"],
    })
      .notNull()
      .default("private"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    // Last collaborator who wrote (drives the Electric change signal).
    lastEditedBy: uuid("last_edited_by").references(() => UserTable.id, {
      onDelete: "set null",
    }),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("asafe_document_user_id_idx").on(t.userId),
    index("asafe_document_team_id_idx").on(t.teamId),
    index("asafe_document_updated_at_idx").on(t.updatedAt),
  ],
);

/** Append-only version history snapshots for a document. */
export const AsafeDocumentRevisionTable = pgTable(
  "asafe_document_revision",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => AsafeDocumentTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(EMPTY_DOC),
    editedBy: uuid("edited_by").references(() => UserTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("asafe_document_revision_document_idx").on(
      t.documentId,
      t.createdAt.desc(),
    ),
  ],
);

export const asafeDocumentRelations = relations(
  AsafeDocumentTable,
  ({ one, many }) => ({
    owner: one(UserTable, {
      fields: [AsafeDocumentTable.userId],
      references: [UserTable.id],
    }),
    team: one(AsafeTeamTable, {
      fields: [AsafeDocumentTable.teamId],
      references: [AsafeTeamTable.id],
    }),
    revisions: many(AsafeDocumentRevisionTable),
  }),
);

export const asafeDocumentRevisionRelations = relations(
  AsafeDocumentRevisionTable,
  ({ one }) => ({
    document: one(AsafeDocumentTable, {
      fields: [AsafeDocumentRevisionTable.documentId],
      references: [AsafeDocumentTable.id],
    }),
  }),
);

export type AsafeDocumentEntity = typeof AsafeDocumentTable.$inferSelect;
export type AsafeDocumentRevisionEntity =
  typeof AsafeDocumentRevisionTable.$inferSelect;

/**
 * Threaded comments on a collaborative document. One level of replies (a
 * comment may reference a top-level parent via parentId). Content is TipTap /
 * ProseMirror JSON (same shape as chat-export comments). FK cascades when the
 * document is deleted so comments never outlive their doc. Realtime is POLLING
 * (the comments panel re-fetches every few seconds while open) — never an
 * Electric shape — so a closed panel holds no connection.
 */
export const AsafeDocumentCommentTable = pgTable(
  "asafe_document_comment",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => AsafeDocumentTable.id, { onDelete: "cascade" }),
    // Top-level comments have a null parentId; a reply points at its parent.
    parentId: uuid("parent_id"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(EMPTY_DOC),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("asafe_document_comment_document_idx").on(t.documentId, t.createdAt),
    index("asafe_document_comment_parent_idx").on(t.parentId),
  ],
);

export const asafeDocumentCommentRelations = relations(
  AsafeDocumentCommentTable,
  ({ one }) => ({
    document: one(AsafeDocumentTable, {
      fields: [AsafeDocumentCommentTable.documentId],
      references: [AsafeDocumentTable.id],
    }),
    author: one(UserTable, {
      fields: [AsafeDocumentCommentTable.authorId],
      references: [UserTable.id],
    }),
  }),
);

export type AsafeDocumentCommentEntity =
  typeof AsafeDocumentCommentTable.$inferSelect;

/** @mention notifications fired when a user is tagged in a document comment. */
export const AsafeMentionNotificationTable = pgTable(
  "asafe_mention_notification",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => AsafeDocumentTable.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => AsafeDocumentCommentTable.id, { onDelete: "cascade" }),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("asafe_mention_notification_recipient_idx").on(
      t.recipientId,
      t.isRead,
      t.createdAt,
    ),
  ],
);

export type AsafeMentionNotificationEntity =
  typeof AsafeMentionNotificationTable.$inferSelect;
