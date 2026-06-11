import { generateText } from "ai";
import { describe, expect, it } from "vitest";

import { customModelProvider } from "./models";
import { CREATE_THREAD_TITLE_PROMPT, sanitizeTitle } from "./prompts";

// Opt-in real-LLM tier (RUN_LLM_TESTS=1 pnpm test:llm) — see vitest.llm.config.ts.
const RUN = Boolean(
  process.env.OPENROUTER_API_KEY && process.env.RUN_LLM_TESTS === "1",
);

const REFUSAL = /sorry|cannot|can['’]?t assist|unable/i;

describe.skipIf(!RUN)("thread title generation (real model)", () => {
  // Regression for the "Title API" bug: this exact message used to yield the
  // persisted title "I'm sorry, but I cannot assist with t…" (model refusal
  // leaking into the sidebar). The refusal-proofed prompt + sanitizeTitle
  // fallback must keep refusals out of titles.
  it(
    'titles "Remember that I am the Head of Software Development." without refusing',
    { timeout: 30_000 },
    async () => {
      const message = "Remember that I am the Head of Software Development.";
      const { text } = await generateText({
        model: customModelProvider.getModel({
          provider: "openRouter",
          model: "gemini-3.1-flash-lite",
        }),
        system: CREATE_THREAD_TITLE_PROMPT,
        prompt: message,
        maxOutputTokens: 64,
      });

      // The prompt alone should already prevent refusals…
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(REFUSAL);

      // …and the sanitized title (what the route persists) never carries one.
      const title = sanitizeTitle(text, message);
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(80);
      expect(title).not.toMatch(REFUSAL);
    },
  );
});
