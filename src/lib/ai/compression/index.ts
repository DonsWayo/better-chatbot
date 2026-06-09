"server-only";

/**
 * W11 — context compression middleware.
 *
 * Wraps a LanguageModel with a compression pass. The middleware compresses
 * tool outputs, old assistant turns, and long history before they reach the
 * model. The current user message is never compressed.
 *
 * Apply OUTSIDE the guardrails wrapper so compression runs first:
 *   const model = wrapWithCompression(
 *     wrapWithGuardrails(rawModel, userId, policy),
 *     { level: "standard", teamId: "team-abc" },
 *   );
 */

import type { LanguageModel, LanguageModelMiddleware } from "ai";
import { wrapLanguageModel } from "ai";
import type { CompressionLevel } from "./config";
import { buildCompressionConfig } from "./config";
import { applyCompression } from "./strategies";
import { recordCompressionSavings } from "./metrics";

export { buildCompressionConfig, DEFAULT_COMPRESSION_CONFIG } from "./config";
export type { CompressionConfig, CompressionLevel } from "./config";

export const COMPRESSION_ENABLED =
  process.env.ASAFE_COMPRESSION_ENABLED !== "false";

function buildCompressionMiddleware(
  level: CompressionLevel,
  teamId: string | null | undefined,
): LanguageModelMiddleware {
  const config = buildCompressionConfig(level);

  return {
    middlewareVersion: "v2",

    async transformParams({ params }) {
      const { prompt, charsBefore, charsAfter } = applyCompression(
        params.prompt,
        config,
      );

      recordCompressionSavings({ teamId, level, charsBefore, charsAfter });

      if (charsBefore !== charsAfter) {
        const pct = Math.round(
          ((charsBefore - charsAfter) / charsBefore) * 100,
        );
        console.info(
          `[compression] level=${level} team=${teamId ?? "none"} ` +
            `chars: ${charsBefore} → ${charsAfter} (-${pct}%)`,
        );
      }

      return { ...params, prompt };
    },
  };
}

/**
 * Wrap a LanguageModel with W11 context compression.
 * Returns the model unwrapped when compression is disabled globally or level="off".
 */
export function wrapWithCompression(
  model: LanguageModel,
  opts: {
    level?: CompressionLevel;
    teamId?: string | null;
  } = {},
): LanguageModel {
  const level = opts.level ?? "standard";

  if (!COMPRESSION_ENABLED || level === "off") return model;

  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: buildCompressionMiddleware(level, opts.teamId),
  }) as LanguageModel;
}

/**
 * Map a team's guardrailPolicy to a default compression level.
 * Strict policies get more aggressive compression.
 */
export function compressionLevelFromPolicy(
  guardrailPolicy?: string | null,
): CompressionLevel {
  switch (guardrailPolicy) {
    case "strict":
      return "aggressive";
    case "permissive":
      return "light";
    default:
      return "standard";
  }
}
