import { describe, expect, it, vi, afterEach } from "vitest";
import type { JSONSchema7 } from "json-schema";
import { httpFetchSchema, httpFetchTool } from "./fetch";

const prop = (key: string) => httpFetchSchema.properties?.[key] as unknown as JSONSchema7;

describe("httpFetchSchema", () => {
  it("is an object schema", () => {
    expect(httpFetchSchema.type).toBe("object");
  });

  it("has url as a required property", () => {
    expect(httpFetchSchema.required).toContain("url");
  });

  it("url property is a string type", () => {
    expect(httpFetchSchema.properties?.url).toMatchObject({ type: "string" });
  });

  it("method property is an enum", () => {
    expect(Array.isArray(prop("method")?.enum)).toBe(true);
  });

  it("method enum includes GET and POST", () => {
    const methodEnum = prop("method")?.enum as string[] | undefined;
    expect(methodEnum).toContain("GET");
    expect(methodEnum).toContain("POST");
  });

  it("method enum includes all common HTTP methods", () => {
    const methodEnum = prop("method")?.enum as string[] | undefined;
    for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      expect(methodEnum).toContain(m);
    }
  });

  it("timeout property has a default value", () => {
    const timeout = prop("timeout");
    expect(timeout?.default).toBeDefined();
    expect(typeof timeout?.default).toBe("number");
  });

  it("headers property allows additionalProperties", () => {
    const headers = prop("headers");
    expect(headers?.additionalProperties).toBe(true);
  });
});

describe("httpFetchSchema — shape invariants", () => {
  it("has properties object", () => {
    expect(typeof httpFetchSchema.properties).toBe("object");
    expect(httpFetchSchema.properties).not.toBeNull();
  });

  it("required is an array", () => {
    expect(Array.isArray(httpFetchSchema.required)).toBe(true);
  });

  it("has at least 2 properties defined", () => {
    expect(Object.keys(httpFetchSchema.properties ?? {}).length).toBeGreaterThanOrEqual(2);
  });

  it("method default is GET", () => {
    expect(prop("method")?.default).toBe("GET");
  });
});

describe("httpFetchTool execute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is defined with execute function", () => {
    expect(httpFetchTool).toBeDefined();
    expect(typeof httpFetchTool.execute).toBe("function");
  });

  it("makes a GET request and returns response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      url: "https://api.example.com/data",
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockResolvedValue({ result: "data" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await httpFetchTool.execute!(
      { url: "https://api.example.com/data" },
      {} as Parameters<NonNullable<typeof httpFetchTool.execute>>[1],
    );

    expect((result as { status: number }).status).toBe(200);
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it("sends POST with body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      url: "https://api.example.com/items",
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockResolvedValue({ id: 1 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await httpFetchTool.execute!(
      { url: "https://api.example.com/items", method: "POST", body: '{"name":"Test"}' },
      {} as Parameters<NonNullable<typeof httpFetchTool.execute>>[1],
    );

    const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
    expect(callArgs.method).toBe("POST");
    expect(callArgs.body).toBe('{"name":"Test"}');
  });

  it("returns error result on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await httpFetchTool.execute!(
      { url: "https://unreachable.example.com" },
      {} as Parameters<NonNullable<typeof httpFetchTool.execute>>[1],
    );

    expect((result as { isError: boolean }).isError).toBe(true);
    expect((result as { error: string }).error).toContain("Network error");
  });

  it("handles text/html response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      url: "https://example.com/page",
      headers: new Headers({ "content-type": "text/html" }),
      text: vi.fn().mockResolvedValue("<html>Hello</html>"),
    }));

    const result = await httpFetchTool.execute!(
      { url: "https://example.com/page" },
      {} as Parameters<NonNullable<typeof httpFetchTool.execute>>[1],
    );

    expect((result as { body: string }).body).toBe("<html>Hello</html>");
  });

  it("does not send body for GET requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      url: "https://api.example.com",
      headers: new Headers({ "content-type": "text/plain" }),
      text: vi.fn().mockResolvedValue("ok"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await httpFetchTool.execute!(
      { url: "https://api.example.com", method: "GET", body: '{"ignored": true}' },
      {} as Parameters<NonNullable<typeof httpFetchTool.execute>>[1],
    );

    const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
    expect(callArgs.body).toBeUndefined();
  });
});
