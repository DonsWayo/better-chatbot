import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { countDocumentViewersMock } = vi.hoisted(() => ({
  countDocumentViewersMock: vi.fn(),
}));

vi.mock("lib/realtime/document-presence-actions", () => ({
  countDocumentViewers: countDocumentViewersMock,
}));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/export/[id]/presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the viewer count (public, no auth required)", async () => {
    countDocumentViewersMock.mockResolvedValueOnce(4);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "ex-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
    expect(countDocumentViewersMock).toHaveBeenCalledWith("ex-1");
  });

  it("never fails the page: falls back to count 0 on error", async () => {
    countDocumentViewersMock.mockRejectedValueOnce(new Error("db down"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "ex-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
  });
});
