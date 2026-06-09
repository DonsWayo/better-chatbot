import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OUTPUT_HANDLERS, safePythonRun } from "./safe-python-run";

const makePyodideMock = () => {
  const stdoutBatched = vi.fn();
  const stderrBatched = vi.fn();
  let capturedStdout: ((s: string) => void) | null = null;
  let capturedStderr: ((s: string) => void) | null = null;

  return {
    setStdout: vi.fn(({ batched }: { batched: (s: string) => void }) => {
      capturedStdout = batched;
    }),
    setStderr: vi.fn(({ batched }: { batched: (s: string) => void }) => {
      capturedStderr = batched;
    }),
    loadPackagesFromImports: vi.fn().mockResolvedValue(undefined),
    runPythonAsync: vi.fn().mockResolvedValue(undefined),
    emit: (stream: "stdout" | "stderr", value: string) => {
      if (stream === "stdout") capturedStdout?.(value);
      else capturedStderr?.(value);
    },
  };
};

describe("OUTPUT_HANDLERS", () => {
  it("has a 'basic' handler", () => {
    expect(OUTPUT_HANDLERS).toHaveProperty("basic");
  });

  it("has a 'matplotlib' handler", () => {
    expect(OUTPUT_HANDLERS).toHaveProperty("matplotlib");
  });

  it("basic handler is an empty string", () => {
    expect(OUTPUT_HANDLERS.basic).toBe("");
  });

  it("matplotlib handler contains setup_matplotlib_output", () => {
    expect(OUTPUT_HANDLERS.matplotlib).toContain("setup_matplotlib_output");
  });

  it("matplotlib handler imports plt and io", () => {
    expect(OUTPUT_HANDLERS.matplotlib).toContain("matplotlib");
    expect(OUTPUT_HANDLERS.matplotlib).toContain("io");
    expect(OUTPUT_HANDLERS.matplotlib).toContain("base64");
  });
});

describe("safePythonRun", () => {
  let pyodideMock: ReturnType<typeof makePyodideMock>;

  beforeEach(() => {
    pyodideMock = makePyodideMock();
    const loadFn = vi.fn().mockResolvedValue(pyodideMock);
    (globalThis as Record<string, unknown>).loadPyodide = loadFn;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).loadPyodide;
  });

  it("blocks code with os.system", async () => {
    const result = await safePythonRun({ code: "import os; os.system('ls')" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("os.system");
  });

  it("returns success for safe code", async () => {
    pyodideMock.runPythonAsync.mockResolvedValue(42);
    const result = await safePythonRun({ code: "x = 6 * 7\nprint(x)" });
    expect(result.success).toBe(true);
  });

  it("captures stdout logs", async () => {
    pyodideMock.setStdout.mockImplementation(({ batched }: { batched: (s: string) => void }) => {
      batched("Hello from Python");
    });
    const result = await safePythonRun({ code: "print('Hello from Python')" });
    expect(result.success).toBe(true);
    expect(result.logs.some((l) => l.args.some((a) => a.value === "Hello from Python"))).toBe(true);
  });

  it("detects image output in stdout", async () => {
    const imageData = "data:image/png;base64,abc123";
    pyodideMock.setStdout.mockImplementation(({ batched }: { batched: (s: string) => void }) => {
      batched(imageData);
    });
    const result = await safePythonRun({ code: "# image output" });
    expect(result.success).toBe(true);
    expect(result.logs.some((l) => l.args.some((a) => a.type === "image"))).toBe(true);
  });

  it("captures stderr logs as error type", async () => {
    pyodideMock.setStderr.mockImplementation(({ batched }: { batched: (s: string) => void }) => {
      batched("NameError: x is not defined");
    });
    const result = await safePythonRun({ code: "print(x)" });
    expect(result.success).toBe(true);
    expect(result.logs.some((l) => l.type === "error")).toBe(true);
  });

  it("calls onLog callback for each log entry", async () => {
    pyodideMock.setStdout.mockImplementation(({ batched }: { batched: (s: string) => void }) => {
      batched("output line");
    });
    const onLog = vi.fn();
    await safePythonRun({ code: "print('hi')", onLog });
    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({ type: "log" }),
    );
  });

  it("returns error result when pyodide throws", async () => {
    (globalThis as Record<string, unknown>).loadPyodide = vi.fn().mockRejectedValue(
      new Error("Pyodide load failed"),
    );
    const result = await safePythonRun({ code: "print('hi')" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Pyodide load failed");
  });

  it("loads matplotlib handler when code uses plt.", async () => {
    pyodideMock.runPythonAsync.mockResolvedValue(undefined);
    await safePythonRun({ code: "import matplotlib\nplt.show()" });
    const calls = pyodideMock.runPythonAsync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c: string) => c.includes("setup_matplotlib_output"))).toBe(true);
  });

  it("does not load matplotlib handler for non-matplotlib code", async () => {
    await safePythonRun({ code: "x = 1 + 1" });
    const calls = pyodideMock.runPythonAsync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c: string) => c.includes("setup_matplotlib_output"))).toBe(false);
  });

  it("returns executionTimeMs", async () => {
    const result = await safePythonRun({ code: "pass" });
    expect(result.success).toBe(true);
    expect(typeof (result as { executionTimeMs?: number }).executionTimeMs).toBe("number");
  });
});
