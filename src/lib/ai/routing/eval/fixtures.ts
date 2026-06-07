import type { RoutingRequestInput } from "app-types/routing";

// Wave 2 routing eval fixtures (ADR-0004).
// 12 representative prompts covering every TaskClass so the eval script and test
// can validate both routing correctness and blended-cost reduction.

export const EVAL_FIXTURES: { name: string; request: RoutingRequestInput }[] = [
  // ── code (2) ───────────────────────────────────────────────────────────────
  {
    name: "code/fix-bug",
    request: {
      text: "Fix this function — it throws when the array is empty:\n```ts\nconst first = (arr: string[]) => arr[0].toLowerCase();\n```",
    },
  },
  {
    name: "code/refactor",
    request: {
      text: "Refactor this class to use async/await instead of callbacks and add proper error handling.",
    },
  },

  // ── reasoning (2) ─────────────────────────────────────────────────────────
  {
    name: "reasoning/trade-offs",
    request: {
      text: "Compare the trade-offs between a monorepo and a polyrepo strategy for a team of 40 engineers, step by step.",
    },
  },
  {
    name: "reasoning/derive",
    request: {
      text: "Derive the time complexity of merge sort and explain why it is O(n log n).",
    },
  },

  // ── long_context (2) ──────────────────────────────────────────────────────
  {
    name: "long_context/large-thread",
    request: {
      text: "Summarise the key decisions made in this conversation.",
      totalChars: 20_000,
    },
  },
  {
    name: "long_context/doc-review",
    request: {
      text: "Review the architecture document below and flag any gaps.",
      totalChars: 25_000,
    },
  },

  // ── vision (2) ────────────────────────────────────────────────────────────
  {
    name: "vision/describe-image",
    request: {
      text: "Describe what is shown in this screenshot in detail.",
      hasImage: true,
    },
  },
  {
    name: "vision/extract-table",
    request: {
      text: "Extract the data from this table image into JSON.",
      hasImage: true,
    },
  },

  // ── tool_use (1) ──────────────────────────────────────────────────────────
  {
    name: "tool_use/web-search",
    request: {
      text: "Look up the current EUR/USD exchange rate.",
      hasTools: true,
    },
  },

  // ── quick_rewrite (1) ─────────────────────────────────────────────────────
  {
    name: "quick_rewrite/translate",
    request: {
      text: "Translate 'Good morning, how are you?' to French.",
    },
  },

  // ── general (2) ───────────────────────────────────────────────────────────
  {
    name: "general/greeting",
    request: { text: "Hello, what can you help me with today?" },
  },
  {
    name: "general/recommend",
    request: {
      text: "Can you recommend a good podcast about entrepreneurship?",
    },
  },
];
