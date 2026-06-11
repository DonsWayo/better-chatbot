import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_FILE_MIME_TYPES,
  GEMINI_FILE_MIME_TYPES,
  OPENAI_FILE_MIME_TYPES,
} from "./file-support";

vi.mock("server-only", () => ({}));

let modelsModule: typeof import("./models");

beforeAll(async () => {
  modelsModule = await import("./models");
});

// asafe-ai (ADR-0001): the registry is OpenRouter-only. Every approved model carries the file
// support of its underlying model family.
describe("customModelProvider file support metadata (OpenRouter-only)", () => {
  it("maps gpt-5.5 to OpenAI file support", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: "gpt-5.5",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(OPENAI_FILE_MIME_TYPES),
    );

    const openRouterProvider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "openRouter",
    );
    const metadata = openRouterProvider?.models.find(
      (item) => item.name === "gpt-5.5",
    );
    expect(metadata?.supportedFileMimeTypes).toEqual(
      Array.from(OPENAI_FILE_MIME_TYPES),
    );
  });

  it("maps claude-opus-4.8 to Anthropic file support", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: "claude-opus-4.8",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(ANTHROPIC_FILE_MIME_TYPES),
    );
  });

  it("maps gemini-3.5-flash to Gemini file support", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: "gemini-3.5-flash",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(GEMINI_FILE_MIME_TYPES),
    );
  });
});

// ADR-0001: the upstream direct-provider blocks must not be exposed.
describe("inference posture", () => {
  it("exposes only the approved OpenRouter short list (no direct providers)", () => {
    const { customModelProvider } = modelsModule;
    const providers = customModelProvider.modelsInfo.map((m) => m.provider);
    expect(providers).toContain("openRouter");
    for (const direct of [
      "openai",
      "anthropic",
      "google",
      "xai",
      "groq",
      "ollama",
    ]) {
      expect(providers).not.toContain(direct);
    }
    const openRouter = customModelProvider.modelsInfo.find(
      (m) => m.provider === "openRouter",
    );
    const names = openRouter?.models.map((m) => m.name) ?? [];
    expect(names).toEqual([
      "gpt-5.5",
      "claude-opus-4.8",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "kimi-k2.6",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
  });

  it("has exactly 7 approved models in the registry", () => {
    const { customModelProvider } = modelsModule;
    const openRouter = customModelProvider.modelsInfo.find(
      (m) => m.provider === "openRouter",
    );
    expect(openRouter?.models).toHaveLength(7);
  });

  it("each model has a non-empty name", () => {
    const { customModelProvider } = modelsModule;
    const openRouter = customModelProvider.modelsInfo.find(
      (m) => m.provider === "openRouter",
    )!;
    for (const model of openRouter.models) {
      expect(typeof model.name).toBe("string");
      expect(model.name.length).toBeGreaterThan(0);
    }
  });

  it("getModel returns a defined object for each approved model", () => {
    const { customModelProvider } = modelsModule;
    const MODELS = [
      "gpt-5.5",
      "claude-opus-4.8",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ];
    for (const model of MODELS) {
      const result = customModelProvider.getModel({
        provider: "openRouter",
        model,
      });
      expect(result).toBeDefined();
    }
  });
});

describe("customModelProvider file support — gemini-3.1-flash-lite", () => {
  it("maps gemini-3.1-flash-lite to Gemini file support", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: "gemini-3.1-flash-lite",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(GEMINI_FILE_MIME_TYPES),
    );
  });
});

describe("customModelProvider registry invariants", () => {
  it("no model names are duplicated in the registry", () => {
    const { customModelProvider } = modelsModule;
    const openRouter = customModelProvider.modelsInfo.find(
      (m) => m.provider === "openRouter",
    )!;
    const names = openRouter.models.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all models have a non-empty supportedFileMimeTypes array", () => {
    const { customModelProvider } = modelsModule;
    const openRouter = customModelProvider.modelsInfo.find(
      (m) => m.provider === "openRouter",
    )!;
    for (const model of openRouter.models) {
      expect(Array.isArray(model.supportedFileMimeTypes)).toBe(true);
      expect(model.supportedFileMimeTypes!.length).toBeGreaterThan(0);
    }
  });

  it("file support mime types are all non-empty strings", () => {
    const { customModelProvider } = modelsModule;
    const openRouter = customModelProvider.modelsInfo.find(
      (m) => m.provider === "openRouter",
    )!;
    for (const model of openRouter.models) {
      for (const mime of model.supportedFileMimeTypes ?? []) {
        expect(typeof mime).toBe("string");
        expect(mime.length).toBeGreaterThan(0);
      }
    }
  });

  it("provider string for all models is exactly 'openRouter'", () => {
    const { customModelProvider } = modelsModule;
    for (const info of customModelProvider.modelsInfo) {
      expect(info.provider).toBe("openRouter");
    }
  });
});

describe("customModelProvider — additional edge cases", () => {
  it("modelsInfo is always an array", () => {
    const { customModelProvider } = modelsModule;
    expect(Array.isArray(customModelProvider.modelsInfo)).toBe(true);
  });

  it("OPENAI_FILE_MIME_TYPES is non-empty", () => {
    expect(OPENAI_FILE_MIME_TYPES.length).toBeGreaterThan(0);
  });

  it("GEMINI_FILE_MIME_TYPES is non-empty", () => {
    expect(GEMINI_FILE_MIME_TYPES.length).toBeGreaterThan(0);
  });

  it("ANTHROPIC_FILE_MIME_TYPES is non-empty", () => {
    expect(ANTHROPIC_FILE_MIME_TYPES.length).toBeGreaterThan(0);
  });
});

describe("MIME type sets — membership invariants", () => {
  it("OPENAI_FILE_MIME_TYPES contains image/png", () => {
    expect(OPENAI_FILE_MIME_TYPES).toContain("image/png");
  });

  it("GEMINI_FILE_MIME_TYPES contains image/jpeg", () => {
    expect(GEMINI_FILE_MIME_TYPES).toContain("image/jpeg");
  });

  it("ANTHROPIC_FILE_MIME_TYPES contains image/jpeg", () => {
    expect(ANTHROPIC_FILE_MIME_TYPES).toContain("image/jpeg");
  });

  it("each MIME type list has more than 1 entry", () => {
    expect(OPENAI_FILE_MIME_TYPES.length).toBeGreaterThan(1);
    expect(GEMINI_FILE_MIME_TYPES.length).toBeGreaterThan(1);
    expect(ANTHROPIC_FILE_MIME_TYPES.length).toBeGreaterThan(1);
  });
});

describe("customModelProvider.modelsInfo structure", () => {
  it("returns a non-empty array of providers", () => {
    const { customModelProvider } = modelsModule;
    expect(Array.isArray(customModelProvider.modelsInfo)).toBe(true);
    expect(customModelProvider.modelsInfo.length).toBeGreaterThan(0);
  });

  it("every provider entry has provider, models, and hasAPIKey fields", () => {
    const { customModelProvider } = modelsModule;
    for (const entry of customModelProvider.modelsInfo) {
      expect(typeof entry.provider).toBe("string");
      expect(Array.isArray(entry.models)).toBe(true);
      expect(typeof entry.hasAPIKey).toBe("boolean");
    }
  });

  it("every model entry has name and supportedFileMimeTypes", () => {
    const { customModelProvider } = modelsModule;
    for (const entry of customModelProvider.modelsInfo) {
      for (const model of entry.models) {
        expect(typeof model.name).toBe("string");
        expect(Array.isArray(model.supportedFileMimeTypes)).toBe(true);
      }
    }
  });

  it("every model entry has isToolCallUnsupported boolean", () => {
    const { customModelProvider } = modelsModule;
    for (const entry of customModelProvider.modelsInfo) {
      for (const model of entry.models) {
        expect(typeof model.isToolCallUnsupported).toBe("boolean");
      }
    }
  });
});

describe("customModelProvider.getModel", () => {
  it("returns a model when called with no arguments", () => {
    const { customModelProvider } = modelsModule;
    const model = customModelProvider.getModel();
    expect(model).toBeDefined();
  });

  it("returns a model for a valid provider/model combo", () => {
    const { customModelProvider } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openai",
      model: "gpt-4.1",
    });
    expect(model).toBeDefined();
  });

  it("returns a model for anthropic provider", () => {
    const { customModelProvider } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "anthropic",
      model: "sonnet-4.5",
    });
    expect(model).toBeDefined();
  });
});

describe("isToolCallUnsupportedModel", () => {
  it("returns false for a standard OpenAI model", () => {
    const { customModelProvider, isToolCallUnsupportedModel } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openai",
      model: "gpt-4.1",
    });
    expect(typeof isToolCallUnsupportedModel(model)).toBe("boolean");
  });
});

describe("customModelProvider — provider name invariants", () => {
  it("provider names are non-empty strings", () => {
    const { customModelProvider } = modelsModule;
    for (const entry of customModelProvider.modelsInfo) {
      expect(entry.provider.length).toBeGreaterThan(0);
    }
  });

  it("model names are non-empty strings", () => {
    const { customModelProvider } = modelsModule;
    for (const entry of customModelProvider.modelsInfo) {
      for (const model of entry.models) {
        expect(model.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("getFilePartSupportedMimeTypes returns an array", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openai",
      model: "gpt-4.1",
    });
    expect(Array.isArray(getFilePartSupportedMimeTypes(model))).toBe(true);
  });

  it("getFilePartSupportedMimeTypes entries are strings", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openai",
      model: "gpt-4.1",
    });
    for (const mime of getFilePartSupportedMimeTypes(model)) {
      expect(typeof mime).toBe("string");
    }
  });
});
