import { describe, it, expect } from "vitest";
import { RandomDataGeneratorExample, WeatherExample } from "./example";
import { DefaultToolName } from "lib/ai/tools";

describe("RandomDataGeneratorExample", () => {
  it("has a name", () => {
    expect(typeof RandomDataGeneratorExample.name).toBe("string");
    expect(RandomDataGeneratorExample.name!.length).toBeGreaterThan(0);
  });

  it("has a description", () => {
    expect(typeof RandomDataGeneratorExample.description).toBe("string");
  });

  it("has an emoji icon", () => {
    expect(RandomDataGeneratorExample.icon?.type).toBe("emoji");
    expect(typeof RandomDataGeneratorExample.icon?.value).toBe("string");
  });

  it("has instructions with a role", () => {
    expect(typeof RandomDataGeneratorExample.instructions?.role).toBe("string");
  });

  it("has a non-empty systemPrompt", () => {
    expect(typeof RandomDataGeneratorExample.instructions?.systemPrompt).toBe("string");
    expect(RandomDataGeneratorExample.instructions!.systemPrompt!.length).toBeGreaterThan(10);
  });

  it("includes JavascriptExecution in mentions", () => {
    const mentions = RandomDataGeneratorExample.instructions?.mentions ?? [];
    const hasJs = mentions.some(
      (m) => m.type === "defaultTool" && m.name === DefaultToolName.JavascriptExecution,
    );
    expect(hasJs).toBe(true);
  });

  it("includes CreateTable in mentions", () => {
    const mentions = RandomDataGeneratorExample.instructions?.mentions ?? [];
    const hasTable = mentions.some(
      (m) => m.type === "defaultTool" && m.name === DefaultToolName.CreateTable,
    );
    expect(hasTable).toBe(true);
  });
});

describe("WeatherExample", () => {
  it("has a name", () => {
    expect(typeof WeatherExample.name).toBe("string");
    expect(WeatherExample.name!.length).toBeGreaterThan(0);
  });

  it("has a description", () => {
    expect(typeof WeatherExample.description).toBe("string");
  });

  it("has an emoji icon", () => {
    expect(WeatherExample.icon?.type).toBe("emoji");
  });

  it("has instructions with a role", () => {
    expect(typeof WeatherExample.instructions?.role).toBe("string");
  });

  it("includes Http tool in mentions", () => {
    const mentions = WeatherExample.instructions?.mentions ?? [];
    const hasHttp = mentions.some(
      (m) => m.type === "defaultTool" && m.name === DefaultToolName.Http,
    );
    expect(hasHttp).toBe(true);
  });

  it("systemPrompt mentions Open-Meteo API", () => {
    const prompt = WeatherExample.instructions?.systemPrompt ?? "";
    expect(prompt).toContain("open-meteo");
  });

  it("has a non-empty systemPrompt", () => {
    const prompt = WeatherExample.instructions?.systemPrompt ?? "";
    expect(prompt.length).toBeGreaterThan(10);
  });
});

describe("example agents — shared invariants", () => {
  it("both examples have names", () => {
    expect(RandomDataGeneratorExample.name).toBeTruthy();
    expect(WeatherExample.name).toBeTruthy();
  });

  it("both examples have different names", () => {
    expect(RandomDataGeneratorExample.name).not.toBe(WeatherExample.name);
  });

  it("both examples have emoji icons", () => {
    expect(RandomDataGeneratorExample.icon?.type).toBe("emoji");
    expect(WeatherExample.icon?.type).toBe("emoji");
  });

  it("both examples have systemPrompts", () => {
    expect(RandomDataGeneratorExample.instructions?.systemPrompt?.length ?? 0).toBeGreaterThan(0);
    expect(WeatherExample.instructions?.systemPrompt?.length ?? 0).toBeGreaterThan(0);
  });

  it("both examples have at least one mention", () => {
    expect((RandomDataGeneratorExample.instructions?.mentions ?? []).length).toBeGreaterThan(0);
    expect((WeatherExample.instructions?.mentions ?? []).length).toBeGreaterThan(0);
  });

  it("both examples have non-empty roles", () => {
    expect((RandomDataGeneratorExample.instructions?.role ?? "").length).toBeGreaterThan(0);
    expect((WeatherExample.instructions?.role ?? "").length).toBeGreaterThan(0);
  });

  it("all mentions have a type and name field", () => {
    const allMentions = [
      ...(RandomDataGeneratorExample.instructions?.mentions ?? []),
      ...(WeatherExample.instructions?.mentions ?? []),
    ];
    for (const mention of allMentions) {
      expect(typeof mention.type).toBe("string");
      expect(typeof mention.name).toBe("string");
    }
  });

  it("both examples have different system prompts", () => {
    expect(RandomDataGeneratorExample.instructions?.systemPrompt).not.toBe(
      WeatherExample.instructions?.systemPrompt,
    );
  });
});
