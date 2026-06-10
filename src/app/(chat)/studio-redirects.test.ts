import { describe, expect, it, vi } from "vitest";

// /agents and /workflow now redirect into the Studio tabs.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

function captureRedirect(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("REDIRECT:")) return msg.slice("REDIRECT:".length);
    throw e;
  }
  throw new Error("expected a redirect");
}

describe("Studio redirects", () => {
  it("/agents redirects to /studio (Agents tab)", async () => {
    const { default: Page } = await import("./agents/page");
    expect(captureRedirect(() => Page())).toBe("/studio");
  });

  it("/workflow redirects to /studio?tab=workflows", async () => {
    const { default: Page } = await import("./workflow/page");
    expect(captureRedirect(() => Page())).toBe("/studio?tab=workflows");
  });
});
