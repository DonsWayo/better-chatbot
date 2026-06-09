# Load Testing Runbook

## Overview

The load test verifies the SLO targets from ADR-0012 before GA rollout. It uses [k6](https://k6.io).

## Prerequisites

```bash
# macOS
brew install k6

# Linux
sudo snap install k6
```

## Obtain an auth token

The load test needs a valid session. Get one via the API:

```bash
TOKEN=$(curl -s -X POST https://<your-app>/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"editor@your-domain.com","password":"YourPassword"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))")
```

Or copy the `next-auth.session-token` cookie from your browser's DevTools and pass it as a cookie header instead.

## Run stages

### Smoke test (5 VUs, ~2 min)

Quick sanity check before heavier tests:

```bash
k6 run tests/load/chat-load-test.js \
  -e BASE_URL=https://<your-app> \
  -e AUTH_TOKEN="Bearer $TOKEN" \
  -e STAGE=smoke
```

### Soak test (20 VUs, ~14 min)

Tests for memory leaks and connection pool exhaustion:

```bash
k6 run tests/load/chat-load-test.js \
  -e BASE_URL=https://<your-app> \
  -e AUTH_TOKEN="Bearer $TOKEN" \
  -e STAGE=soak
```

### Ramp test (up to 200 VUs, ~19 min)

Simulates the 800-user rollout — ramps from 10 → 200 → back down:

```bash
k6 run tests/load/chat-load-test.js \
  -e BASE_URL=https://<your-app> \
  -e AUTH_TOKEN="Bearer $TOKEN" \
  -e STAGE=ramp
```

### Spike test (sudden 200-VU spike)

Tests resilience against burst traffic:

```bash
k6 run tests/load/chat-load-test.js \
  -e BASE_URL=https://<your-app> \
  -e AUTH_TOKEN="Bearer $TOKEN" \
  -e STAGE=spike
```

## Interpreting results

The test enforces these thresholds (from ADR-0012):

| Threshold | Pass condition |
|-----------|---------------|
| `http_req_duration p(95)` | < 30 000 ms |
| `http_req_duration p(99)` | < 60 000 ms |
| `chat_errors rate` | < 1% |
| `http_req_failed rate` | < 2% |
| `rate_limited rate` | < 5% |

A `PASS` on all thresholds = SLO-compliant. Attach the k6 output HTML report to the GA sign-off ticket.

## During the test: watch Grafana

Open the `asafe-ai — Production SLOs` dashboard and monitor:
- **TTFT P95** — should stay < 2 000 ms
- **Active Requests** — alert threshold is 150; hard limit is 200
- **Provider Error Rate** — should stay < 2%
- **Rate Limit Activations** — should not spike (the test user shouldn't hit per-user limits)

## Generate HTML report

```bash
k6 run tests/load/chat-load-test.js \
  -e BASE_URL=https://<your-app> \
  -e AUTH_TOKEN="Bearer $TOKEN" \
  -e STAGE=ramp \
  --out json=results.json

# Convert to HTML (requires k6 reporter)
npx k6-reporter results.json
```
