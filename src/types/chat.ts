import type { LanguageModelUsage, UIMessage } from "ai";
import { tag } from "lib/tag";
import { z } from "zod";
import { AllowedMCPServerZodSchema } from "./mcp";
import { UserPreferences } from "./user";

/**
 * asafe-ai (ADR-0007, phase 2): one deduped knowledge source used to ground a
 * message. `index` matches the [Source N] numbering in the prompt block, so
 * citations in the model output line up with the rendered source list.
 */
export type RagSource = {
  /** 1-based; matches [Source N] in the prompt and the model's citations. */
  index: number;
  /** Filename, URL, or archive item the chunks came from. */
  sourceRef: string;
  collectionId: string;
  collectionName: string;
  /** Normalized retrieval score in (0, 1]. */
  score: number;
};

export type ChatMetadata = {
  usage?: LanguageModelUsage;
  chatModel?: ChatModel;
  toolChoice?: "auto" | "none" | "manual";
  toolCount?: number;
  agentId?: string;
  /** asafe-ai (ADR-0004): why the router chose this model, when Auto routing was used. */
  routingReason?: string;
  /** asafe-ai (ADR-0007): knowledge collection ID used for RAG retrieval in this message. */
  ragCollectionId?: string;
  /** asafe-ai (ADR-0007, phase 2): deduped sources behind this message's [Source N] citations. */
  ragSources?: RagSource[];
  /**
   * Near-live shared generation (v1): true while this assistant message is a
   * throttled partial persist of an in-progress stream on a team-shared
   * thread. The final onFinish persist overwrites metadata and clears it.
   */
  streaming?: boolean;
  /**
   * Epoch ms of the last partial persist. Readers only render "generating…"
   * while this is fresh, so a flag orphaned by a crashed stream ages out.
   */
  streamingAt?: number;
};

export type ChatModel = {
  provider: string;
  model: string;
};

export const ChatAttachmentSchema = z.object({
  type: z.enum(["file", "source-url"]),
  url: z.string(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
});

export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

export type ChatThread = {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  role: UIMessage["role"];
  parts: UIMessage["parts"];
  metadata?: ChatMetadata;
  createdAt: Date;
};

export const ChatMentionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mcpTool"),
    name: z.string(),
    description: z.string().optional(),
    serverName: z.string().optional(),
    serverId: z.string(),
  }),
  z.object({
    type: z.literal("defaultTool"),
    name: z.string(),
    label: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("mcpServer"),
    name: z.string(),
    description: z.string().optional(),
    toolCount: z.number().optional(),
    serverId: z.string(),
  }),
  z.object({
    type: z.literal("workflow"),
    name: z.string(),
    description: z.string().nullish(),
    workflowId: z.string(),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string(),
        style: z.record(z.string(), z.string()).optional(),
      })
      .nullish(),
  }),
  z.object({
    type: z.literal("agent"),
    name: z.string(),
    description: z.string().nullish(),
    agentId: z.string(),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string(),
        style: z.record(z.string(), z.string()).optional(),
      })
      .nullish(),
  }),
  z.object({
    type: z.literal("knowledge"),
    name: z.string(),
    description: z.string().nullish(),
    collectionId: z.string(),
  }),
]);

export type ChatMention = z.infer<typeof ChatMentionSchema>;

export const chatApiSchemaRequestBodySchema = z.object({
  id: z.string(),
  message: z.any() as z.ZodType<UIMessage>,
  chatModel: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
  toolChoice: z.enum(["auto", "none", "manual"]),
  mentions: z.array(ChatMentionSchema).optional(),
  imageTool: z.object({ model: z.string().optional() }).optional(),
  allowedMcpServers: z.record(z.string(), AllowedMCPServerZodSchema).optional(),
  allowedAppDefaultToolkit: z.array(z.string()).optional(),
  attachments: z.array(ChatAttachmentSchema).optional(),
  ragCollectionId: z.string().optional(),
});

export type ChatApiSchemaRequestBody = z.infer<
  typeof chatApiSchemaRequestBodySchema
>;

export type ChatRepository = {
  insertThread(thread: Omit<ChatThread, "createdAt">): Promise<ChatThread>;

  selectThread(id: string): Promise<ChatThread | null>;

  deleteChatMessage(id: string): Promise<void>;

  selectThreadDetails(id: string): Promise<
    | (ChatThread & {
        messages: ChatMessage[];
        userPreferences?: UserPreferences;
      })
    | null
  >;

  selectMessagesByThreadId(threadId: string): Promise<ChatMessage[]>;

  selectMessageById(messageId: string): Promise<ChatMessage | null>;

  selectThreadsByUserId(userId: string): Promise<
    (ChatThread & {
      lastMessageAt: number;
    })[]
  >;

  updateThread(
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ): Promise<ChatThread>;

  deleteThread(id: string): Promise<void>;

  upsertThread(
    thread: PartialBy<Omit<ChatThread, "createdAt">, "userId">,
  ): Promise<ChatThread>;

  insertMessage(message: Omit<ChatMessage, "createdAt">): Promise<ChatMessage>;
  upsertMessage(message: Omit<ChatMessage, "createdAt">): Promise<ChatMessage>;

  deleteMessagesByChatIdAfterTimestamp(messageId: string): Promise<void>;

  deleteAllThreads(userId: string): Promise<void>;

  deleteUnarchivedThreads(userId: string): Promise<void>;

  checkAccess(id: string, userId: string): Promise<boolean>;

  insertMessages(
    messages: PartialBy<ChatMessage, "createdAt">[],
  ): Promise<ChatMessage[]>;
};

export const ManualToolConfirmTag = tag<{
  confirm: boolean;
}>("manual-tool-confirm");
