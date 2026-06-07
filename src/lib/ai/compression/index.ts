import type { UIMessage } from "ai";

export interface CompressionResult {
  messages: UIMessage[];
  compressed: boolean;
  tokensBefore: number;
  tokensAfter: number;
}

export interface CompressionConfig {
  maxContextTokens: number;
  targetUtilization: number; // 0.0–1.0; default 0.7 (compress to 70% of max)
  preserveRecentMessages: number; // always keep last N messages uncompressed; default 6
}

const DEFAULT_CONFIG: CompressionConfig = {
  maxContextTokens: 128_000,
  targetUtilization: 0.7,
  preserveRecentMessages: 6,
};

/** Rough token estimate: 1 token ≈ 4 characters. */
function estimateTokens(messages: UIMessage[]): number {
  return Math.ceil(
    messages.reduce((acc, m) => {
      const parts = m.parts ?? [];
      return acc + parts.reduce((a, p: any) => a + (p.text?.length ?? 0), 0);
    }, 0) / 4,
  );
}

/**
 * Wave 11 stub: compress conversation history when approaching context limit.
 * Currently a pass-through — Wave 11 will implement the actual summarization.
 *
 * Real implementation options (ADR-0011, deferred):
 *  - (a) headroom Python sidecar (MCP transport)
 *  - (b) TS reimplementation using a cheap/fast model for rolling summaries
 */
export async function compressMessages(
  messages: UIMessage[],
  config: Partial<CompressionConfig> = {},
): Promise<CompressionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const tokensBefore = estimateTokens(messages);

  // Pass-through until Wave 11
  if (tokensBefore < cfg.maxContextTokens * cfg.targetUtilization) {
    return {
      messages,
      compressed: false,
      tokensBefore,
      tokensAfter: tokensBefore,
    };
  }

  // TODO Wave 11: summarize older messages here
  // For now: truncate oldest messages beyond preserveRecentMessages as a safety valve
  if (messages.length > cfg.preserveRecentMessages) {
    const recent = messages.slice(-cfg.preserveRecentMessages);
    const tokensAfter = estimateTokens(recent);
    return { messages: recent, compressed: true, tokensBefore, tokensAfter };
  }

  return {
    messages,
    compressed: false,
    tokensBefore,
    tokensAfter: tokensBefore,
  };
}

export const COMPRESSION_ENABLED =
  process.env.ASAFE_COMPRESSION_ENABLED === "true";
