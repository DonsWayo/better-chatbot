import { describe, it, expect, vi } from "vitest";

vi.mock("auth/server", () => ({ auth: { handler: vi.fn() } }));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: vi.fn().mockReturnValue({
    GET: vi.fn(),
    POST: vi.fn(),
  }),
}));

describe("auth route handler", () => {
  it("exports GET handler", async () => {
    const { GET } = await import("./route");
    expect(typeof GET).toBe("function");
  });

  it("exports POST handler", async () => {
    const { POST } = await import("./route");
    expect(typeof POST).toBe("function");
  });
});
