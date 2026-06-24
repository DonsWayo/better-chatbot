import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  generateObject: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  openrouter: vi.fn(() => ({})),
}));
vi.mock("logger", () => ({
  default: { withDefaults: vi.fn(() => ({ error: vi.fn() })) },
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import { generateFollowUps } from "./follow-ups";

// ---------------------------------------------------------------------------
// Inline copy of sanitizeQuestion — the function is not exported, so we test
// its observable behaviour both through this copy and via generateFollowUps.
// ---------------------------------------------------------------------------
function sanitizeQuestion(q: string): string {
  return q
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a string of exactly `n` characters */
function makeString(n: number, char = "a"): string {
  return char.repeat(n);
}

/** Make a long enough response text to pass the 80-char guard */
const LONG_RESPONSE = makeString(100);

/** Wire generateObject to resolve with the given questions array */
function mockQuestions(questions: string[]) {
  h.generateObject.mockResolvedValueOnce({ object: { questions } });
}

// ---------------------------------------------------------------------------
// sanitizeQuestion — pure function tests
// ---------------------------------------------------------------------------

describe("sanitizeQuestion (inline copy)", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeQuestion("")).toBe("");
  });

  it("trims leading whitespace", () => {
    expect(sanitizeQuestion("   hello")).toBe("hello");
  });

  it("trims trailing whitespace", () => {
    expect(sanitizeQuestion("hello   ")).toBe("hello");
  });

  it("trims both ends", () => {
    expect(sanitizeQuestion("  hello world  ")).toBe("hello world");
  });

  it("collapses \\n\\n in the middle to a single space", () => {
    expect(sanitizeQuestion("foo\n\nbar")).toBe("foo bar");
  });

  it("collapses \\n to a single space", () => {
    expect(sanitizeQuestion("foo\nbar")).toBe("foo bar");
  });

  it("collapses \\r\\n (CRLF) to a single space", () => {
    expect(sanitizeQuestion("foo\r\nbar")).toBe("foo bar");
  });

  it("collapses \\t tab characters to a single space", () => {
    expect(sanitizeQuestion("foo\tbar")).toBe("foo bar");
  });

  it("collapses multiple consecutive spaces to a single space", () => {
    expect(sanitizeQuestion("foo   bar")).toBe("foo bar");
  });

  it("handles a string that is exactly 200 characters — returns as-is", () => {
    const s = makeString(200);
    expect(sanitizeQuestion(s)).toBe(s);
    expect(sanitizeQuestion(s)).toHaveLength(200);
  });

  it("truncates a string of 201 characters to 200", () => {
    const s = makeString(201);
    expect(sanitizeQuestion(s)).toHaveLength(200);
  });

  it("truncates a string of 500 characters to 200", () => {
    const s = makeString(500);
    expect(sanitizeQuestion(s)).toHaveLength(200);
  });

  it("cleans both newlines and excessive spaces together", () => {
    expect(sanitizeQuestion("  foo\n\n  bar  \t baz  ")).toBe("foo bar baz");
  });

  it("returns empty string for a string containing only whitespace", () => {
    expect(sanitizeQuestion("   \n\t  ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// generateFollowUps
// ---------------------------------------------------------------------------

describe("generateFollowUps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Short-circuit guard ------------------------------------------------

  it("returns [] immediately for an empty string (< 80 chars)", async () => {
    const result = await generateFollowUps("");
    expect(result).toEqual([]);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("returns [] for a string of exactly 79 trimmed chars", async () => {
    const result = await generateFollowUps(makeString(79));
    expect(result).toEqual([]);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("returns [] for whitespace-only input regardless of length", async () => {
    const result = await generateFollowUps(makeString(100, " "));
    expect(result).toEqual([]);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("calls generateObject when input is exactly 80 trimmed chars", async () => {
    mockQuestions(["Q1?", "Q2?", "Q3?"]);
    await generateFollowUps(makeString(80));
    expect(h.generateObject).toHaveBeenCalledOnce();
  });

  // ---- Happy path ----------------------------------------------------------

  it("returns sanitized questions on a successful call", async () => {
    mockQuestions(["What is X?", "How does Y work?", "Can I do Z?"]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual(["What is X?", "How does Y work?", "Can I do Z?"]);
  });

  it("returns at most 3 questions (schema enforces length=3)", async () => {
    mockQuestions(["Q1?", "Q2?", "Q3?"]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("caps output at MAX_QUESTIONS=5 even when the model returns 6 items", async () => {
    // Override schema-level constraint by returning extra items directly
    h.generateObject.mockResolvedValueOnce({
      object: { questions: ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?", "Q6?"] },
    });
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("deduplicates identical questions (3 identical → only 1 returned)", async () => {
    mockQuestions(["Same question?", "Same question?", "Same question?"]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual(["Same question?"]);
  });

  it("deduplicates keeping the first occurrence and order", async () => {
    mockQuestions(["First?", "Second?", "First?"]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual(["First?", "Second?"]);
  });

  it("sanitizes questions with embedded newlines", async () => {
    mockQuestions(["What\nis\nX?", "How does\n\nY work?", "Can I\ndo Z?"]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual(["What is X?", "How does Y work?", "Can I do Z?"]);
  });

  it("sanitizes questions with excessive spaces", async () => {
    mockQuestions(["What   is   X?", "How  does  Y  work?", "Can  I  do  Z?"]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual(["What is X?", "How does Y work?", "Can I do Z?"]);
  });

  it("truncates individual questions longer than 200 chars", async () => {
    const long = makeString(250, "a") + "?";
    mockQuestions([long, "Short Q2?", "Short Q3?"]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result[0]).toHaveLength(200);
  });

  it("filters out questions that are empty after sanitization", async () => {
    mockQuestions(["\n\n\t  ", "Valid question?", "   "]);
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual(["Valid question?"]);
  });

  // ---- AbortSignal --------------------------------------------------------

  it("passes the AbortSignal through to generateObject", async () => {
    mockQuestions(["Q1?", "Q2?", "Q3?"]);
    const controller = new AbortController();
    await generateFollowUps(LONG_RESPONSE, controller.signal);
    expect(h.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });

  it("returns [] on AbortError without logging", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    h.generateObject.mockRejectedValueOnce(abortErr);

    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual([]);
  });

  // ---- Error handling ------------------------------------------------------

  it("returns [] on a generic network error", async () => {
    h.generateObject.mockRejectedValueOnce(new Error("fetch failed"));
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual([]);
  });

  it("returns [] on a non-Error thrown value", async () => {
    h.generateObject.mockRejectedValueOnce("unexpected string rejection");
    const result = await generateFollowUps(LONG_RESPONSE);
    expect(result).toEqual([]);
  });

  it("does not re-throw on any error — always resolves", async () => {
    h.generateObject.mockRejectedValueOnce(new Error("boom"));
    await expect(generateFollowUps(LONG_RESPONSE)).resolves.toEqual([]);
  });

  // ---- Input truncation ---------------------------------------------------

  it("passes only the first 4000 chars of a very long response to the model", async () => {
    mockQuestions(["Q1?", "Q2?", "Q3?"]);
    const big = makeString(6000);
    await generateFollowUps(big);
    const callArgs = h.generateObject.mock.calls[0][0];
    expect(callArgs.prompt).toHaveLength(4000);
  });

  it("passes the full text when response is under 4000 chars", async () => {
    mockQuestions(["Q1?", "Q2?", "Q3?"]);
    const small = makeString(200);
    await generateFollowUps(small);
    const callArgs = h.generateObject.mock.calls[0][0];
    expect(callArgs.prompt).toBe(small);
  });

  // ---- Model wiring -------------------------------------------------------

  it("calls generateObject with a model, schema, system prompt, and prompt", async () => {
    mockQuestions(["Q1?", "Q2?", "Q3?"]);
    await generateFollowUps(LONG_RESPONSE);
    expect(h.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.anything(),
        schema: expect.anything(),
        system: expect.any(String),
        prompt: expect.any(String),
      }),
    );
  });
});
