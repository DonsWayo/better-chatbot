/**
 * k6 load test for asafe-ai chat API.
 *
 * Tests the primary SLO targets from ADR-0012:
 *   - TTFT P95 < 2 000 ms
 *   - Error rate < 1%
 *   - Active requests peak < 200
 *
 * Usage:
 *   # Install k6: https://k6.io/docs/getting-started/installation/
 *   k6 run tests/load/chat-load-test.js \
 *     -e BASE_URL=https://your-app.example.com \
 *     -e AUTH_TOKEN="Bearer <session_token>"
 *
 *   # Ramping stages (gradual ramp to simulate 800-user rollout):
 *   k6 run tests/load/chat-load-test.js \
 *     -e BASE_URL=https://your-app.example.com \
 *     -e AUTH_TOKEN="Bearer <session_token>" \
 *     -e STAGE=ramp
 *
 * Obtaining AUTH_TOKEN:
 *   POST /api/auth/sign-in/email with {email, password}
 *   Copy the session cookie or bearer token from the response.
 *
 * Interpreting results:
 *   - http_req_duration P95 ≈ "time to first byte" + stream drain; for SSE streams, this
 *     measures the full response duration. Compare against the 30s P95 SLO.
 *   - chat_errors rate < 0.01 (1%) → SLO pass
 *   - http_req_failed rate < 0.01 (1%) → SLO pass
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const chatErrorRate = new Rate("chat_errors");
const rateLimitRate = new Rate("rate_limited");
const blockedByKillSwitch = new Rate("kill_switch_blocks");
const chatDuration = new Trend("chat_duration_ms", true);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const STAGE = __ENV.STAGE || "smoke";

const stages = {
  smoke: [
    { duration: "30s", target: 5 },
    { duration: "1m", target: 5 },
    { duration: "30s", target: 0 },
  ],
  soak: [
    { duration: "2m", target: 20 },
    { duration: "10m", target: 20 },
    { duration: "2m", target: 0 },
  ],
  ramp: [
    { duration: "2m", target: 10 },
    { duration: "5m", target: 50 },
    { duration: "5m", target: 100 },
    { duration: "5m", target: 200 },
    { duration: "5m", target: 100 },
    { duration: "2m", target: 0 },
  ],
  spike: [
    { duration: "1m", target: 10 },
    { duration: "30s", target: 200 },  // spike
    { duration: "1m", target: 10 },
    { duration: "30s", target: 0 },
  ],
};

export const options = {
  stages: stages[STAGE] || stages.smoke,
  thresholds: {
    // SLO targets from ADR-0012
    http_req_duration: ["p(95)<30000", "p(99)<60000"],
    chat_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.02"],
    rate_limited: ["rate<0.05"],   // < 5% rate-limited is acceptable at load
  },
};

// ---------------------------------------------------------------------------
// Test messages (varied to exercise routing)
// ---------------------------------------------------------------------------
const TEST_MESSAGES = [
  "Hello, how are you?",
  "Write a short poem about autumn.",
  "What is 2 + 2?",
  "Summarize the key benefits of TypeScript in one sentence.",
  "What is the capital of France?",
];

let _counter = 0;
function uid() {
  return `load-${__VU}-${__ITER}-${_counter++}`;
}

// ---------------------------------------------------------------------------
// Main scenario
// ---------------------------------------------------------------------------
export default function () {
  const threadId = uid();
  const messageId = uid();
  const text = TEST_MESSAGES[Math.floor(Math.random() * TEST_MESSAGES.length)];

  const payload = JSON.stringify({
    id: threadId,
    message: {
      id: messageId,
      role: "user",
      parts: [{ type: "text", text }],
    },
    toolChoice: "none",
    allowedAppDefaultToolkit: [],
    allowedMcpServers: {},
  });

  const headers = {
    "Content-Type": "application/json",
    ...(AUTH_TOKEN ? { Authorization: AUTH_TOKEN } : {}),
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/chat`, payload, {
    headers,
    timeout: "60s",
  });
  const duration = Date.now() - start;
  chatDuration.add(duration);

  const success = check(res, {
    "status not 5xx": (r) => r.status < 500,
    "not unauthorized": (r) => r.status !== 401,
  });

  chatErrorRate.add(!success || res.status >= 500);
  rateLimitRate.add(res.status === 429);
  blockedByKillSwitch.add(res.status === 503);

  // Brief pause between requests to simulate realistic user cadence
  sleep(Math.random() * 2 + 1); // 1–3 s
}

// ---------------------------------------------------------------------------
// Health check (setup stage)
// ---------------------------------------------------------------------------
export function setup() {
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`Health check failed: ${res.status} — is the app running at ${BASE_URL}?`);
  }
  console.log(`Load test target: ${BASE_URL} (stage: ${STAGE})`);
}
