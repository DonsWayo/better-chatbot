import { describe, expect, it } from "vitest";

import { customModelProvider } from "./models";

// Opt-in real-LLM tier (RUN_LLM_TESTS=1 pnpm test:llm) — see vitest.llm.config.ts.
const RUN = Boolean(
  process.env.OPENROUTER_API_KEY && process.env.RUN_LLM_TESTS === "1",
);

/** The approved static registry in models.ts — update when the short list changes. */
const EXPECTED_MODEL_COUNT = 7;

/** name (UI id) -> OpenRouter slug, derived from the live registry objects. */
function openRouterModels(): { name: string; slug: string }[] {
  const provider = customModelProvider.modelsInfo.find(
    (p) => p.provider === "openRouter",
  );
  if (!provider) throw new Error("openRouter provider missing from registry");
  return provider.models.map(({ name }) => {
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: name,
    });
    const slug = typeof model === "string" ? model : model.modelId;
    return { name, slug };
  });
}

/**
 * Registry smoke: one REAL chat completion per approved model (max_tokens: 1)
 * via the OpenRouter HTTP API. Guarantees a stale or misspelled model slug in
 * src/lib/ai/models.ts can never ship silently again — OpenRouter 404s unknown
 * slugs. Serial (vitest.llm.config.ts fileParallelism: false + sequential its).
 */
describe.skipIf(!RUN)("OpenRouter static registry smoke (real API)", () => {
  const models = openRouterModels();

  it(`registry exposes exactly ${EXPECTED_MODEL_COUNT} openRouter models`, () => {
    expect(models).toHaveLength(EXPECTED_MODEL_COUNT);
    for (const { name, slug } of models) {
      expect(
        slug,
        `model "${name}" should map to a provider/model slug`,
      ).toMatch(/^[\w.-]+\/[\w.:-]+$/);
    }
  });

  /**
   * "No endpoints available matching … data policy" (404) means the slug EXISTS
   * but every provider endpoint is excluded by this OpenRouter *account's*
   * privacy settings — an account-configuration problem, not a stale slug.
   * A genuinely wrong slug fails differently: 400 "… is not a valid model ID".
   */
  const DATA_POLICY_BLOCK = /no endpoints available.*data policy/i;
  const STALE_SLUG = /not a valid model id|no model found/i;

  for (const { name, slug } of openRouterModels()) {
    it(
      `"${name}" (${slug}) answers a minimal chat completion`,
      { timeout: 30_000 },
      async () => {
        const res = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: slug,
              messages: [{ role: "user", content: "Hi" }],
              // OpenAI rejects max_output_tokens < 16, so 16 is the floor.
              max_tokens: 16,
            }),
            signal: AbortSignal.timeout(29_000),
          },
        );
        const body = await res.text();
        const detail = `${slug} → ${body.slice(0, 300)}`;
        const parsed = JSON.parse(body) as { error?: { message?: string } };

        // A stale/misspelled registry slug must always fail the suite.
        expect(parsed.error?.message ?? "", detail).not.toMatch(STALE_SLUG);

        if (res.status === 404 && DATA_POLICY_BLOCK.test(body)) {
          // Slug is valid but unservable under the account's data policy —
          // surface loudly without failing the registry check.
          console.warn(
            `[llm-smoke] "${name}" (${slug}) is blocked by the OpenRouter ` +
              `account data-policy settings — users selecting it get errors. ` +
              `Fix at https://openrouter.ai/settings/privacy or drop it from ` +
              `the registry.`,
          );
          return;
        }

        expect(res.status, detail).toBe(200);
        // OpenRouter can also report provider errors inside a 200 body.
        expect(parsed.error, detail).toBeUndefined();
      },
    );
  }
});
