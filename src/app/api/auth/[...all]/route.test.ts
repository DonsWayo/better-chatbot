import { describe, it, expect, vi } from "vitest";

const { toNextJsHandlerMock } = vi.hoisted(() => ({
  toNextJsHandlerMock: vi.fn().mockReturnValue({
    GET: vi.fn().mockResolvedValue(new Response("ok")),
    POST: vi.fn().mockResolvedValue(new Response("ok")),
  }),
}));

vi.mock("auth/server", () => ({ auth: { handler: vi.fn() } }));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: toNextJsHandlerMock,
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

  it("calls toNextJsHandler to wire up auth", async () => {
    await import("./route");
    expect(toNextJsHandlerMock).toHaveBeenCalled();
  });

  it("toNextJsHandler is called with auth.handler", async () => {
    const { auth } = await import("auth/server");
    await import("./route");
    expect(toNextJsHandlerMock).toHaveBeenCalledWith(auth.handler);
  });

  it("GET handler is callable without throwing", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/auth/callback");
    await expect(GET(req)).resolves.not.toThrow();
  });

  it("POST handler is callable without throwing", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/login", { method: "POST" });
    await expect(POST(req)).resolves.not.toThrow();
  });

  it("GET handler returns a Response object", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/auth/session");
    const res = await GET(req);
    expect(res).toBeInstanceOf(Response);
  });

  it("POST handler returns a Response object", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/sign-in", { method: "POST" });
    const res = await POST(req);
    expect(res).toBeInstanceOf(Response);
  });

  it("toNextJsHandler is called exactly once on module load", async () => {
    vi.resetModules();
    toNextJsHandlerMock.mockClear();
    await import("./route");
    expect(toNextJsHandlerMock).toHaveBeenCalledOnce();
  });
});
