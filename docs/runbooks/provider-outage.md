# Provider Outage Runbook

## Signals

- `asafe_ai_provider_errors_total{error_type="provider_error"}` rate > 5/min
- Chat requests returning 500 in Sentry
- TTFT P95 spike above 10 s (provider degraded, not down)

## Diagnosis

Check the Grafana "Provider Error Rate" and "Provider Fallback Activations" panels.

Identify the affected provider:
```promql
sum(rate(asafe_ai_provider_errors_total[5m])) by (provider, error_type)
```

## Mitigation options (in order of preference)

### 1. Automatic (model routing)
If `ASAFE_ROUTING_STRATEGY=auto`, the router already tries candidate models in tier order. Check `asafe_routing_decisions_total` — if it's routing to a lower tier, it's already falling back.

### 2. Manual: remove the failing provider from the model registry
Edit `src/lib/ai/models/index.ts` and comment out the provider's models. This forces routing to choose alternatives. Requires a deploy.

### 3. Last resort: kill switch
If all providers are down or the outage is causing harmful outputs, activate the kill switch:
```sql
UPDATE asafe_feature_flag SET enabled = true, updated_at = now() WHERE name = 'kill_switch';
```
See [kill-switch.md](./kill-switch.md) for full procedure.

## Provider status pages

- OpenRouter: https://openrouter.ai (check their Discord)
- OpenAI: https://status.openai.com
- Anthropic: https://status.anthropic.com
- Azure OpenAI: https://azure.status.microsoft.com

## Recovery

Once the provider recovers:
1. Verify error rate drops on Grafana
2. If kill switch was activated, deactivate it
3. If model registry was modified, revert and deploy
4. Monitor TTFT P95 for 15 min to confirm stability
