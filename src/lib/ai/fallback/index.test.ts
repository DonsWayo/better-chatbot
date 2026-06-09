import { describe, expect, it, vi, beforeEach } from "vitest";
import { APICallError } from "ai";

vi.mock("server-only", () => ({}));
vi.mock("lib/observability/slo", () => ({
  providerFallbackTotal: { inc: vi.fn() },
}));
vi.mock("ai", async (importOriginal) => {
  const mod = await importOriginal<typeof import("ai")>();
  return {
    ...mod,
    wrapLanguageModel: vi.fn(({ model, middleware }) => ({
      ...model,
      _middleware: middleware,
      // Proxy doGenerate/doStream through the middleware for testing
      async doGenerate(params: unknown) {
        return middleware.wrapGenerate({
          doGenerate: () => model.doGenerate(params),
          doStream: () => model.doStream(params),
          params,
          model,
        });
      },
      async doStream(params: unknown) {
        return middleware.wrapStream({
          doGenerate: () => model.doGenerate(params),
          doStream: () => model.doStream(params),
          params,
          model,
        });
      },
    })),
  };
});

import { isRetryableProviderError, wrapWithFallback, FALLBACK_MODEL_IDS } from "./index";
import { providerFallbackTotal } from "lib/observability/slo";

const mockInc = vi.mocked(providerFallbackTotal.inc);

function makeModel(id: string, provider = "openrouter") {
  return {
    specificationVersion: "v2" as const,
    provider,
    modelId: id,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
    supportedUrls: {},
    defaultObjectGenerationMode: undefined,
    supportsImageUrls: undefined,
    supportsStructuredOutputs: undefined,
  };
}

function make5xxError(status: number) {
  return new APICallError({
    message: `Provider error ${status}`,
    url: "https://openrouter.ai/api/v1/chat/completions",
    requestBodyValues: {},
    statusCode: status,
    responseHeaders: {},
    responseBody: "",
    isRetryable: true,
  });
}

function make4xxError(status: number) {
  return new APICallError({
    message: `Client error ${status}`,
    url: "https://openrouter.ai/api/v1/chat/completions",
    requestBodyValues: {},
    statusCode: status,
    responseHeaders: {},
    responseBody: "",
    isRetryable: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isRetryableProviderError", () => {
  it("returns true for APICallError with no statusCode (network failure)", () => {
    const err = new APICallError({
      message: "Network failure",
      url: "https://api.example.com",
      requestBodyValues: {},
      statusCode: undefined,
      responseHeaders: {},
      responseBody: "",
      isRetryable: true,
    });
    expect(isRetryableProviderError(err)).toBe(true);
  });

  it.each([500, 502, 503, 504])("returns true for %d server error", (status) => {
    expect(isRetryableProviderError(make5xxError(status))).toBe(true);
  });

  it("returns true for 408 timeout", () => {
    expect(isRetryableProviderError(make4xxError(408))).toBe(true);
  });

  it.each([400, 401, 403, 422])("returns false for %d client error", (status) => {
    expect(isRetryableProviderError(make4xxError(status))).toBe(false);
  });

  it("returns true for ECONNREFUSED", () => {
    expect(isRetryableProviderError(new Error("connect ECONNREFUSED 127.0.0.1:80"))).toBe(true);
  });

  it("returns true for ETIMEDOUT", () => {
    expect(isRetryableProviderError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("returns true for ECONNRESET", () => {
    expect(isRetryableProviderError(new Error("ECONNRESET"))).toBe(true);
  });

  it("returns true for ENOTFOUND", () => {
    expect(isRetryableProviderError(new Error("getaddrinfo ENOTFOUND api.example.com"))).toBe(true);
  });

  it("returns false for non-Error values", () => {
    expect(isRetryableProviderError("string error")).toBe(false);
    expect(isRetryableProviderError(null)).toBe(false);
    expect(isRetryableProviderError(42)).toBe(false);
  });
});

describe("wrapWithFallback — doGenerate", () => {
  it("returns primary result when primary succeeds", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    primary.doGenerate.mockResolvedValue({ text: "primary answer" });

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    const result = await (wrapped as unknown as typeof primary).doGenerate({});

    expect(result).toEqual({ text: "primary answer" });
    expect(fallback.doGenerate).not.toHaveBeenCalled();
    expect(mockInc).not.toHaveBeenCalled();
  });

  it("falls back to first fallback on 500", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    primary.doGenerate.mockRejectedValue(make5xxError(500));
    fallback.doGenerate.mockResolvedValue({ text: "fallback answer" });

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    const result = await (wrapped as unknown as typeof primary).doGenerate({});

    expect(result).toEqual({ text: "fallback answer" });
    expect(mockInc).toHaveBeenCalledOnce();
    expect(mockInc).toHaveBeenCalledWith({
      primary_provider: "openrouter",
      fallback_provider: "openrouter",
      fallback_model: "gemini-2.5-flash",
    });
  });

  it("tries second fallback when first also fails", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback1 = makeModel("gemini-2.5-flash");
    const fallback2 = makeModel("gemini-2.5-flash-lite");
    primary.doGenerate.mockRejectedValue(make5xxError(503));
    fallback1.doGenerate.mockRejectedValue(make5xxError(503));
    fallback2.doGenerate.mockResolvedValue({ text: "second fallback" });

    const wrapped = wrapWithFallback(primary as never, [
      fallback1 as never,
      fallback2 as never,
    ]);
    const result = await (wrapped as unknown as typeof primary).doGenerate({});

    expect(result).toEqual({ text: "second fallback" });
    expect(mockInc).toHaveBeenCalledTimes(2);
  });

  it("re-throws original error when all fallbacks fail", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    const primaryErr = make5xxError(503);
    primary.doGenerate.mockRejectedValue(primaryErr);
    fallback.doGenerate.mockRejectedValue(make5xxError(503));

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    await expect(
      (wrapped as unknown as typeof primary).doGenerate({}),
    ).rejects.toBe(primaryErr);
  });

  it("does NOT fall back on 4xx client errors", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    primary.doGenerate.mockRejectedValue(make4xxError(400));

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    await expect(
      (wrapped as unknown as typeof primary).doGenerate({}),
    ).rejects.toBeInstanceOf(APICallError);
    expect(fallback.doGenerate).not.toHaveBeenCalled();
  });

  it("returns model unchanged when no fallbacks provided", () => {
    const primary = makeModel("gpt-5.1");
    const result = wrapWithFallback(primary as never, []);
    expect(result).toBe(primary);
  });
});

describe("wrapWithFallback — doStream", () => {
  it("returns primary stream when primary succeeds", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    const stream = { stream: "primary-stream" };
    primary.doStream.mockResolvedValue(stream);

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    const result = await (wrapped as unknown as typeof primary).doStream({});

    expect(result).toBe(stream);
    expect(fallback.doStream).not.toHaveBeenCalled();
  });

  it("falls back to first fallback on 502", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    const fallbackStream = { stream: "fallback-stream" };
    primary.doStream.mockRejectedValue(make5xxError(502));
    fallback.doStream.mockResolvedValue(fallbackStream);

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    const result = await (wrapped as unknown as typeof primary).doStream({});

    expect(result).toBe(fallbackStream);
    expect(mockInc).toHaveBeenCalledOnce();
  });

  it("does NOT fall back on 401 auth error", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    primary.doStream.mockRejectedValue(make4xxError(401));

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    await expect(
      (wrapped as unknown as typeof primary).doStream({}),
    ).rejects.toBeInstanceOf(APICallError);
    expect(fallback.doStream).not.toHaveBeenCalled();
  });

  it("re-throws when all fallbacks exhausted in stream", async () => {
    const primary = makeModel("gpt-5.1");
    const fallback = makeModel("gemini-2.5-flash");
    const originalErr = make5xxError(503);
    primary.doStream.mockRejectedValue(originalErr);
    fallback.doStream.mockRejectedValue(make5xxError(503));

    const wrapped = wrapWithFallback(primary as never, [fallback as never]);
    await expect(
      (wrapped as unknown as typeof primary).doStream({}),
    ).rejects.toBe(originalErr);
  });
});

describe("FALLBACK_MODEL_IDS", () => {
  it("starts with gemini-2.5-flash (cheapest reliable)", () => {
    expect(FALLBACK_MODEL_IDS[0]).toBe("gemini-2.5-flash");
  });

  it("contains all approved models", () => {
    expect(FALLBACK_MODEL_IDS).toContain("gemini-2.5-flash-lite");
    expect(FALLBACK_MODEL_IDS).toContain("gpt-5.1");
    expect(FALLBACK_MODEL_IDS).toContain("claude-opus-4.8");
  });
});

describe("FALLBACK_MODEL_IDS — invariants", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(FALLBACK_MODEL_IDS)).toBe(true);
    expect(FALLBACK_MODEL_IDS.length).toBeGreaterThan(0);
  });

  it("all entries are non-empty strings", () => {
    for (const id of FALLBACK_MODEL_IDS) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate entries", () => {
    const unique = new Set(FALLBACK_MODEL_IDS);
    expect(unique.size).toBe(FALLBACK_MODEL_IDS.length);
  });

  it("contains at least 3 model IDs", () => {
    expect(FALLBACK_MODEL_IDS.length).toBeGreaterThanOrEqual(3);
  });
});
