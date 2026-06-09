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
});

describe("createAzureOpenAICompatible — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls createOpenAICompatible exactly once per invocation", () => {
    const config = {
      name: "Az",
      apiKey: "k",
      baseURL: "https://x.com/deployments/",
    };
    const provider = createAzureOpenAICompatible(config);
    provider("model-a", "2024-01-01");
    expect(mockCreateOpenAICompatible).toHaveBeenCalledTimes(1);
  });

  it("each call with a different deployment creates a new provider", () => {
    const config = {
      name: "Az",
      apiKey: "k",
      baseURL: "https://x.com/deployments/",
    };
    const provider = createAzureOpenAICompatible(config);
    provider("model-a", "2024-01-01");
    provider("model-b", "2024-02-01");
    expect(mockCreateOpenAICompatible).toHaveBeenCalledTimes(2);
  });

  it("passes apiKey unchanged to underlying provider", () => {
    const config = {
      name: "Az",
      apiKey: "my-secret-key",
      baseURL: "https://x.com/deployments/",
    };
    const provider = createAzureOpenAICompatible(config);
    provider("m", "2024-01-01");
    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "my-secret-key" }),
    );
  });

  it("appends deployment name to baseURL", () => {
    const config = {
      name: "Az",
      apiKey: "k",
      baseURL: "https://host.com/openai/deployments/",
    };
    const provider = createAzureOpenAICompatible(config);
    provider("gpt-4o-mini", "2024-09-01");
    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://host.com/openai/deployments/gpt-4o-mini",
      }),
    );
  });
});

describe("createAzureOpenAICompatible — return type invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a function", () => {
    const config = { name: "Az", apiKey: "k", baseURL: "https://x.com/" };
    expect(typeof createAzureOpenAICompatible(config)).toBe("function");
  });

  it("calling the returned function returns something defined", () => {
    const mockModel = { id: "az-model" };
    const mockFactory = vi.fn().mockReturnValue(mockModel);
    mockCreateOpenAICompatible.mockReturnValueOnce(mockFactory as any);
    const config = { name: "Az", apiKey: "k", baseURL: "https://x.com/deployments/" };
    const provider = createAzureOpenAICompatible(config);
    const result = provider("m", "v");
    expect(result).toBeDefined();
  });
});
