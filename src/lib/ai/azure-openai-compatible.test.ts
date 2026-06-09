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
    mockCreateOpenAICompatible.mockReturnValueOnce(mockFactory as unknown as ReturnType<typeof createOpenAICompatible>);
    const config = { name: "Az", apiKey: "k", baseURL: "https://x.com/deployments/" };
    const provider = createAzureOpenAICompatible(config);
    const result = provider("m", "v");
    expect(result).toBeDefined();
  });
});

describe("createAzureOpenAICompatible — fetch intercept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetch function is called with a URL", async () => {
    const config = {
      name: "Az",
      apiKey: "k",
      baseURL: "https://x.com/deployments/",
    };
    let capturedFetch: ((url: string | Request, init?: RequestInit) => Promise<Response>) | undefined;
    mockCreateOpenAICompatible.mockImplementation((opts) => {
      capturedFetch = opts.fetch as typeof capturedFetch;
      return vi.fn();
    });
    const provider = createAzureOpenAICompatible(config);
    provider("model", "2024-01-01");
    expect(capturedFetch).toBeDefined();
    expect(typeof capturedFetch).toBe("function");
  });

  it("name is preserved in provider config", () => {
    const config = {
      name: "MyAzureProvider",
      apiKey: "k",
      baseURL: "https://x.com/deployments/",
    };
    const provider = createAzureOpenAICompatible(config);
    provider("m", "v");
    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ name: "MyAzureProvider" }),
    );
  });

  it("does not call createOpenAICompatible before the returned function is called", () => {
    const config = { name: "Az", apiKey: "k", baseURL: "https://x.com/" };
    createAzureOpenAICompatible(config);
    expect(mockCreateOpenAICompatible).not.toHaveBeenCalled();
  });

  it("different apiKeys produce different createOpenAICompatible calls", () => {
    const config1 = { name: "Az", apiKey: "key-a", baseURL: "https://x.com/deployments/" };
    const config2 = { name: "Az", apiKey: "key-b", baseURL: "https://x.com/deployments/" };
    createAzureOpenAICompatible(config1)("model", "v");
    createAzureOpenAICompatible(config2)("model", "v");
    const calls = mockCreateOpenAICompatible.mock.calls;
    expect(calls[0][0].apiKey).toBe("key-a");
    expect(calls[1][0].apiKey).toBe("key-b");
  });

  it("api-version is appended as query param via custom fetch", async () => {
    const config = { name: "Az", apiKey: "k", baseURL: "https://x.com/deployments/" };
    let capturedFetch: ((url: string | Request, init?: RequestInit) => Promise<Response>) | undefined;
    mockCreateOpenAICompatible.mockImplementation((opts) => {
      capturedFetch = opts.fetch as typeof capturedFetch;
      return vi.fn();
    });
    createAzureOpenAICompatible(config)("m", "2024-09-01");
    expect(capturedFetch).toBeDefined();
    if (capturedFetch) {
      const globalFetchMock = vi.fn().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", globalFetchMock);
      await capturedFetch("https://example.com/chat", {});
      const calledUrl = String(globalFetchMock.mock.calls[0][0]);
      expect(calledUrl).toContain("api-version=2024-09-01");
      vi.unstubAllGlobals();
    }
  });
});
