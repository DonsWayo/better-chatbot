"server-only";

/**
 * W11 — per-team context compression configuration.
 *
 * Aggressiveness levels control how aggressively context is trimmed before
 * the model call. "off" bypasses the middleware entirely for verbatim cases.
 */

export type CompressionLevel = "off" | "light" | "standard" | "aggressive";

export interface CompressionConfig {
  /** How aggressively to compress context. Default: "standard". */
  level: CompressionLevel;

  /**
   * Maximum characters allowed in a single tool-call result before truncation.
   * Set per aggressiveness level. "off" disables tool-output truncation.
   */
  maxToolOutputChars: number;

  /**
   * How many recent messages to preserve verbatim (not compressed).
   * Older messages beyond this count may have their content trimmed.
   */
  recentMessageWindow: number;

  /**
   * Maximum characters for assistant messages outside the recent window.
   * Older assistant responses are truncated to this length.
   */
  maxOldAssistantMsgChars: number;

  /**
   * Maximum total prompt characters before history compression kicks in.
   * Below this threshold, no history compression is applied.
   */
  historyCompressionThreshold: number;
}

const LEVEL_DEFAULTS: Record<CompressionLevel, Omit<CompressionConfig, "level">> = {
  off: {
    maxToolOutputChars: Infinity,
    recentMessageWindow: Infinity,
    maxOldAssistantMsgChars: Infinity,
    historyCompressionThreshold: Infinity,
  },
  light: {
    maxToolOutputChars: 8_000,
    recentMessageWindow: 10,
    maxOldAssistantMsgChars: 2_000,
    historyCompressionThreshold: 40_000,
  },
  standard: {
    maxToolOutputChars: 4_000,
    recentMessageWindow: 6,
    maxOldAssistantMsgChars: 800,
    historyCompressionThreshold: 20_000,
  },
  aggressive: {
    maxToolOutputChars: 1_500,
    recentMessageWindow: 4,
    maxOldAssistantMsgChars: 400,
    historyCompressionThreshold: 10_000,
  },
};

export function buildCompressionConfig(
  level: CompressionLevel = "standard",
  overrides?: Partial<CompressionConfig>,
): CompressionConfig {
  return {
    level,
    ...LEVEL_DEFAULTS[level],
    ...overrides,
  };
}

export const DEFAULT_COMPRESSION_CONFIG = buildCompressionConfig("standard");
