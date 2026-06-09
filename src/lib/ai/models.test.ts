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
  it("maps gpt-5.1 to OpenAI file support", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: "gpt-5.1",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(OPENAI_FILE_MIME_TYPES),
    );

    const openRouterProvider = customModelProvider.modelsInfo.find(
      (item) => item.provider === "openRouter",
    );
    const metadata = openRouterProvider?.models.find(
      (item) => item.name === "gpt-5.1",
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

  it("maps gemini-2.5-flash to Gemini file support", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: "gemini-2.5-flash",
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
      "gpt-5.1",
      "claude-opus-4.8",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]);
  });

  it("has exactly 4 approved models in the registry", () => {
    const { customModelProvider } = modelsModule;
    const openRouter = customModelProvider.modelsInfo.find(
      (m) => m.provider === "openRouter",
    );
    expect(openRouter?.models).toHaveLength(4);
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
    const MODELS = ["gpt-5.1", "claude-opus-4.8", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
    for (const model of MODELS) {
      const result = customModelProvider.getModel({ provider: "openRouter", model });
      expect(result).toBeDefined();
    }
  });
});

describe("customModelProvider file support — gemini-2.5-flash-lite", () => {
  it("maps gemini-2.5-flash-lite to Gemini file support", () => {
    const { customModelProvider, getFilePartSupportedMimeTypes } = modelsModule;
    const model = customModelProvider.getModel({
      provider: "openRouter",
      model: "gemini-2.5-flash-lite",
    });
    expect(getFilePartSupportedMimeTypes(model)).toEqual(
      Array.from(GEMINI_FILE_MIME_TYPES),
    );
  });
});
