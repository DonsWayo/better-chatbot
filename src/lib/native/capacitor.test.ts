import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initNativeBridge,
  isNativeCapacitor,
  resetNativeBridgeForTesting,
} from "./capacitor";

// The bridge must be a guaranteed no-op outside the Capacitor native shell:
// no window (SSR), a plain browser window, or a window whose Capacitor
// global reports a non-native platform (Capacitor's web shim).

afterEach(() => {
  vi.unstubAllGlobals();
  resetNativeBridgeForTesting();
});

describe("initNativeBridge (web no-op path)", () => {
  it("no-ops without a window (SSR)", async () => {
    // vitest node environment: no window global at all
    expect(typeof window).toBe("undefined");
    await expect(initNativeBridge()).resolves.toBe(false);
  });

  it("no-ops in a plain browser window without Capacitor", async () => {
    vi.stubGlobal("window", { history: { length: 1 } });
    await expect(initNativeBridge()).resolves.toBe(false);
    expect(isNativeCapacitor()).toBe(false);
  });

  it("no-ops when Capacitor reports a non-native platform (web shim)", async () => {
    vi.stubGlobal("window", {
      history: { length: 1 },
      Capacitor: {
        isNativePlatform: () => false,
        getPlatform: () => "web",
        Plugins: {},
      },
    });
    await expect(initNativeBridge()).resolves.toBe(false);
    expect(isNativeCapacitor()).toBe(false);
  });

  it("runs once and applies plugins when native", async () => {
    const hide = vi.fn().mockResolvedValue(undefined);
    const setStyle = vi.fn().mockResolvedValue(undefined);
    const setBackgroundColor = vi.fn().mockResolvedValue(undefined);
    const addListener = vi.fn().mockResolvedValue({
      remove: () => Promise.resolve(),
    });
    vi.stubGlobal("window", {
      history: { length: 1 },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          SplashScreen: { hide },
          StatusBar: { setStyle, setBackgroundColor },
          App: {
            addListener,
            minimizeApp: () => Promise.resolve(),
            exitApp: () => Promise.resolve(),
          },
        },
      },
    });
    await expect(initNativeBridge()).resolves.toBe(true);
    expect(isNativeCapacitor()).toBe(true);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(setBackgroundColor).toHaveBeenCalledWith({ color: "#3ABFC6" });
    expect(addListener).toHaveBeenCalledWith(
      "backButton",
      expect.any(Function),
    );
    // idempotent: second call is a fast-path true, no duplicate listeners
    await expect(initNativeBridge()).resolves.toBe(true);
    expect(addListener).toHaveBeenCalledTimes(1);
  });
});
