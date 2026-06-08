# Kill Switch Runbook

## What it does

The kill switch blocks **all** chat inference requests with a `503 Service Unavailable` and a human-readable maintenance message. Use it during incidents when inference must be paused instantly, without a code deploy.

## Activation paths

| Method | Latency | Persistence |
|--------|---------|-------------|
| `ASAFE_KILL_SWITCH=1` env var | Immediate (pod restart required to take effect) | Until env var is removed + pod restarted |
| `asafe_feature_flag` DB row | ≤ 5 s (in-process cache TTL) | Until DB row is set back to `false` |

The DB method is preferred during incidents — no deploy, no restart.

## Activate via DB (recommended)

```sql
UPDATE asafe_feature_flag
SET enabled = true, updated_at = now()
WHERE name = 'kill_switch';
```

All pods pick up the change within **5 seconds**.

## Deactivate via DB

```sql
UPDATE asafe_feature_flag
SET enabled = false, updated_at = now()
WHERE name = 'kill_switch';
```

Pods resume serving inference within **5 seconds** of this statement.

## Verify it's active

Check the Grafana "Kill Switch Activations" panel on the `asafe-ai — Production SLOs` dashboard. Activations counter should increment once per blocked request.

Alternatively:
```bash
curl -s -o /dev/null -w "%{http_code}" https://<app-host>/api/chat
# Should return 503 while kill switch is active
```

## When to use it

- AI provider is returning garbage / harmful output at scale and guardrails haven't caught it
- A data exfiltration incident is suspected
- Platform stability issue requiring immediate traffic halt
- Security/Legal directive to pause AI operations

## What users see

```
The AI assistant is temporarily unavailable for maintenance. Please try again later.
```

HTTP 503. The UI should surface this as a banner. No data is lost — requests are rejected cleanly.

## What is NOT affected

- All non-chat routes (auth, admin, file uploads, settings) continue to work
- Kill switch does NOT affect the rest of the application

## On-call checklist

1. **Activate** via DB (above)
2. **Verify** via Grafana or curl
3. **Notify** via Slack `#asafe-incidents` with ETA for resolution
4. **Investigate** root cause (check Sentry, Grafana provider error panels)
5. **Deactivate** once stable, verify inference resumes
6. **Post-mortem** — file in Confluence within 48 h
