"server-only";

/**
 * W12.1 — provider fallback middleware.
 *
 * Wraps a LanguageModel so that, when the primary provider returns a
 * retryable server error (5xx / 408 / network failure), the request is
 * transparently re-tried against each fallback model in order.
 *
 * Apply INSIDE the guardrail/compression stack so those layers still see
 * every response regardless of which model ultimately answered:
 *
 *   const modelWithFallback = wrapWithFallback(rawModel, fallbackModels);
 *   const guardedModel      = wrapWithGuardrails(modelWithFallback, ...);
 *   const model             = wrapWithCompression(guardedModel, ...);
 */

import type { LanguageModel, LanguageModelMiddleware } from "ai";
import { wrapLanguageModel, APICallError } from "ai";
import { providerFallbackTotal } from "lib/observability/slo";

export function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof APICallError) {
    const code = error.statusCode;
    if (code == null) return true; // network-level failure
    if (code >= 500) return true; // server error
    if (code === 408) return true; // request timeout
    return false;
  }
  if (error instanceof Error) {
    const msg = error.message;
    return (
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ENOTFOUND")
    );
  }
  return false;
}

type FallbackModel = {
  provider: string;
  modelId: string;
  // AI SDK v5 LanguageModelV2 public methods
  doGenerate(params: unknown): Promise<unknown>;
  doStream(params: unknown): Promise<unknown>;
};

function buildFallbackMiddleware(
  fallbacks: readonly LanguageModel[],
): LanguageModelMiddleware {
  const casted = fallbacks as unknown as FallbackModel[];

  return {
    middlewareVersion: "v2",

    async wrapGenerate({ doGenerate, params, model }) {
      try {
        return await doGenerate();
      } catch (err) {
        if (!isRetryableProviderError(err) || casted.length === 0) throw err;

        for (const fallback of casted) {
          try {
            providerFallbackTotal.inc({
              primary_provider: model.provider,
              fallback_provider: fallback.provider,
              fallback_model: fallback.modelId,
            });
            return (await fallback.doGenerate(params)) as Awaited<
              ReturnType<typeof doGenerate>
            >;
          } catch {
            // continue to next fallback
          }
        }
        throw err;
      }
    },

    async wrapStream({ doStream, params, model }) {
      try {
        return await doStream();
      } catch (err) {
        if (!isRetryableProviderError(err) || casted.length === 0) throw err;

        for (const fallback of casted) {
          try {
            providerFallbackTotal.inc({
              primary_provider: model.provider,
              fallback_provider: fallback.provider,
              fallback_model: fallback.modelId,
            });
            return (await fallback.doStream(params)) as Awaited<
              ReturnType<typeof doStream>
            >;
          } catch {
            // continue to next fallback
          }
        }
        throw err;
      }
    },
  };
}

/**
 * Wrap a LanguageModel with W12.1 provider fallback.
 * When the primary fails with a retryable server error, each fallback is
 * tried in order. The original error is re-thrown if all fallbacks fail.
 */
export function wrapWithFallback(
  model: LanguageModel,
  fallbacks: readonly LanguageModel[],
): LanguageModel {
  if (fallbacks.length === 0) return model;

  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: buildFallbackMiddleware(fallbacks),
  }) as LanguageModel;
}

/** Ordered list of fallback models (cheapest/most-available first). */
export const FALLBACK_MODEL_IDS: ReadonlyArray<string> = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gpt-5.5",
  "claude-opus-4.8",
];
