import { describe, it, expect } from "vitest";
import { EVAL_FIXTURES } from "./fixtures";
import { LONG_CONTEXT_CHARS } from "../policy";

const ALL_TASK_CLASSES = [
  "code",
  "reasoning",
  "long_context",
  "vision",
  "tool_use",
  "quick_rewrite",
  "general",
] as const;

describe("EVAL_FIXTURES", () => {
  it("has at least one fixture per task class", () => {
    for (const cls of ALL_TASK_CLASSES) {
      const matching = EVAL_FIXTURES.filter((f) => f.name.startsWith(`${cls}/`));
      expect(matching.length, `no fixture for task class: ${cls}`).toBeGreaterThan(0);
    }
  });

  it("has 12 total fixtures covering all task classes", () => {
    expect(EVAL_FIXTURES.length).toBeGreaterThanOrEqual(12);
  });

  it("each fixture has a name and non-empty text", () => {
    for (const fixture of EVAL_FIXTURES) {
      expect(typeof fixture.name).toBe("string");
      expect(fixture.name.length).toBeGreaterThan(0);
      expect(fixture.request.text.length).toBeGreaterThan(0);
    }
  });

  it("all names are unique", () => {
    const names = EVAL_FIXTURES.map((f) => f.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("names follow task_class/scenario format", () => {
    for (const fixture of EVAL_FIXTURES) {
      expect(fixture.name, `bad name format: ${fixture.name}`).toMatch(/^\w+\/\w[\w-]*$/);
    }
  });

  it("vision fixtures have hasImage:true", () => {
    const visionFixtures = EVAL_FIXTURES.filter((f) => f.name.startsWith("vision/"));
    for (const f of visionFixtures) {
      expect(f.request.hasImage, `${f.name} missing hasImage`).toBe(true);
    }
  });

  it("tool_use fixtures have hasTools:true", () => {
    const toolFixtures = EVAL_FIXTURES.filter((f) => f.name.startsWith("tool_use/"));
    for (const f of toolFixtures) {
      expect(f.request.hasTools, `${f.name} missing hasTools`).toBe(true);
    }
  });

  it("long_context fixtures have totalChars > LONG_CONTEXT_CHARS threshold", () => {
    const lcFixtures = EVAL_FIXTURES.filter((f) => f.name.startsWith("long_context/"));
    for (const f of lcFixtures) {
      expect(f.request.totalChars ?? 0, `${f.name} needs totalChars`).toBeGreaterThan(LONG_CONTEXT_CHARS);
    }
  });

  it("non-vision fixtures do not have hasImage:true", () => {
    const nonVision = EVAL_FIXTURES.filter((f) => !f.name.startsWith("vision/"));
    for (const f of nonVision) {
      expect(f.request.hasImage, `${f.name} should not have hasImage`).toBeFalsy();
    }
  });

  it("non-tool_use fixtures do not have hasTools:true", () => {
    const nonTool = EVAL_FIXTURES.filter((f) => !f.name.startsWith("tool_use/"));
    for (const f of nonTool) {
      expect(f.request.hasTools, `${f.name} should not have hasTools`).toBeFalsy();
    }
  });

  it("all fixture texts are unique", () => {
    const texts = EVAL_FIXTURES.map((f) => f.request.text);
    const unique = new Set(texts);
    expect(unique.size).toBe(texts.length);
  });

  it("code class has at least 2 fixtures", () => {
    expect(EVAL_FIXTURES.filter((f) => f.name.startsWith("code/")).length).toBeGreaterThanOrEqual(2);
  });

  it("reasoning class has at least 2 fixtures", () => {
    expect(EVAL_FIXTURES.filter((f) => f.name.startsWith("reasoning/")).length).toBeGreaterThanOrEqual(2);
  });

  it("each fixture name prefix is one of the known task classes", () => {
    const knownClasses = new Set(ALL_TASK_CLASSES as readonly string[]);
    for (const f of EVAL_FIXTURES) {
      const prefix = f.name.split("/")[0];
      expect(knownClasses.has(prefix), `unknown task class in fixture: ${f.name}`).toBe(true);
    }
  });
});
