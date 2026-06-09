import { describe, it, expect } from "vitest";

vi.mock("server-only", () => ({}));

import { vi } from "vitest";
import { buildCompressionConfig, DEFAULT_COMPRESSION_CONFIG } from "./config";

describe("buildCompressionConfig", () => {
  it("defaults to 'standard' level when no arg given", () => {
    const config = buildCompressionConfig();
    expect(config.level).toBe("standard");
  });

  it("builds config for 'off' level — all limits are Infinity", () => {
    const config = buildCompressionConfig("off");
    expect(config.level).toBe("off");
    expect(config.maxToolOutputChars).toBe(Infinity);
    expect(config.recentMessageWindow).toBe(Infinity);
    expect(config.maxOldAssistantMsgChars).toBe(Infinity);
    expect(config.historyCompressionThreshold).toBe(Infinity);
  });

  it("builds config for 'aggressive' level — tight limits", () => {
    const config = buildCompressionConfig("aggressive");
    expect(config.level).toBe("aggressive");
    expect(config.maxToolOutputChars).toBeLessThan(2000);
    expect(config.recentMessageWindow).toBeLessThan(6);
  });

  it("builds config for 'light' level — loose limits", () => {
    const config = buildCompressionConfig("light");
    expect(config.maxToolOutputChars).toBeGreaterThan(4000);
  });

  it("applies overrides on top of defaults", () => {
    const config = buildCompressionConfig("standard", { maxToolOutputChars: 999 });
    expect(config.maxToolOutputChars).toBe(999);
    expect(config.level).toBe("standard");
  });

  it("aggressive has tighter limits than standard", () => {
    const standard = buildCompressionConfig("standard");
    const aggressive = buildCompressionConfig("aggressive");
    expect(aggressive.maxToolOutputChars).toBeLessThan(standard.maxToolOutputChars);
    expect(aggressive.historyCompressionThreshold).toBeLessThan(standard.historyCompressionThreshold);
  });
});

describe("DEFAULT_COMPRESSION_CONFIG", () => {
  it("is a standard config", () => {
    expect(DEFAULT_COMPRESSION_CONFIG.level).toBe("standard");
    expect(DEFAULT_COMPRESSION_CONFIG.maxToolOutputChars).toBeGreaterThan(0);
    expect(DEFAULT_COMPRESSION_CONFIG.maxToolOutputChars).not.toBe(Infinity);
  });
});
