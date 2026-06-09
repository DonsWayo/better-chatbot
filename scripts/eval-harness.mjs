#!/usr/bin/env node
/**
 * W12 — Eval harness for ongoing quality monitoring.
 *
 * Runs a fixed eval set against a live Asafe AI instance and reports
 * pass/fail for each prompt based on lightweight assertions (length,
 * content contains/excludes). Use this for regression checks after
 * deployments and for drift detection.
 *
 * Usage:
 *   node scripts/eval-harness.mjs [options]
 *
 * Options:
 *   --base-url   Base URL (default: http://localhost:3001)
 *   --auth-token Bearer token for API authentication (required)
 *   --model      Model ID to test (default: gemini-2.5-flash)
 *   --timeout    Per-request timeout in ms (default: 30000)
 *   --output     Write JSON report to file (default: stdout only)
 *   --parallel   N concurrent requests (default: 1)
 *   --filter     Run only prompts whose id matches this prefix
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const PROMPTS_PATH = join(__dir, "../tests/eval/prompts.json");

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const [key, value] = argv[i].split("=");
    const name = key.replace(/^--/, "");
    args[name] = value ?? argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const BASE_URL = args["base-url"] ?? process.env.EVAL_BASE_URL ?? "http://localhost:3001";
const AUTH_TOKEN = args["auth-token"] ?? process.env.EVAL_AUTH_TOKEN ?? "";
const MODEL_ID = args["model"] ?? "gemini-2.5-flash";
const TIMEOUT_MS = Number(args["timeout"] ?? "30000");
const OUTPUT_FILE = args["output"] ?? null;
const PARALLEL = Number(args["parallel"] ?? "1");
const FILTER = args["filter"] ?? null;

if (!AUTH_TOKEN) {
  console.error("ERROR: --auth-token or EVAL_AUTH_TOKEN is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load prompts
// ---------------------------------------------------------------------------
const allPrompts = JSON.parse(readFileSync(PROMPTS_PATH, "utf-8"));
const prompts = FILTER
  ? allPrompts.filter((p) => p.id.startsWith(FILTER))
  : allPrompts;

console.log(`Eval harness — ${prompts.length} prompts against ${BASE_URL}`);
console.log(`Model: ${MODEL_ID}  Parallel: ${PARALLEL}  Timeout: ${TIMEOUT_MS}ms\n`);

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------
async function sendMessage(prompt) {
  const threadId = `eval-${prompt.id}-${Date.now()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        id: threadId,
        messages: [{ role: "user", content: prompt.message, id: `msg-${prompt.id}` }],
        chatModel: { provider: "openRouter", model: MODEL_ID },
        config: {},
      }),
    });

    if (!res.ok) {
      return { error: `HTTP ${res.status}`, body: await res.text().catch(() => "") };
    }

    // Read the streaming response body to extract the final text
    const text = await res.text();
    // AI SDK UI message stream uses "0:" prefix for text chunks
    const textChunks = text
      .split("\n")
      .filter((l) => l.startsWith("0:"))
      .map((l) => {
        try {
          return JSON.parse(l.slice(2));
        } catch {
          return "";
        }
      })
      .join("");

    return { body: textChunks || text };
  } catch (err) {
    if (err.name === "AbortError") return { error: "TIMEOUT" };
    return { error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Assertion checker
// ---------------------------------------------------------------------------
function checkAssertions(response, assertions) {
  const failures = [];
  const body = response.body ?? "";

  if (assertions.minLength != null && body.length < assertions.minLength) {
    failures.push(`Response too short: ${body.length} < ${assertions.minLength}`);
  }
  if (assertions.maxLength != null && body.length > assertions.maxLength) {
    failures.push(`Response too long: ${body.length} > ${assertions.maxLength}`);
  }
  for (const needle of assertions.mustContain ?? []) {
    if (!body.includes(needle)) {
      failures.push(`Missing required string: "${needle}"`);
    }
  }
  const oneOf = assertions.mustContainOneOf ?? [];
  if (oneOf.length > 0 && !oneOf.some((n) => body.includes(n))) {
    failures.push(`Missing one of: ${oneOf.map((n) => `"${n}"`).join(", ")}`);
  }
  for (const needle of assertions.mustNotContain ?? []) {
    if (body.includes(needle)) {
      failures.push(`Forbidden string found: "${needle}"`);
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function runPrompt(prompt) {
  const start = Date.now();
  const response = await sendMessage(prompt);
  const latencyMs = Date.now() - start;

  if (response.error) {
    return {
      id: prompt.id,
      name: prompt.name,
      status: "error",
      error: response.error,
      latencyMs,
    };
  }

  const failures = checkAssertions(response, prompt.assertions ?? {});
  const status = failures.length === 0 ? "pass" : "fail";

  return {
    id: prompt.id,
    name: prompt.name,
    status,
    latencyMs,
    failures: failures.length > 0 ? failures : undefined,
    responsePreview: response.body?.slice(0, 120),
  };
}

async function runBatch(batch) {
  return Promise.all(batch.map(runPrompt));
}

const results = [];
for (let i = 0; i < prompts.length; i += PARALLEL) {
  const batch = prompts.slice(i, i + PARALLEL);
  const batchResults = await runBatch(batch);
  results.push(...batchResults);
  for (const r of batchResults) {
    const icon = r.status === "pass" ? "✓" : r.status === "error" ? "E" : "✗";
    const latency = `${r.latencyMs}ms`;
    const extra =
      r.status === "fail"
        ? ` — ${r.failures?.join("; ")}`
        : r.status === "error"
          ? ` — ${r.error}`
          : "";
    console.log(`  [${icon}] ${r.id.padEnd(20)} ${latency.padStart(7)}${extra}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const pass = results.filter((r) => r.status === "pass").length;
const fail = results.filter((r) => r.status === "fail").length;
const errors = results.filter((r) => r.status === "error").length;
const avgLatency =
  results.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / results.length;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${errors} errors`);
console.log(`Avg latency: ${Math.round(avgLatency)}ms`);

const report = {
  timestamp: new Date().toISOString(),
  model: MODEL_ID,
  baseUrl: BASE_URL,
  summary: { total: results.length, pass, fail, errors, avgLatencyMs: Math.round(avgLatency) },
  results,
};

if (OUTPUT_FILE) {
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${OUTPUT_FILE}`);
}

// Exit non-zero if any failures/errors
process.exit(fail + errors > 0 ? 1 : 0);
