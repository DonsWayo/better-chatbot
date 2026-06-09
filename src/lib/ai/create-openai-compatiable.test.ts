import { describe, it, expect, vi } from "vitest";
import {
  createOpenAICompatibleModels,
  type OpenAICompatibleProvider,
} from "./create-openai-compatiable";

// Mock the @ai-sdk/openai-compatible module
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() =>
    vi.fn((apiName: string) => ({ apiName })),
  ),
}));

describe("createOpenAICompatibleModels", () => {
  it("should return empty providers and unsupportedModels when config is empty", () => {
    const result = createOpenAICompatibleModels([]);

    expect(result.providers).toEqual({});
    expect(result.unsupportedModels.size).toBe(0);
  });

  it("should return empty providers and unsupportedModels when config is undefined", () => {
    const result = createOpenAICompatibleModels(undefined as any);

    expect(result.providers).toEqual({});
    expect(result.unsupportedModels.size).toBe(0);
  });

  it("should create providers and models correctly", () => {
    const mockConfig: OpenAICompatibleProvider[] = [
      {
        provider: "test-provider",
        apiKey: "TEST_API_KEY",
        baseUrl: "https://api.test.com/v1",
        models: [
          {
            apiName: "test-model-1",
            uiName: "Test Model 1",
            supportsTools: true,
          },
          {
            apiName: "test-model-2",
            uiName: "Test Model 2",
            supportsTools: false,
          },
        ],
      },
    ];

    const result = createOpenAICompatibleModels(mockConfig);

    expect(result.providers).toHaveProperty("test-provider");
    expect(result.providers["test-provider"]).toHaveProperty("Test Model 1");
    expect(result.providers["test-provider"]).toHaveProperty("Test Model 2");
    expect(result.unsupportedModels.size).toBe(1);
  });

  it("should handle multiple providers", () => {
    const mockConfig: OpenAICompatibleProvider[] = [
      {
        provider: "provider-1",
        apiKey: "API_KEY_1",
        baseUrl: "https://api1.test.com/v1",
        models: [
          {
            apiName: "model-1",
            uiName: "Model 1",
            supportsTools: true,
          },
        ],
      },
      {
        provider: "provider-2",
        apiKey: "API_KEY_2",
        baseUrl: "https://api2.test.com/v1",
        models: [
          {
            apiName: "model-2",
            uiName: "Model 2",
            supportsTools: false,
          },
        ],
      },
    ];

    const result = createOpenAICompatibleModels(mockConfig);

    expect(result.providers).toHaveProperty("provider-1");
    expect(result.providers).toHaveProperty("provider-2");
    expect(result.providers["provider-1"]).toHaveProperty("Model 1");
    expect(result.providers["provider-2"]).toHaveProperty("Model 2");
    expect(result.unsupportedModels.size).toBe(1);
  });

  it("should track unsupported models correctly", () => {
    const mockConfig: OpenAICompatibleProvider[] = [
      {
        provider: "test-provider",
        apiKey: "TEST_API_KEY",
        baseUrl: "https://api.test.com/v1",
        models: [
          {
            apiName: "supported-model",
            uiName: "Supported Model",
            supportsTools: true,
          },
          {
            apiName: "unsupported-model-1",
            uiName: "Unsupported Model 1",
            supportsTools: false,
          },
          {
            apiName: "unsupported-model-2",
            uiName: "Unsupported Model 2",
            supportsTools: false,
          },
        ],
      },
    ];

    const result = createOpenAICompatibleModels(mockConfig);

    expect(result.providers["test-provider"]).toHaveProperty("Supported Model");
    expect(result.providers["test-provider"]).toHaveProperty(
      "Unsupported Model 1",
    );
    expect(result.providers["test-provider"]).toHaveProperty(
      "Unsupported Model 2",
    );
    expect(result.unsupportedModels.size).toBe(2);
  });

  it("should handle Azure OpenAI models with apiVersion parameter", () => {
    const mockConfig: OpenAICompatibleProvider[] = [
      {
        provider: "Azure OpenAI",
        apiKey: "azure-key",
        baseUrl: "https://test.openai.azure.com/openai/deployments/",
        models: [
          {
            apiName: "gpt-4o",
            uiName: "GPT-4o (Azure)",
            supportsTools: true,
            apiVersion: "2025-01-01-preview",
          },
          {
            apiName: "gpt-35-turbo",
            uiName: "GPT-3.5 Turbo (Azure)",
            supportsTools: true, // Changed to true to avoid unsupported models
            apiVersion: "2024-02-01",
          },
        ],
      },
    ];

    const result = createOpenAICompatibleModels(mockConfig);

    expect(result.providers).toHaveProperty("Azure OpenAI");
    expect(result.providers["Azure OpenAI"]).toHaveProperty("GPT-4o (Azure)");
    expect(result.providers["Azure OpenAI"]).toHaveProperty(
      "GPT-3.5 Turbo (Azure)",
    );
    expect(result.unsupportedModels.size).toBe(0);
  });

  it("should validate apiVersion is optional for non-Azure providers", () => {
    const mockConfig: OpenAICompatibleProvider[] = [
      {
        provider: "OpenAI",
        apiKey: "openai-key",
        baseUrl: "https://api.openai.com/v1",
        models: [
          {
            apiName: "gpt-4",
            uiName: "GPT-4",
            supportsTools: true,
            // No apiVersion - should still work
          },
        ],
      },
    ];

    const result = createOpenAICompatibleModels(mockConfig);

    expect(result.providers).toHaveProperty("OpenAI");
    expect(result.providers["OpenAI"]).toHaveProperty("GPT-4");
    expect(result.unsupportedModels.size).toBe(0);
  });
});

describe("createOpenAICompatibleModels — additional", () => {
  it("providers object is empty for empty models array", () => {
    const result = createOpenAICompatibleModels([
      { provider: "empty-provider", apiKey: "k", baseUrl: "http://x", models: [] },
    ]);
    expect(result.providers["empty-provider"]).toEqual({});
    expect(result.unsupportedModels.size).toBe(0);
  });

  it("all-tools-supported models produce zero unsupportedModels", () => {
    const result = createOpenAICompatibleModels([
      {
        provider: "prov",
        apiKey: "k",
        baseUrl: "http://x",
        models: [
          { apiName: "m1", uiName: "M1", supportsTools: true },
          { apiName: "m2", uiName: "M2", supportsTools: true },
        ],
      },
    ]);
    expect(result.unsupportedModels.size).toBe(0);
  });

  it("all-no-tools models add all to unsupportedModels", () => {
    const result = createOpenAICompatibleModels([
      {
        provider: "prov",
        apiKey: "k",
        baseUrl: "http://x",
        models: [
          { apiName: "m1", uiName: "M1", supportsTools: false },
          { apiName: "m2", uiName: "M2", supportsTools: false },
        ],
      },
    ]);
    expect(result.unsupportedModels.size).toBe(2);
  });

  it("returns providers with correct provider name as key", () => {
    const result = createOpenAICompatibleModels([
      {
        provider: "my-special-provider",
        apiKey: "k",
        baseUrl: "http://x",
        models: [{ apiName: "m", uiName: "M", supportsTools: true }],
      },
    ]);
    expect(Object.keys(result.providers)).toContain("my-special-provider");
  });

  it("unsupportedModels is a Set", () => {
    const result = createOpenAICompatibleModels([]);
    expect(result.unsupportedModels).toBeInstanceOf(Set);
  });
});

describe("createOpenAICompatibleModels — response invariants", () => {
  it("providers is always a non-null object", () => {
    const result = createOpenAICompatibleModels([]);
    expect(typeof result.providers).toBe("object");
    expect(result.providers).not.toBeNull();
  });

  it("result has exactly two top-level keys", () => {
    const result = createOpenAICompatibleModels([]);
    const keys = Object.keys(result);
    expect(keys).toContain("providers");
    expect(keys).toContain("unsupportedModels");
  });

  it("provider count equals input config length", () => {
    const result = createOpenAICompatibleModels([
      { provider: "p1", apiKey: "k1", baseUrl: "http://a", models: [] },
      { provider: "p2", apiKey: "k2", baseUrl: "http://b", models: [] },
    ]);
    expect(Object.keys(result.providers)).toHaveLength(2);
  });

  it("unsupportedModels contains apiNames with supportsTools=false", () => {
    const result = createOpenAICompatibleModels([
      {
        provider: "prov",
        apiKey: "k",
        baseUrl: "http://x",
        models: [
          { apiName: "tool-model", uiName: "T", supportsTools: true },
          { apiName: "no-tool-model", uiName: "N", supportsTools: false },
        ],
      },
    ]);
    expect(result.unsupportedModels.has("no-tool-model")).toBe(true);
    expect(result.unsupportedModels.has("tool-model")).toBe(false);
  });
});
