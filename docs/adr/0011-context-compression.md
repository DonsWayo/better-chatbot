# ADR-0011: Context Compression Strategy

**Status:** Accepted (2026-06-07, Wave 11)
**Deciders:** Engineering
**Gates:** Wave 11 (implementation), Wave 12 (tuning at scale)

## Context

Long conversations generate large prompts. At 800-user scale, many threads will exceed 64k tokens, significantly increasing both inference cost and latency. We need a compression layer that reduces context before it reaches the model, without disrupting the user experience or the guardrails/safety stack.

Three forces shape the decision:
1. **Cost**: token cost scales linearly with prompt length
2. **Latency**: larger prompts → longer TTFT, especially at high tier models
3. **Correctness**: over-aggressive compression breaks conversation coherence

## Decision

We implement a **three-strategy cascade** as a `LanguageModelMiddleware` (`wrapWithCompression`), placed **outside** the guardrails wrapper so it reduces context before guardrails scans it:

```
request → compression → guardrails → raw model
```

### Strategies (applied in order, most conservative first)

1. **Tool-output truncation** (`compressToolOutputs`): truncate long tool results at `maxToolOutputChars` (default 4k). Tool output is the safest to truncate — it's reference data, not conversation.

2. **Old-assistant message truncation** (`compressOldAssistantMessages`): truncate assistant messages outside the recent window (default last 6 messages) at `maxOldAssistantMsgChars` (default 2k). The user rarely needs verbatim access to old assistant text; key facts repeat in subsequent messages.

3. **History drop** (`dropOldHistory`): drop the oldest user+assistant pairs until the total message count is within `historyCompressionThreshold` (default 30). This is aggressive and loses full context, so it's only used at "aggressive" level.

### Compression levels per guardrail policy

| Team policy | Level | Rationale |
|-------------|-------|-----------|
| `strict` | `aggressive` | High-risk teams likely have shorter, more structured conversations |
| `standard` | `standard` | Default — balances cost and coherence |
| `permissive` | `light` | Power users who may need full conversation history |
| none | `standard` | Same as standard |

### Implementation seam

The middleware uses the AI SDK v5 `LanguageModelMiddleware.transformParams` hook, so it intercepts the full prompt before it reaches any provider. It is composable with any underlying model.

## Consequences

**Positive:**
- Measurable cost reduction for long threads (tracked via `asafe_compression_chars_saved_total`)
- Drop in TTFT for conversations that hit the threshold
- Transparent to guardrails and the provider — they always see the compressed prompt

**Negative:**
- At "aggressive" level, dropped history can cause apparent amnesia for the AI in very long threads
- Tool-output truncation may lose detail for complex multi-step tool chains
- Adds ~1ms of CPU overhead per request (compression is O(n) in message count)

**Mitigations:**
- Teams can configure their level via the guardrail policy; power users get "light" compression
- The `maxToolOutputChars` default (4k) is generous enough to preserve all useful tool output
- Compression is disabled entirely by setting `ASAFE_COMPRESSION_ENABLED=false`

## Alternatives considered

1. **Server-side summarisation** (LLM call to summarise old history): More semantically correct but adds 500ms–2s latency and significant cost per summarisation. Deferred to a future wave behind a feature flag.

2. **Sliding window only** (always drop old turns): Simple but loses tool-chain context for agentic workflows. Worse than the cascade for most task classes.

3. **No compression** (rely on model's context window): Works until 128k tokens, then hard-fails. Not viable at scale.
