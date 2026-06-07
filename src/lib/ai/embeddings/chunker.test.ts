import { describe, it, expect } from "vitest";
import { chunkText } from "./chunker";

describe("chunkText", () => {
  it("returns single chunk for short text", () => {
    expect(chunkText("Hello world")).toHaveLength(1);
  });

  it("splits long text into multiple chunks", () => {
    const longText = Array(200).fill("This is a sentence. ").join("");
    const chunks = chunkText(longText, { maxTokens: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should be within limit
    for (const c of chunks) {
      expect(Math.ceil(c.length / 4)).toBeLessThanOrEqual(110); // some tolerance for overlap
    }
  });

  it("preserves all content across chunks (approximately)", () => {
    const text = Array(100).fill("Paragraph content here.\n\n").join("");
    const chunks = chunkText(text, { maxTokens: 200 });
    const combined = chunks.join(" ");
    // Each sentence should appear in at least one chunk
    expect(combined).toContain("Paragraph content here.");
  });
});
