import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSION } from "./index";

describe("embedding constants", () => {
  it("EMBEDDING_MODEL is a non-empty string", () => {
    expect(typeof EMBEDDING_MODEL).toBe("string");
    expect(EMBEDDING_MODEL.length).toBeGreaterThan(0);
  });

  it("EMBEDDING_DIMENSION is a positive number", () => {
    expect(EMBEDDING_DIMENSION).toBeGreaterThan(0);
    expect(Number.isInteger(EMBEDDING_DIMENSION)).toBe(true);
  });

  it("EMBEDDING_MODEL matches openai/text-embedding-3-small (ADR-0007 pinned)", () => {
    expect(EMBEDDING_MODEL).toBe("openai/text-embedding-3-small");
  });

  it("EMBEDDING_DIMENSION is 1536 (ADR-0007 pinned)", () => {
    expect(EMBEDDING_DIMENSION).toBe(1536);
  });
});

describe("embedText", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("throws when OPENROUTER_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    delete process.env.OPENROUTER_API_KEY;
    const { embedText } = await import("./index");
    await expect(embedText("hello")).rejects.toThrow(/OPENROUTER_API_KEY/i);
  });

  it("throws on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    }) as any;
    const { embedText } = await import("./index");
    await expect(embedText("hello")).rejects.toThrow(/429/);
  });

  it("throws when embedding dimension is wrong", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }), // wrong dimension
    }) as any;
    const { embedText } = await import("./index");
    await expect(embedText("hello")).rejects.toThrow(/dimension/i);
  });

  it("returns embedding array on success", async () => {
    const fakeEmbedding = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.1);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
    }) as any;
    const { embedText } = await import("./index");
    const result = await embedText("test text");
    expect(result).toHaveLength(EMBEDDING_DIMENSION);
    expect(result[0]).toBe(0.1);
  });
});

describe("embedBatch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns empty array for empty input", async () => {
    const { embedBatch } = await import("./index");
    const result = await embedBatch([]);
    expect(result).toEqual([]);
  });

  it("throws when OPENROUTER_API_KEY is not set", async () => {
    vi.unstubAllEnvs();
    delete process.env.OPENROUTER_API_KEY;
    const { embedBatch } = await import("./index");
    await expect(embedBatch(["hello"])).rejects.toThrow(/OPENROUTER_API_KEY/i);
  });

  it("throws on non-ok batch response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    }) as any;
    const { embedBatch } = await import("./index");
    await expect(embedBatch(["a", "b"])).rejects.toThrow(/500/);
  });

  it("returns sorted embeddings for multiple texts", async () => {
    const embed1 = Array.from({ length: EMBEDDING_DIMENSION }, () => 1.0);
    const embed2 = Array.from({ length: EMBEDDING_DIMENSION }, () => 2.0);
    // Return in reverse order to test sorting
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: embed2 },
          { index: 0, embedding: embed1 },
        ],
      }),
    }) as any;
    const { embedBatch } = await import("./index");
    const result = await embedBatch(["text1", "text2"]);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe(1.0);
    expect(result[1][0]).toBe(2.0);
  });
});
