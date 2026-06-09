import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  OPENAI_FILE_MIME_TYPES,
  ANTHROPIC_FILE_MIME_TYPES,
} from "./file-support";

vi.mock("server-only", () => ({}));

let modelsModule: typeof import("./models");

beforeAll(async () => {
  modelsModule = await import("./models");
});

describe("customModelProvider file support metadata", () => {
  it("includes default file support for OpenAI gpt-4.1", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openai",
      model: "gpt-4.1",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(OPENAI_FILE_MIME_TYPES),
    );

    const openaiProvider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "openai",
    );
    const metadata = openaiProvider?.models.find(
      (item) => item.name === "gpt-4.1",
    );

    expect(metadata?.supportedFileMimeTypes).toEqual(
      Array.from(OPENAI_FILE_MIME_TYPES),
    );
  });

  it("adds rich support for anthropic sonnet-4.5", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "anthropic",
      model: "sonnet-4.5",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(ANTHROPIC_FILE_MIME_TYPES),
    );
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
