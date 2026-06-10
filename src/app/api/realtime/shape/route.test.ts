import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, canReadThreadMock, canAccessFolderMock } = vi.hoisted(
  () => ({
    getSessionMock: vi.fn(),
    canReadThreadMock: vi.fn(),
    canAccessFolderMock: vi.fn(),
  }),
);

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/teamspaces/folders", () => ({
  canReadThread: canReadThreadMock,
  canAccessFolder: canAccessFolderMock,
}));

const THREAD_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FOLDER_ID = "99999999-8888-4777-8666-555555555555";

function makeRequest(query: string): Request {
  return new Request(`http://localhost:3002/api/realtime/shape?${query}`);
}

function mockElectricResponse(init?: {
  headers?: Record<string, string>;
  status?: number;
}): Response {
  return new Response(`[]`, {
    status: init?.status ?? 200,
    headers: init?.headers ?? {},
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(mockElectricResponse());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/realtime/shape — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=chat_message&threadId=${THREAD_ID}&offset=-1`),
    );
    expect(res.status).toBe(401);
  });

  it("never contacts Electric when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(`table=chat_message&threadId=${THREAD_ID}`));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(canReadThreadMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/realtime/shape — whitelist", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
  });

  it("returns 403 for a non-whitelisted table", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(`table=user&offset=-1`));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 403 when table is missing entirely", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(`offset=-1`));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for chat_message without a threadId", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(`table=chat_message&offset=-1`));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for chat_message with a non-uuid threadId", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=chat_message&threadId=not-a-uuid`),
    );
    expect(res.status).toBe(400);
    expect(canReadThreadMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/realtime/shape — chat_message ACL", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
  });

  it("returns 403 when canReadThread denies the caller", async () => {
    canReadThreadMock.mockResolvedValue(false);
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=chat_message&threadId=${THREAD_ID}&offset=-1`),
    );
    expect(res.status).toBe(403);
    expect(canReadThreadMock).toHaveBeenCalledWith(THREAD_ID, USER_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pins the where clause to the requested thread server-side", async () => {
    canReadThreadMock.mockResolvedValue(true);
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=chat_message&threadId=${THREAD_ID}&offset=-1`),
    );
    expect(res.status).toBe(200);
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.pathname).toBe("/v1/shape");
    expect(upstream.searchParams.get("table")).toBe("chat_message");
    expect(upstream.searchParams.get("where")).toBe(`"thread_id" = $1`);
    expect(upstream.searchParams.get("params[1]")).toBe(THREAD_ID);
  });

  it("ignores client-supplied where/params/columns (cannot widen the shape)", async () => {
    canReadThreadMock.mockResolvedValue(true);
    const { GET } = await import("./route");
    await GET(
      makeRequest(
        `table=chat_message&threadId=${THREAD_ID}&offset=-1` +
          `&where=${encodeURIComponent("1=1")}&params[1]=evil&columns=parts&secret=x`,
      ),
    );
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get("where")).toBe(`"thread_id" = $1`);
    expect(upstream.searchParams.get("params[1]")).toBe(THREAD_ID);
    expect(upstream.searchParams.get("columns")).toBe("id,created_at");
    expect(upstream.searchParams.get("secret")).toBeNull();
  });
});

describe("GET /api/realtime/shape — agent_session", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
  });

  it("scopes the shape to the caller's own sessions", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(`table=agent_session&offset=-1`));
    expect(res.status).toBe(200);
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get("table")).toBe("agent_session");
    expect(upstream.searchParams.get("where")).toBe(`"user_id" = $1`);
    expect(upstream.searchParams.get("params[1]")).toBe(USER_ID);
  });

  it("ignores a client-supplied userId filter (still pinned to caller)", async () => {
    const { GET } = await import("./route");
    await GET(
      makeRequest(`table=agent_session&offset=-1&params[1]=other-user`),
    );
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get("params[1]")).toBe(USER_ID);
  });
});

describe("GET /api/realtime/shape — asafe_presence", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
  });

  it("returns 400 without a contextType", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=asafe_presence&contextId=${THREAD_ID}&offset=-1`),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown contextType", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `table=asafe_presence&contextType=workspace&contextId=${THREAD_ID}&offset=-1`,
      ),
    );
    expect(res.status).toBe(400);
    expect(canReadThreadMock).not.toHaveBeenCalled();
    expect(canAccessFolderMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-uuid contextId", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `table=asafe_presence&contextType=thread&contextId=nope&offset=-1`,
      ),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("thread context: returns 403 when canReadThread denies", async () => {
    canReadThreadMock.mockResolvedValue(false);
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `table=asafe_presence&contextType=thread&contextId=${THREAD_ID}&offset=-1`,
      ),
    );
    expect(res.status).toBe(403);
    expect(canReadThreadMock).toHaveBeenCalledWith(THREAD_ID, USER_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("folder context: returns 403 when canAccessFolder denies", async () => {
    canAccessFolderMock.mockResolvedValue(false);
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `table=asafe_presence&contextType=folder&contextId=${FOLDER_ID}&offset=-1`,
      ),
    );
    expect(res.status).toBe(403);
    expect(canAccessFolderMock).toHaveBeenCalledWith(FOLDER_ID, USER_ID);
    expect(canReadThreadMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pins where/params/columns to the requested context server-side", async () => {
    canReadThreadMock.mockResolvedValue(true);
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(
        `table=asafe_presence&contextType=thread&contextId=${THREAD_ID}&offset=-1`,
      ),
    );
    expect(res.status).toBe(200);
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get("table")).toBe("asafe_presence");
    expect(upstream.searchParams.get("where")).toBe(
      `"context_type" = $1 AND "context_id" = $2`,
    );
    expect(upstream.searchParams.get("params[1]")).toBe("thread");
    expect(upstream.searchParams.get("params[2]")).toBe(THREAD_ID);
    expect(upstream.searchParams.get("columns")).toBe(
      "id,user_id,context_type,context_id,last_seen_at,typing",
    );
  });

  it("ignores client-supplied where/columns (cannot widen the shape)", async () => {
    canAccessFolderMock.mockResolvedValue(true);
    const { GET } = await import("./route");
    await GET(
      makeRequest(
        `table=asafe_presence&contextType=folder&contextId=${FOLDER_ID}&offset=-1` +
          `&where=${encodeURIComponent("1=1")}&params[1]=evil&columns=*`,
      ),
    );
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get("where")).toBe(
      `"context_type" = $1 AND "context_id" = $2`,
    );
    expect(upstream.searchParams.get("params[1]")).toBe("folder");
    expect(upstream.searchParams.get("params[2]")).toBe(FOLDER_ID);
    expect(upstream.searchParams.get("columns")).toBe(
      "id,user_id,context_type,context_id,last_seen_at,typing",
    );
  });
});

describe("GET /api/realtime/shape — protocol passthrough", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
    canReadThreadMock.mockResolvedValue(true);
  });

  it("forwards the Electric protocol params (offset, handle, live, cursor)", async () => {
    const { GET } = await import("./route");
    await GET(
      makeRequest(
        `table=chat_message&threadId=${THREAD_ID}` +
          `&offset=0_12&handle=103084-17&live=true&cursor=42&live_sse=true`,
      ),
    );
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.searchParams.get("offset")).toBe("0_12");
    expect(upstream.searchParams.get("handle")).toBe("103084-17");
    expect(upstream.searchParams.get("live")).toBe("true");
    expect(upstream.searchParams.get("cursor")).toBe("42");
    expect(upstream.searchParams.get("live_sse")).toBe("true");
  });

  it("preserves electric-* response headers and strips content-encoding/length", async () => {
    fetchMock.mockResolvedValue(
      mockElectricResponse({
        headers: {
          "electric-handle": "103084-17",
          "electric-offset": "0_12",
          "electric-schema": `{"id":{"type":"text"}}`,
          "content-encoding": "gzip",
        },
      }),
    );
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=chat_message&threadId=${THREAD_ID}&offset=-1`),
    );
    expect(res.headers.get("electric-handle")).toBe("103084-17");
    expect(res.headers.get("electric-offset")).toBe("0_12");
    expect(res.headers.get("electric-schema")).toBe(`{"id":{"type":"text"}}`);
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-length")).toBeNull();
  });

  it("downgrades public cache-control to private and varies on cookie", async () => {
    fetchMock.mockResolvedValue(
      mockElectricResponse({
        headers: { "cache-control": "public, max-age=604800" },
      }),
    );
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=chat_message&threadId=${THREAD_ID}&offset=-1`),
    );
    expect(res.headers.get("cache-control")).toBe("private, max-age=604800");
    expect(res.headers.get("vary")).toContain("cookie");
  });

  it("propagates Electric error statuses (e.g. 409 must-refetch)", async () => {
    fetchMock.mockResolvedValue(mockElectricResponse({ status: 409 }));
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest(`table=chat_message&threadId=${THREAD_ID}&offset=0_12`),
    );
    expect(res.status).toBe(409);
  });

  it("targets ELECTRIC_URL when configured", async () => {
    vi.stubEnv("ELECTRIC_URL", "http://electric.internal:4444");
    const { GET } = await import("./route");
    await GET(makeRequest(`table=agent_session&offset=-1`));
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.origin).toBe("http://electric.internal:4444");
  });
});
