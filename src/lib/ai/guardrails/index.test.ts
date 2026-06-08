import { describe, it, expect, vi, afterEach } from "vitest";

// ai SDK's LanguageModel is an interface; build a minimal stub.
const makeModel = () => ({
  specificationVersion: "v1" as const,
  provider: "test",
  modelId: "test-model",
  defaultObjectGenerationMode: undefined,
  doGenerate: vi.fn(),
  doStream: vi.fn(),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("wrapWithGuardrails", () => {
  it("returns the same model reference (pass-through stub)", async () => {
    const { wrapWithGuardrails } = await import("./index");
    const model = makeModel() as any;
    const result = wrapWithGuardrails(model, "user-1");
    expect(result).toBe(model);
  });

  it("returns the model unchanged when ASAFE_GUARDRAILS_ENABLED='true'", async () => {
    vi.stubEnv("ASAFE_GUARDRAILS_ENABLED", "true");
    // Re-import to pick up the new env value
    vi.resetModules();
    const { wrapWithGuardrails } = await import("./index");
    const model = makeModel() as any;
    const result = wrapWithGuardrails(model, "user-2");
    expect(result).toBe(model);
  });

  it("returns the model unchanged when ASAFE_GUARDRAILS_ENABLED='false'", async () => {
    vi.stubEnv("ASAFE_GUARDRAILS_ENABLED", "false");
    vi.resetModules();
    const { wrapWithGuardrails } = await import("./index");
    const model = makeModel() as any;
    const result = wrapWithGuardrails(model, "user-3");
    expect(result).toBe(model);
  });
});
