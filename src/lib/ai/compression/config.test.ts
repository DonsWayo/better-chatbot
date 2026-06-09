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

  it("has all required fields defined", () => {
    expect(DEFAULT_COMPRESSION_CONFIG.recentMessageWindow).toBeDefined();
    expect(DEFAULT_COMPRESSION_CONFIG.maxOldAssistantMsgChars).toBeDefined();
    expect(DEFAULT_COMPRESSION_CONFIG.historyCompressionThreshold).toBeDefined();
  });
});

describe("buildCompressionConfig — ordering", () => {
  it("light has looser limits than standard", () => {
    const standard = buildCompressionConfig("standard");
    const light = buildCompressionConfig("light");
    expect(light.maxToolOutputChars).toBeGreaterThan(standard.maxToolOutputChars);
    expect(light.recentMessageWindow).toBeGreaterThan(standard.recentMessageWindow);
  });

  it("all four levels produce distinct maxToolOutputChars", () => {
    const values = (["off", "light", "standard", "aggressive"] as const).map(
      (l) => buildCompressionConfig(l).maxToolOutputChars,
    );
    const unique = new Set(values);
    expect(unique.size).toBe(4);
  });

  it("level field matches the argument passed", () => {
    for (const level of ["off", "light", "standard", "aggressive"] as const) {
      expect(buildCompressionConfig(level).level).toBe(level);
    }
  });

  it("override of recentMessageWindow is respected", () => {
    const config = buildCompressionConfig("aggressive", { recentMessageWindow: 20 });
    expect(config.recentMessageWindow).toBe(20);
    expect(config.level).toBe("aggressive");
  });

  it("aggressive historyCompressionThreshold is tighter than light", () => {
    const light = buildCompressionConfig("light");
    const aggressive = buildCompressionConfig("aggressive");
    expect(aggressive.historyCompressionThreshold).toBeLessThan(light.historyCompressionThreshold);
  });

  it("all fields are finite numbers for non-off levels", () => {
    for (const level of ["light", "standard", "aggressive"] as const) {
      const config = buildCompressionConfig(level);
      expect(Number.isFinite(config.maxToolOutputChars)).toBe(true);
      expect(Number.isFinite(config.recentMessageWindow)).toBe(true);
      expect(Number.isFinite(config.maxOldAssistantMsgChars)).toBe(true);
      expect(Number.isFinite(config.historyCompressionThreshold)).toBe(true);
    }
  });

  it("multiple overrides are all applied", () => {
    const config = buildCompressionConfig("standard", {
      maxToolOutputChars: 111,
      recentMessageWindow: 3,
    });
    expect(config.maxToolOutputChars).toBe(111);
    expect(config.recentMessageWindow).toBe(3);
    expect(config.level).toBe("standard");
  });

  it("off level recentMessageWindow and maxOldAssistantMsgChars are both Infinity", () => {
    const config = buildCompressionConfig("off");
    expect(config.recentMessageWindow).toBe(Infinity);
    expect(config.maxOldAssistantMsgChars).toBe(Infinity);
  });

  it("aggressive maxOldAssistantMsgChars is less than standard", () => {
    const standard = buildCompressionConfig("standard");
    const aggressive = buildCompressionConfig("aggressive");
    expect(aggressive.maxOldAssistantMsgChars).toBeLessThan(standard.maxOldAssistantMsgChars);
  });

  it("partial override does not affect unspecified fields", () => {
    const base = buildCompressionConfig("standard");
    const overridden = buildCompressionConfig("standard", { maxToolOutputChars: 42 });
    expect(overridden.recentMessageWindow).toBe(base.recentMessageWindow);
    expect(overridden.maxOldAssistantMsgChars).toBe(base.maxOldAssistantMsgChars);
    expect(overridden.historyCompressionThreshold).toBe(base.historyCompressionThreshold);
  });

  it("override of historyCompressionThreshold is respected", () => {
    const config = buildCompressionConfig("light", { historyCompressionThreshold: 9999 });
    expect(config.historyCompressionThreshold).toBe(9999);
    expect(config.level).toBe("light");
  });
});
