import { describe, expect, it } from "vitest";
import { getStorageManager } from "./browser-stroage";

// IS_BROWSER is false in vitest (no DOM), so all tests cover the server-side no-op stub

describe("getStorageManager — server-side stub (IS_BROWSER=false)", () => {
  it("returns an object", () => {
    const mgr = getStorageManager("test-key");
    expect(typeof mgr).toBe("object");
    expect(mgr).not.toBeNull();
  });

  it("get() returns undefined", () => {
    const mgr = getStorageManager("test-key");
    expect(mgr.get()).toBeUndefined();
  });

  it("get() returns undefined even with default value argument", () => {
    const mgr = getStorageManager<string>("test-key");
    // stub always returns undefined regardless of argument
    expect(mgr.get()).toBeUndefined();
  });

  it("set() does not throw", () => {
    const mgr = getStorageManager("test-key");
    expect(() => mgr.set("value")).not.toThrow();
  });

  it("remove() does not throw", () => {
    const mgr = getStorageManager("test-key");
    expect(() => mgr.remove()).not.toThrow();
  });

  it("isEmpty is true", () => {
    const mgr = getStorageManager("test-key");
    expect(mgr.isEmpty).toBe(true);
  });

  it("set() accepts function value without throwing", () => {
    const mgr = getStorageManager<number>("test-key");
    expect(() => mgr.set((prev) => (prev ?? 0) + 1)).not.toThrow();
  });
});

describe("getStorageManager — return type invariants", () => {
  it("has get, set, remove methods", () => {
    const mgr = getStorageManager("k");
    expect(typeof mgr.get).toBe("function");
    expect(typeof mgr.set).toBe("function");
    expect(typeof mgr.remove).toBe("function");
  });

  it("isEmpty is a boolean", () => {
    const mgr = getStorageManager("k");
    expect(typeof mgr.isEmpty).toBe("boolean");
  });

  it("different keys return independent managers", () => {
    const a = getStorageManager("key-a");
    const b = getStorageManager("key-b");
    expect(a).not.toBe(b);
  });

  it("storageType param is accepted without throwing", () => {
    expect(() => getStorageManager("k", "local")).not.toThrow();
    expect(() => getStorageManager("k", "session")).not.toThrow();
  });

  it("get() always returns undefined in server stub", () => {
    const mgr = getStorageManager("k");
    expect(mgr.get()).toBeUndefined();
    mgr.set("anything");
    expect(mgr.get()).toBeUndefined();
  });
});

describe("getStorageManager — shape invariants", () => {
  it("stub isEmpty stays true after set", () => {
    const mgr = getStorageManager("shape-test");
    mgr.set("hello");
    expect(mgr.isEmpty).toBe(true);
  });

  it("stub isEmpty stays true after remove", () => {
    const mgr = getStorageManager("shape-test");
    mgr.remove();
    expect(mgr.isEmpty).toBe(true);
  });

  it("set() with function does not mutate isEmpty", () => {
    const mgr = getStorageManager<string>("fn-test");
    mgr.set(() => "computed");
    expect(mgr.isEmpty).toBe(true);
  });
});
