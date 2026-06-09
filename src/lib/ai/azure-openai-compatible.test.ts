import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @ai-sdk/openai-compatible module before importing
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => vi.fn()),
}));

import { createAzureOpenAICompatible } from "./azure-openai-compatible";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const mockCreateOpenAICompatible = vi.mocked(createOpenAICompatible);

describe("createAzureOpenAICompatible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create Azure OpenAI provider with correct configuration", () => {
    const config = {
      name: "Azure OpenAI",
      apiKey: "test-api-key",
      baseURL: "https://test.openai.azure.com/openai/deployments/",
    };

    const azureProvider = createAzureOpenAICompatible(config);
    azureProvider("gpt-4o", "2025-01-01-preview");

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      name: "Azure OpenAI",
      apiKey: "test-api-key",
      baseURL: "https://test.openai.azure.com/openai/deployments/gpt-4o",
      fetch: expect.any(Function),
    });
  });

  it("should construct correct Azure URL with deployment name", () => {
    const config = {
      name: "Azure OpenAI",
      apiKey: "test-key",
      baseURL: "https://myresource.openai.azure.com/openai/deployments/",
    };

    const azureProvider = createAzureOpenAICompatible(config);
    azureProvider("my-deployment", "2024-02-01");

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL:
          "https://myresource.openai.azure.com/openai/deployments/my-deployment",
      }),
    );
  });

  it("should include custom fetch function in configuration", () => {
    const config = {
      name: "Azure OpenAI",
      apiKey: "test-key",
      baseURL: "https://test.openai.azure.com/openai/deployments/",
    };

    const azureProvider = createAzureOpenAICompatible(config);
    azureProvider("gpt-4", "2025-01-01-preview");

    // Verify that createOpenAICompatible was called with a fetch function
    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function),
      }),
    );
  });

  it("should call createOpenAICompatible with provider function", () => {
    const config = {
      name: "Azure OpenAI",
      apiKey: "test-key",
      baseURL: "https://test.openai.azure.com/openai/deployments/",
    };

    const azureProvider = createAzureOpenAICompatible(config);
    azureProvider("gpt-4", "2025-01-01-preview");

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Azure OpenAI",
        apiKey: "test-key",
        baseURL: "https://test.openai.azure.com/openai/deployments/gpt-4",
        fetch: expect.any(Function),
      }),
    );
  });

  it("createAzureOpenAICompatible returns a function", () => {
    const config = {
      name: "Azure OpenAI",
      apiKey: "key",
      baseURL: "https://example.azure.com/openai/deployments/",
    };
    const result = createAzureOpenAICompatible(config);
    expect(typeof result).toBe("function");
  });

  it("two different deployment names produce two different base URLs", () => {
    const config = {
      name: "Azure",
      apiKey: "k",
      baseURL: "https://base.azure.com/deployments/",
    };
    const provider = createAzureOpenAICompatible(config);
    provider("model-a", "2024-01-01");
    const firstCall = mockCreateOpenAICompatible.mock.calls[0][0];
    mockCreateOpenAICompatible.mockClear();
    provider("model-b", "2024-01-01");
    const secondCall = mockCreateOpenAICompatible.mock.calls[0][0];
    expect((firstCall as any).baseURL).toContain("model-a");
    expect((secondCall as any).baseURL).toContain("model-b");
    expect((firstCall as any).baseURL).not.toBe((secondCall as any).baseURL);
  });

  it("passes apiKey unchanged to createOpenAICompatible", () => {
    const secretKey = "super-secret-key-abc123";
    const provider = createAzureOpenAICompatible({
      name: "Azure",
      apiKey: secretKey,
      baseURL: "https://base.com/",
    });
    provider("model", "2024");
    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: secretKey }),
    );
  });
});
