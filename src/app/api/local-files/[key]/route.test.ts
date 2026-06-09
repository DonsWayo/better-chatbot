import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: readFileMock }));
vi.mock("lib/const", () => ({ IS_DEV: false }));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/local-files/[key]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 404 in production (IS_DEV=false)", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "image.png" }) });
    expect(res.status).toBe(404);
  });
});
