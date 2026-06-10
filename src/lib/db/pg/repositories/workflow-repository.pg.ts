import { ObjectJsonSchema7 } from "app-types/util";
import {
  DBEdge,
  DBNode,
  DBWorkflow,
  WorkflowRepository,
  WorkflowSummary,
} from "app-types/workflow";
import { SQL, and, desc, eq, inArray, not, or, sql } from "drizzle-orm";
import { createUINode } from "lib/ai/workflow/create-ui-node";
import {
  convertUINodeToDBNode,
  defaultObjectJsonSchema,
} from "lib/ai/workflow/shared.workflow";
import { NodeKind } from "lib/ai/workflow/workflow.interface";
import { pgDb } from "../db.pg";
import {
  UserTable,
  WorkflowEdgeTable,
  WorkflowNodeDataTable,
  WorkflowTable,
} from "../schema.pg";

// Unified visibility model (docs/design/visibility-model.md): a workflow is
// also visible to a user when a `shared` grant names them or when its
// teamIds overlap one of their teams (same wiring as agent-repository).
// Org-wide values: modern "company" plus legacy "public"/"readonly" still
// readable on unmigrated rows (migration 0041 rewrites public → company).
// "team"-/"shared"-stored rows are NOT org-wide — they are covered by the
// inSharedTeam / hasGrant EXISTS conditions.
const ORG_WIDE_VISIBILITY = ["company", "public", "readonly"] as const;

const hasGrant = (userId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM entity_grant eg
        WHERE eg.entity_type = 'workflow'
          AND eg.entity_id = ${WorkflowTable.id}
          AND eg.grantee_user_id = ${userId})`;

const inSharedTeam = (userId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM asafe_team_member tm
        WHERE tm.user_id = ${userId}
          AND ${WorkflowTable.teamIds} @> to_jsonb(ARRAY[tm.team_id::text]))`;

export const pgWorkflowRepository: WorkflowRepository = {
  async selectToolByIds(ids) {
    if (!ids.length) return [];
    const rows = await pgDb
      .select({
        id: WorkflowTable.id,
        name: WorkflowTable.name,
        description: WorkflowTable.description,
        schema: WorkflowNodeDataTable.nodeConfig,
      })
      .from(WorkflowTable)
      .innerJoin(
        WorkflowNodeDataTable,
        and(
          eq(WorkflowNodeDataTable.workflowId, WorkflowTable.id),
          eq(WorkflowNodeDataTable.kind, NodeKind.Input),
        ),
      )
      .where(
        and(
          inArray(WorkflowTable.id, ids),
          eq(WorkflowTable.isPublished, true),
        ),
      );
    return rows.map(
      (data) =>
        ({
          ...data,
          schema:
            data.schema?.outputSchema ||
            structuredClone(defaultObjectJsonSchema),
        }) as {
          id: string;
          name: string;
          description?: string;
          schema: ObjectJsonSchema7;
        },
    );
  },

  async selectExecuteAbility(userId) {
    const rows = await pgDb
      .select({
        id: WorkflowTable.id,
        name: WorkflowTable.name,
        description: WorkflowTable.description,
        icon: WorkflowTable.icon,
        visibility: WorkflowTable.visibility,
        isPublished: WorkflowTable.isPublished,
        userId: WorkflowTable.userId,
        userName: UserTable.name,
        userAvatar: UserTable.image,
        updatedAt: WorkflowTable.updatedAt,
      })
      .from(WorkflowTable)
      .innerJoin(UserTable, eq(WorkflowTable.userId, UserTable.id))
      .where(
        and(
          eq(WorkflowTable.isPublished, true),
          or(
            eq(WorkflowTable.userId, userId),
            // Org-wide only — "team"/"shared"-stored rows must NOT leak here;
            // they are covered by the grant/team EXISTS conditions below.
            inArray(WorkflowTable.visibility, [...ORG_WIDE_VISIBILITY]),
            hasGrant(userId),
            inSharedTeam(userId),
          ),
        ),
      );
    return rows as WorkflowSummary[];
  },
  async selectAll(userId) {
    const rows = await pgDb
      .select({
        id: WorkflowTable.id,
        name: WorkflowTable.name,
        description: WorkflowTable.description,
        icon: WorkflowTable.icon,
        visibility: WorkflowTable.visibility,
        isPublished: WorkflowTable.isPublished,
        userId: WorkflowTable.userId,
        userName: UserTable.name,
        userAvatar: UserTable.image,
        updatedAt: WorkflowTable.updatedAt,
      })
      .from(WorkflowTable)
      .innerJoin(UserTable, eq(WorkflowTable.userId, UserTable.id))
      .where(
        or(
          inArray(WorkflowTable.visibility, [...ORG_WIDE_VISIBILITY]),
          eq(WorkflowTable.userId, userId),
          hasGrant(userId),
          inSharedTeam(userId),
        ),
      )
      .orderBy(desc(WorkflowTable.createdAt));
    return rows as WorkflowSummary[];
  },
  async selectById(id) {
    const [workflow] = await pgDb
      .select()
      .from(WorkflowTable)
      .where(eq(WorkflowTable.id, id));
    return workflow as DBWorkflow;
  },

  async checkAccess(workflowId, userId, readOnly = true) {
    const [workflow] = await pgDb
      .select({
        visibility: WorkflowTable.visibility,
        userId: WorkflowTable.userId,
        hasGrant: sql<boolean>`EXISTS (SELECT 1 FROM entity_grant eg
          WHERE eg.entity_type = 'workflow'
            AND eg.entity_id = ${WorkflowTable.id}
            AND eg.grantee_user_id = ${userId})`,
        hasEditGrant: sql<boolean>`EXISTS (SELECT 1 FROM entity_grant eg
          WHERE eg.entity_type = 'workflow'
            AND eg.entity_id = ${WorkflowTable.id}
            AND eg.grantee_user_id = ${userId}
            AND eg.capability IN ('edit', 'manage'))`,
        inTeam: sql<boolean>`EXISTS (SELECT 1 FROM asafe_team_member tm
          WHERE tm.user_id = ${userId}
            AND ${WorkflowTable.teamIds} @> to_jsonb(ARRAY[tm.team_id::text]))`,
      })
      .from(WorkflowTable)
      .where(and(eq(WorkflowTable.id, workflowId)));
    if (!workflow) {
      return false;
    }
    if (userId == workflow.userId) return true;
    // Org-wide read/use: modern "company", legacy "public" (rewritten to
    // "company" by migration 0041) and legacy "readonly" (view-only).
    const orgWide =
      workflow.visibility === "company" ||
      workflow.visibility === "public" ||
      workflow.visibility === "readonly";
    if (readOnly) {
      if (orgWide) return true;
      // "private"/"team"/"shared": grants or team membership open read access.
      return workflow.hasGrant || workflow.inTeam;
    }
    // Writes always need an edit-capable grant for non-owners — company/public
    // grant use, not edit; readonly stays view-only; team/shared/private rely
    // on the grant tables.
    return workflow.hasEditGrant;
  },
  async delete(id) {
    const result = await pgDb
      .delete(WorkflowTable)
      .where(eq(WorkflowTable.id, id));
    if (result.rowCount === 0) {
      throw new Error("Workflow not found");
    }
  },
  async selectByUserId(userId) {
    const rows = await pgDb
      .select()
      .from(WorkflowTable)
      .where(eq(WorkflowTable.userId, userId))
      .orderBy(desc(WorkflowTable.createdAt));
    return rows as DBWorkflow[];
  },
  async save(workflow, noGenerateInputNode = false) {
    const prev = workflow.id
      ? await pgDb
          .select({ id: WorkflowTable.id })
          .from(WorkflowTable)
          .where(eq(WorkflowTable.id, workflow.id))
      : null;
    const isNew = !prev;
    const [row] = await pgDb
      .insert(WorkflowTable)
      .values(workflow)
      .onConflictDoUpdate({
        target: [WorkflowTable.id],
        set: {
          ...workflow,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (isNew && !noGenerateInputNode) {
      const startNode = createUINode(NodeKind.Input);
      await pgDb.insert(WorkflowNodeDataTable).values({
        ...convertUINodeToDBNode(row.id, startNode),
        name: "INPUT",
      });
    }

    return row as DBWorkflow;
  },
  async saveStructure({ workflowId, nodes, edges, deleteNodes, deleteEdges }) {
    await pgDb.transaction(async (tx) => {
      const deletePromises: Promise<any>[] = [];
      if (deleteNodes?.length) {
        const deleteNodePromises = tx
          .delete(WorkflowNodeDataTable)
          .where(
            and(
              eq(WorkflowNodeDataTable.workflowId, workflowId),
              inArray(WorkflowNodeDataTable.id, deleteNodes),
            ),
          );
        deletePromises.push(deleteNodePromises);
      }
      if (deleteEdges?.length) {
        const deleteEdgePromises = tx
          .delete(WorkflowEdgeTable)
          .where(
            and(
              eq(WorkflowEdgeTable.workflowId, workflowId),
              inArray(WorkflowEdgeTable.id, deleteEdges),
            ),
          );
        deletePromises.push(deleteEdgePromises);
      }
      await Promise.all(deletePromises);
      if (nodes?.length) {
        await tx
          .insert(WorkflowNodeDataTable)
          .values(nodes)
          .onConflictDoUpdate({
            target: [WorkflowNodeDataTable.id],
            set: {
              nodeConfig: sql.raw(
                `excluded.${WorkflowNodeDataTable.nodeConfig.name}`,
              ),
              uiConfig: sql.raw(
                `excluded.${WorkflowNodeDataTable.uiConfig.name}`,
              ),
              name: sql.raw(`excluded.${WorkflowNodeDataTable.name.name}`),
              description: sql.raw(
                `excluded.${WorkflowNodeDataTable.description.name}`,
              ),
              kind: sql.raw(`excluded.${WorkflowNodeDataTable.kind.name}`),
              updatedAt: new Date(),
            },
          });
      }
      if (edges?.length) {
        await tx.insert(WorkflowEdgeTable).values(edges).onConflictDoNothing();
      }
    });
  },
  async selectStructureById(id, opt) {
    const [workflow] = await pgDb
      .select()
      .from(WorkflowTable)
      .where(eq(WorkflowTable.id, id));

    if (!workflow) return null;

    const nodeWhere = opt?.ignoreNote
      ? and(
          eq(WorkflowNodeDataTable.workflowId, id),
          not(eq(WorkflowNodeDataTable.kind, NodeKind.Note)),
        )
      : eq(WorkflowNodeDataTable.workflowId, id);

    const nodePromises = pgDb
      .select()
      .from(WorkflowNodeDataTable)
      .where(nodeWhere);
    const edgePromises = pgDb
      .select()
      .from(WorkflowEdgeTable)
      .where(eq(WorkflowEdgeTable.workflowId, id));
    const [nodes, edges] = await Promise.all([nodePromises, edgePromises]);
    return {
      ...(workflow as DBWorkflow),
      nodes: nodes as DBNode[],
      edges: edges as DBEdge[],
    };
  },
};
