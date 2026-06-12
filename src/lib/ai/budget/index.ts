/**
 * asafe-ai Wave 3: budget enforcement + usage event recording (ADR-0003)
 *
 * checkBudget  – call before inference; returns { allowed } or 402 reason
 * recordUsage  – fire-and-forget after inference; inserts usage event + increments budget used_usd
 * estimateCostUsd – simple per-model price table (refined in Wave 3 billing sprint)
 */

import { and, lte, gte, sql } from "drizzle-orm";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  AsafeTeamBudgetTable,
  AsafeUsageEventTable,
} from "@/lib/db/pg/schema.pg";
import globalLogger from "logger";
import { budgetUtilizationGauge } from "@/lib/observability/metrics";

const logger = globalLogger.withDefaults({ message: "budget: " });

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

interface ModelPricing {
  promptPerM: number; // USD per 1M prompt tokens
  completionPerM: number; // USD per 1M completion tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4.8": { promptPerM: 15, completionPerM: 75 },
  "gpt-5.5": { promptPerM: 2.5, completionPerM: 10 },
  "gemini-3.5-flash": { promptPerM: 0.15, completionPerM: 0.6 },
  "gemini-3.1-flash-lite": { promptPerM: 0.1, completionPerM: 0.4 },
  // Cost stack — the Auto routing tiers (frontier/balanced/fast/cheap). Prices
  // per src/lib/ai/routing/policy.ts; keys match the registry ids in
  // src/lib/ai/models.ts (bare ids, not OpenRouter slugs).
  "kimi-k2.6": { promptPerM: 0.68, completionPerM: 3.41 }, // frontier tier
  "deepseek-v4-pro": { promptPerM: 0.43, completionPerM: 0.87 }, // balanced tier
  "deepseek-v4-flash": { promptPerM: 0.1, completionPerM: 0.2 }, // fast/cheap tier
  // Embeddings (input-only). Verified against OpenRouter /api/v1/embeddings/models
  // on 2026-06-11: prompt $0.00000002/token = $0.02 per 1M tokens, completion $0.
  "openai/text-embedding-3-small": { promptPerM: 0.02, completionPerM: 0 },
};

const DEFAULT_PRICING: ModelPricing = { promptPerM: 1, completionPerM: 4 };

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (
    (promptTokens / 1_000_000) * pricing.promptPerM +
    (completionTokens / 1_000_000) * pricing.completionPerM
  );
}

// ---------------------------------------------------------------------------
// Budget alert
// ---------------------------------------------------------------------------

const BUDGET_ALERT_THRESHOLD = 0.8;

export async function checkBudgetAlert(teamId: string): Promise<void> {
  const [budget] = await db
    .select({
      budgetUsd: AsafeTeamBudgetTable.budgetUsd,
      usedUsd: AsafeTeamBudgetTable.usedUsd,
      teamId: AsafeTeamBudgetTable.teamId,
    })
    .from(AsafeTeamBudgetTable)
    .where(
      and(
        sql`${AsafeTeamBudgetTable.teamId} = ${teamId}`,
        lte(AsafeTeamBudgetTable.periodStart, new Date()),
        gte(AsafeTeamBudgetTable.periodEnd, new Date()),
      ),
    )
    .limit(1);

  if (!budget) return;

  const ratio =
    parseFloat(budget.usedUsd as string) /
    parseFloat(budget.budgetUsd as string);

  if (ratio >= BUDGET_ALERT_THRESHOLD) {
    logger.warn(
      `budget alert: team ${teamId} at ${(ratio * 100).toFixed(1)}% utilization`,
    );
    budgetUtilizationGauge.set({ team_id: teamId }, ratio);
  }
}

// ---------------------------------------------------------------------------
// Budget check
// ---------------------------------------------------------------------------

export async function checkBudget(
  _userId: string,
  teamId: string | null,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!teamId) {
    return { allowed: true };
  }

  try {
    const now = new Date();
    const [budget] = await db
      .select({
        budgetUsd: AsafeTeamBudgetTable.budgetUsd,
        usedUsd: AsafeTeamBudgetTable.usedUsd,
      })
      .from(AsafeTeamBudgetTable)
      .where(
        and(
          sql`${AsafeTeamBudgetTable.teamId} = ${teamId}`,
          lte(AsafeTeamBudgetTable.periodStart, now),
          gte(AsafeTeamBudgetTable.periodEnd, now),
        ),
      )
      .limit(1);

    if (!budget) {
      // No budget row → no cap
      return { allowed: true };
    }

    const used = parseFloat(budget.usedUsd as string);
    const cap = parseFloat(budget.budgetUsd as string);

    if (used >= cap) {
      return { allowed: false, reason: "Team budget exhausted" };
    }

    return { allowed: true };
  } catch (err) {
    logger.error("checkBudget error (failing open):", err);
    // Fail open so a DB hiccup doesn't block all inference
    return { allowed: true };
  }
}

// ---------------------------------------------------------------------------
// Usage recording
// ---------------------------------------------------------------------------

export interface RecordUsageParams {
  userId: string;
  teamId: string | null;
  sessionId: string | null;
  model: string;
  provider: string;
  taskClass: string | null;
  tier: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export async function recordUsage(params: RecordUsageParams): Promise<void> {
  try {
    await db.insert(AsafeUsageEventTable).values({
      userId: params.userId,
      teamId: params.teamId ?? undefined,
      sessionId: params.sessionId,
      model: params.model,
      provider: params.provider,
      taskClass: params.taskClass,
      tier: params.tier,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      costUsd: String(params.costUsd),
    });

    // Increment used_usd on the active budget row if one exists for this team
    if (params.teamId) {
      const now = new Date();
      await db
        .update(AsafeTeamBudgetTable)
        .set({
          usedUsd: sql`used_usd + ${String(params.costUsd)}`,
          updatedAt: now,
        })
        .where(
          and(
            sql`${AsafeTeamBudgetTable.teamId} = ${params.teamId}`,
            lte(AsafeTeamBudgetTable.periodStart, now),
            gte(AsafeTeamBudgetTable.periodEnd, now),
          ),
        );

      checkBudgetAlert(params.teamId).catch(() => {});
    }
  } catch (err) {
    logger.error("recordUsage error:", err);
    // Do not re-throw — usage recording is fire-and-forget
  }
}
