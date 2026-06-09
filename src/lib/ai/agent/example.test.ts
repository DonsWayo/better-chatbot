import { describe, it, expect } from "vitest";
import { RandomDataGeneratorExample, WeatherExample } from "./example";
import { DefaultToolName } from "lib/ai/tools";

describe("RandomDataGeneratorExample", () => {
  it("is defined", () => {
    expect(RandomDataGeneratorExample).toBeDefined();
  });

  it("has a name", () => {
    expect(typeof RandomDataGeneratorExample.name).toBe("string");
    expect(RandomDataGeneratorExample.name!.length).toBeGreaterThan(0);
  });

  it("has a description", () => {
    expect(typeof RandomDataGeneratorExample.description).toBe("string");
    expect(RandomDataGeneratorExample.description!.length).toBeGreaterThan(0);
  });

  it("has an icon", () => {
    expect(RandomDataGeneratorExample.icon).toBeDefined();
    expect(RandomDataGeneratorExample.icon!.type).toBe("emoji");
  });

  it("has instructions with systemPrompt", () => {
    expect(typeof RandomDataGeneratorExample.instructions?.systemPrompt).toBe("string");
    expect(RandomDataGeneratorExample.instructions!.systemPrompt.length).toBeGreaterThan(0);
  });

  it("mentions JavascriptExecution tool", () => {
    const mentions = RandomDataGeneratorExample.instructions?.mentions ?? [];
    const names = mentions.map((m) => m.name);
    expect(names).toContain(DefaultToolName.JavascriptExecution);
  });

  it("mentions CreateTable tool", () => {
    const mentions = RandomDataGeneratorExample.instructions?.mentions ?? [];
    const names = mentions.map((m) => m.name);
    expect(names).toContain(DefaultToolName.CreateTable);
  });

  it("mentions have type defaultTool", () => {
    const mentions = RandomDataGeneratorExample.instructions?.mentions ?? [];
    for (const m of mentions) {
      expect(m.type).toBe("defaultTool");
    }
  });

  it("systemPrompt includes data generation guidance", () => {
    const sp = RandomDataGeneratorExample.instructions!.systemPrompt;
    expect(sp.toLowerCase()).toMatch(/generat|data|table/);
  });
});

describe("WeatherExample", () => {
  it("is defined", () => {
    expect(WeatherExample).toBeDefined();
  });

  it("has a name", () => {
    expect(typeof WeatherExample.name).toBe("string");
    expect(WeatherExample.name!.length).toBeGreaterThan(0);
  });

  it("has a description", () => {
    expect(typeof WeatherExample.description).toBe("string");
    expect(WeatherExample.description!.length).toBeGreaterThan(0);
  });

  it("has an icon", () => {
    expect(WeatherExample.icon).toBeDefined();
    expect(WeatherExample.icon!.type).toBe("emoji");
  });

  it("has instructions with systemPrompt", () => {
    expect(typeof WeatherExample.instructions?.systemPrompt).toBe("string");
    expect(WeatherExample.instructions!.systemPrompt.length).toBeGreaterThan(0);
  });

  it("mentions the Http tool", () => {
    const mentions = WeatherExample.instructions?.mentions ?? [];
    const names = mentions.map((m) => m.name);
    expect(names).toContain(DefaultToolName.Http);
  });

  it("mention type is defaultTool", () => {
    const mentions = WeatherExample.instructions?.mentions ?? [];
    for (const m of mentions) {
      expect(m.type).toBe("defaultTool");
    }
  });

  it("systemPrompt references weather or HTTP", () => {
    const sp = WeatherExample.instructions!.systemPrompt;
    expect(sp.toLowerCase()).toMatch(/weather|http|api/);
  });
});
