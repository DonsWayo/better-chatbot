import { describe, it, expect } from "vitest";
import { chunkText } from "./chunker";

describe("chunkText — trivial cases", () => {
  it("returns single chunk for short text", () => {
    expect(chunkText("Hello world")).toHaveLength(1);
  });

  it("returned chunk contains the original text (trimmed)", () => {
    const chunks = chunkText("  Hello world  ");
    expect(chunks[0]).toBe("Hello world");
  });

  it("handles empty string — returns no chunks", () => {
    const chunks = chunkText("");
    expect(chunks.filter((c) => c.length > 0)).toHaveLength(0);
  });

  it("handles whitespace-only string — returns no chunks", () => {
    const chunks = chunkText("   \n\n  ");
    expect(chunks.filter((c) => c.length > 0)).toHaveLength(0);
  });

  it("returns single chunk when text exactly fits maxTokens", () => {
    const text = "x".repeat(400); // 400 chars = 100 tokens
    const chunks = chunkText(text, { maxTokens: 100 });
    expect(chunks).toHaveLength(1);
  });
});

describe("chunkText — multi-paragraph splitting", () => {
  it("splits long text into multiple chunks", () => {
    const longText = Array(200).fill("This is a sentence. ").join("");
    const chunks = chunkText(longText, { maxTokens: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(Math.ceil(c.length / 4)).toBeLessThanOrEqual(110); // some tolerance for overlap
    }
  });

  it("preserves all content across chunks (approximately)", () => {
    const text = Array(100).fill("Paragraph content here.\n\n").join("");
    const chunks = chunkText(text, { maxTokens: 200 });
    const combined = chunks.join(" ");
    expect(combined).toContain("Paragraph content here.");
  });

  it("splits on double-newline paragraph boundaries", () => {
    const p1 = "First paragraph here.";
    const p2 = "Second paragraph here.";
    const p3 = "Third paragraph here.";
    const text = `${p1}\n\n${p2}\n\n${p3}`;
    // maxTokens=10 forces splits (each para is ~6 tokens)
    const chunks = chunkText(text, { maxTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    const joined = chunks.join(" ");
    expect(joined).toContain("First paragraph");
    expect(joined).toContain("Second paragraph");
    expect(joined).toContain("Third paragraph");
  });
});

describe("chunkText — sentence-level splitting", () => {
  it("splits a single large paragraph by sentences when it exceeds maxTokens", () => {
    // One paragraph without double-newlines that exceeds maxTokens
    const sentences = Array(40).fill("This is sentence number X. ").join("");
    const chunks = chunkText(sentences, { maxTokens: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(50 * 4 + 50 * 4 * 0.5); // generous tolerance
    }
  });
});

describe("chunkText — overlap", () => {
  it("produces overlapping content between consecutive chunks", () => {
    // Build a long text with distinct paragraphs
    const paragraphs = Array.from(
      { length: 30 },
      (_, i) => `Paragraph number ${i} with some unique content.`,
    ).join("\n\n");
    const chunks = chunkText(paragraphs, { maxTokens: 100, overlapTokens: 40 });
    if (chunks.length < 2) return; // trivial: no overlap to check
    // Last part of chunk N should appear somewhere in chunk N+1
    const tail = chunks[0].slice(-100);
    const hasOverlap = chunks[1].includes(tail.slice(0, 20).trim());
    expect(hasOverlap).toBe(true);
  });
});

describe("chunkText — chunk ordering", () => {
  it("returns chunks in original text order", () => {
    const text = Array.from(
      { length: 30 },
      (_, i) => `Section ${String(i).padStart(3, "0")} content here.`,
    ).join("\n\n");
    const chunks = chunkText(text, { maxTokens: 100 });
    const positions = chunks.map((c) => {
      const match = c.match(/Section (\d+)/);
      return match ? parseInt(match[1]) : -1;
    });
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }
  });
});
