import { describe, expect, it, vi } from "vitest";

// redirect() throws a NEXT_REDIRECT control-flow error in Next; here we mock
// it to capture the target URL instead. Each redirect page is the moved
// /mcp* suite pointing at /settings/connectors/*.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

async function captureRedirect(fn: () => Promise<unknown> | unknown) {
  try {
    await fn();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("REDIRECT:")) return msg.slice("REDIRECT:".length);
    throw e;
  }
  throw new Error("expected a redirect");
}

describe("/mcp → /settings/connectors redirects", () => {
  it("/mcp redirects to /settings/connectors", async () => {
    const { default: Page } = await import("./page");
    const target = await captureRedirect(() => Page());
    expect(target).toBe("/settings/connectors");
  });

  it("/mcp/create redirects to /settings/connectors/create (no params)", async () => {
    const { default: Page } = await import("./create/page");
    const target = await captureRedirect(() =>
      Page({ searchParams: Promise.resolve({}) }),
    );
    expect(target).toBe("/settings/connectors/create");
  });

  it("/mcp/create preserves name and config query params", async () => {
    const { default: Page } = await import("./create/page");
    const target = await captureRedirect(() =>
      Page({
        searchParams: Promise.resolve({
          name: "GitHub",
          config: '{"url":"https://example.com"}',
        }),
      }),
    );
    expect(target).toContain("/settings/connectors/create?");
    expect(target).toContain("name=GitHub");
    expect(target).toContain("config=");
  });

  it("/mcp/modify/[id] redirects to /settings/connectors/[id] (encoded)", async () => {
    const { default: Page } = await import("./modify/[id]/page");
    const target = await captureRedirect(() =>
      Page({ params: Promise.resolve({ id: "abc 123" }) }),
    );
    expect(target).toBe("/settings/connectors/abc%20123");
  });

  it("/mcp/test/[id] redirects to /settings/connectors/test/[id] (encoded)", async () => {
    const { default: Page } = await import("./test/[id]/page");
    const target = await captureRedirect(() =>
      Page({ params: Promise.resolve({ id: "abc 123" }) }),
    );
    expect(target).toBe("/settings/connectors/test/abc%20123");
  });
});
