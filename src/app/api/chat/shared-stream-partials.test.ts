import { describe, expect, it, vi } from "vitest";
import {
  PARTIAL_PERSIST_INTERVAL_MS,
  STREAMING_FLAG_STALE_MS,
  createPartialPersister,
  isActivelyStreaming,
  shouldPersistPartial,
} from "./shared-stream-partials";

/** Flush the microtask queue (the shared gate resolves via promises). */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("shouldPersistPartial", () => {
  it("persists immediately when nothing has been written yet", () => {
    expect(shouldPersistPartial(null, 0)).toBe(true);
    expect(shouldPersistPartial(null, 123_456)).toBe(true);
  });

  it("throttles writes inside the interval", () => {
    const last = 10_000;
    expect(shouldPersistPartial(last, last + 1)).toBe(false);
    expect(
      shouldPersistPartial(last, last + PARTIAL_PERSIST_INTERVAL_MS - 1),
    ).toBe(false);
  });

  it("allows a write exactly at and after the interval boundary", () => {
    const last = 10_000;
    expect(shouldPersistPartial(last, last + PARTIAL_PERSIST_INTERVAL_MS)).toBe(
      true,
    );
    expect(
      shouldPersistPartial(last, last + PARTIAL_PERSIST_INTERVAL_MS + 500),
    ).toBe(true);
  });

  it("honors a custom interval", () => {
    expect(shouldPersistPartial(0, 999, 1_000)).toBe(false);
    expect(shouldPersistPartial(0, 1_000, 1_000)).toBe(true);
  });
});

describe("isActivelyStreaming", () => {
  const now = 1_000_000;

  it("is false without metadata or without the streaming flag", () => {
    expect(isActivelyStreaming(null, now)).toBe(false);
    expect(isActivelyStreaming(undefined, now)).toBe(false);
    expect(isActivelyStreaming({}, now)).toBe(false);
    expect(isActivelyStreaming({ streaming: false }, now)).toBe(false);
  });

  it("is true while the flag is fresh", () => {
    expect(
      isActivelyStreaming({ streaming: true, streamingAt: now }, now),
    ).toBe(true);
    expect(
      isActivelyStreaming(
        { streaming: true, streamingAt: now - STREAMING_FLAG_STALE_MS },
        now,
      ),
    ).toBe(true);
  });

  it("ages out stale flags from crashed streams", () => {
    expect(
      isActivelyStreaming(
        { streaming: true, streamingAt: now - STREAMING_FLAG_STALE_MS - 1 },
        now,
      ),
    ).toBe(false);
  });

  it("never renders a flag without a timestamp (cannot age out → not shown)", () => {
    expect(isActivelyStreaming({ streaming: true }, now)).toBe(false);
  });
});

describe("createPartialPersister", () => {
  function setup(opts?: {
    shared?: boolean | Promise<boolean>;
    persist?: (text: string) => Promise<unknown>;
  }) {
    const isShared = vi.fn(() => Promise.resolve(opts?.shared ?? true));
    const persist = vi.fn(opts?.persist ?? (() => Promise.resolve()));
    const onError = vi.fn();
    let nowMs = 0;
    const persister = createPartialPersister({
      isShared: isShared as () => Promise<boolean>,
      persist,
      onError,
      now: () => nowMs,
    });
    return {
      isShared,
      persist,
      onError,
      persister,
      advance: (ms: number) => {
        nowMs += ms;
      },
    };
  }

  it("never persists before the shared gate has resolved", async () => {
    const { persister, persist } = setup();
    persister.append("hello");
    expect(persist).not.toHaveBeenCalled();
  });

  it("persists the accumulated text once the gate resolves true", async () => {
    const { persister, persist } = setup();
    persister.append("Hel");
    await tick();
    persister.append("lo");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("Hello");
  });

  it("resolves the shared gate exactly once, lazily", async () => {
    const { persister, isShared } = setup();
    expect(isShared).not.toHaveBeenCalled();
    persister.append("a");
    persister.append("b");
    await tick();
    persister.append("c");
    expect(isShared).toHaveBeenCalledTimes(1);
  });

  it("zero writes for non-shared threads", async () => {
    const { persister, persist } = setup({ shared: false });
    persister.append("a");
    await tick();
    persister.append("b");
    persister.append("c");
    await tick();
    expect(persist).not.toHaveBeenCalled();
  });

  it("treats a rejected shared check as not shared (fail closed)", async () => {
    const { persister, persist } = setup({
      shared: Promise.reject(new Error("db down")) as unknown as boolean,
    });
    persister.append("a");
    await tick();
    persister.append("b");
    await tick();
    expect(persist).not.toHaveBeenCalled();
  });

  it("throttles to one write per interval, accumulating text in between", async () => {
    const { persister, persist, advance } = setup();
    persister.append("1");
    await tick();

    persister.append("2"); // first eligible write
    advance(1_000);
    persister.append("3"); // inside the window — buffered only
    advance(1_000);
    persister.append("4"); // still inside
    advance(PARTIAL_PERSIST_INTERVAL_MS);
    persister.append("5"); // window elapsed — second write

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenNthCalledWith(1, "12");
    expect(persist).toHaveBeenNthCalledWith(2, "12345");
  });

  it("persist failures are reported to onError and never thrown", async () => {
    const failure = new Error("write failed");
    const { persister, onError, advance, persist } = setup({
      persist: () => Promise.reject(failure),
    });
    persister.append("a");
    await tick();
    expect(() => persister.append("b")).not.toThrow();
    await tick();
    expect(onError).toHaveBeenCalledWith(failure);

    // a failed write still counts for the throttle (no hot retry loop)
    persister.append("c");
    expect(persist).toHaveBeenCalledTimes(1);
    advance(PARTIAL_PERSIST_INTERVAL_MS);
    persister.append("d");
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("a synchronously-throwing persist is also contained", async () => {
    const failure = new Error("sync boom");
    const persist = vi.fn(() => {
      throw failure;
    });
    const onError = vi.fn();
    const persister = createPartialPersister({
      isShared: () => Promise.resolve(true),
      persist: persist as unknown as (text: string) => Promise<unknown>,
      onError,
      now: () => 0,
    });
    persister.append("a");
    await tick();
    expect(() => persister.append("b")).not.toThrow();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("a synchronously-throwing isShared fails closed", async () => {
    const persist = vi.fn(() => Promise.resolve());
    const persister = createPartialPersister({
      isShared: () => {
        throw new Error("sync boom");
      },
      persist,
      now: () => 0,
    });
    expect(() => persister.append("a")).not.toThrow();
    await tick();
    persister.append("b");
    expect(persist).not.toHaveBeenCalled();
  });
});
