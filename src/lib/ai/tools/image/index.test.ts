import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateImageMock, fileStorageMock, generateTextMock } = vi.hoisted(
  () => ({
    generateImageMock: vi.fn(),
    fileStorageMock: { upload: vi.fn(), download: vi.fn() },
    generateTextMock: vi.fn(),
  }),
);

vi.mock("lib/ai/image/generate-image", () => ({
  generateImageWithNanoBanana: generateImageMock,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: fileStorageMock,
}));
vi.mock("ai", async () => ({
  ...(await vi.importActual<typeof import("ai")>("ai")),
  generateText: generateTextMock,
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: Object.assign(
    vi.fn((model: string) => ({ modelId: model })),
    {
      tools: { imageGeneration: vi.fn(() => ({})) },
    },
  ),
}));
vi.mock("logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    withTag: vi.fn(() => ({ error: vi.fn() })),
  },
}));
vi.mock("lib/utils", () => ({ toAny: (v: unknown) => v }));

import type { ToolCallOptions } from "ai";
import { ImageToolName } from "..";
import { nanoBananaTool, openaiImageTool } from "./index";

// The AI SDK's Tool type does not surface the extra `name` property that
// createTool({ name, ... }) carries at runtime, nor a non-streaming result type.
type NamedTool = { name?: string };
type ImageToolResult = {
  images: Array<{ url: string; mimeType?: string }>;
  mode: string;
  model: string;
  guide: string;
};
const callOpts = {
  messages: [],
  abortSignal: undefined,
} as unknown as ToolCallOptions;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nanoBananaTool", () => {
  it("is defined", () => {
    expect(nanoBananaTool).toBeDefined();
  });

  it("has the correct name", () => {
    expect((nanoBananaTool as NamedTool).name).toBe(ImageToolName);
  });

  it("has a description", () => {
    expect(typeof nanoBananaTool.description).toBe("string");
    expect(nanoBananaTool.description!.length).toBeGreaterThan(0);
  });

  it("has inputSchema with mode parameter", () => {
    expect(nanoBananaTool.inputSchema).toBeDefined();
  });

  it("has execute function", () => {
    expect(typeof nanoBananaTool.execute).toBe("function");
  });

  it("returns images array on successful generation", async () => {
    generateImageMock.mockResolvedValue({
      images: [{ base64: "abc123", mimeType: "image/png" }],
    });
    fileStorageMock.upload.mockResolvedValue({
      sourceUrl: "https://cdn.example.com/img.png",
    });

    const result = (await nanoBananaTool.execute!(
      { mode: "create" },
      callOpts,
    )) as ImageToolResult;

    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe("https://cdn.example.com/img.png");
    expect(result.mode).toBe("create");
    expect(result.model).toBe("gemini-2.5-flash-image");
  });

  it("returns empty images array when generation returns no images", async () => {
    generateImageMock.mockResolvedValue({ images: [] });

    const result = (await nanoBananaTool.execute!(
      { mode: "create" },
      callOpts,
    )) as ImageToolResult;

    expect(result.images).toEqual([]);
  });

  it("propagates error when upload fails", async () => {
    generateImageMock.mockResolvedValue({
      images: [{ base64: "abc123", mimeType: "image/png" }],
    });
    fileStorageMock.upload.mockRejectedValue(new Error("Upload failed"));

    await expect(
      nanoBananaTool.execute!({ mode: "create" }, callOpts),
    ).rejects.toThrow("file upload failed");
  });

  it("includes guide in result for successful generation", async () => {
    generateImageMock.mockResolvedValue({
      images: [{ base64: "abc", mimeType: "image/png" }],
    });
    fileStorageMock.upload.mockResolvedValue({
      sourceUrl: "https://cdn.example.com/i.png",
    });

    const result = (await nanoBananaTool.execute!(
      { mode: "edit" },
      callOpts,
    )) as ImageToolResult;

    expect(typeof result.guide).toBe("string");
    expect(result.guide.length).toBeGreaterThan(0);
  });
});

describe("openaiImageTool", () => {
  it("is defined", () => {
    expect(openaiImageTool).toBeDefined();
  });

  it("has the correct name", () => {
    expect((openaiImageTool as NamedTool).name).toBe(ImageToolName);
  });

  it("has a description", () => {
    expect(typeof openaiImageTool.description).toBe("string");
    expect(openaiImageTool.description!.length).toBeGreaterThan(0);
  });

  it("has inputSchema", () => {
    expect(openaiImageTool.inputSchema).toBeDefined();
  });

  it("has execute function", () => {
    expect(typeof openaiImageTool.execute).toBe("function");
  });

  it("throws when OPENAI_API_KEY is not set", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      openaiImageTool.execute!({ mode: "create" }, callOpts),
    ).rejects.toThrow("OPENAI_API_KEY is not set");
  });

  it("returns empty images when no image_generation tool result", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    generateTextMock.mockResolvedValue({ staticToolResults: [] });

    const result = (await openaiImageTool.execute!(
      { mode: "create" },
      callOpts,
    )) as ImageToolResult;

    expect(result.images).toEqual([]);
    expect(result.model).toBe("gpt-image-1-mini");
    delete process.env.OPENAI_API_KEY;
  });

  it("returns uploaded image when image_generation succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    generateTextMock.mockResolvedValue({
      staticToolResults: [
        {
          toolName: "image_generation",
          output: { result: Buffer.from("fake-image").toString("base64") },
        },
      ],
    });
    fileStorageMock.upload.mockResolvedValue({
      sourceUrl: "https://cdn.example.com/gen.webp",
    });

    const result = (await openaiImageTool.execute!(
      { mode: "create" },
      callOpts,
    )) as ImageToolResult;

    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe("https://cdn.example.com/gen.webp");
    expect(result.images[0].mimeType).toBe("image/webp");
    delete process.env.OPENAI_API_KEY;
  });
});
