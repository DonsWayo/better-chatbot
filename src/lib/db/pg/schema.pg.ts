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

export const ChatThreadTable = pgTable("chat_thread", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ChatMessageTable = pgTable("chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => ChatThreadTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<UIMessage["role"]>(),
  parts: json("parts").notNull().array().$type<UIMessage["parts"]>(),
  metadata: json("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const AgentTable = pgTable("agent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: json("icon").$type<Agent["icon"]>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  instructions: json("instructions").$type<Agent["instructions"]>(),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
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
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
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
    teamId: uuid("team_id").references(() => AsafeTeamTable.id, {
      onDelete: "cascade",
    }),
    visibility: varchar("visibility", { enum: ["team", "org"] })
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
