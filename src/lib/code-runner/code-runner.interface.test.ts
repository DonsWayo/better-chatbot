import { describe, expect, it } from "vitest";
import type {
  LogEntry,
  CodeRunnerResult,
  CodeRunnerOptions,
  CodeWorkerRequest,
  CodeWorkerEvent,
  CodeWorkerResult,
} from "./code-runner.interface";

// Tests verify structural contracts by constructing conforming objects and checking their shape.

describe("LogEntry — shape invariants", () => {
  it("log type entry has type and args", () => {
    const entry: LogEntry = { type: "log", args: [{ type: "data", value: "hello" }] };
    expect(entry.type).toBe("log");
    expect(Array.isArray(entry.args)).toBe(true);
  });

  it("error type entry is valid", () => {
    const entry: LogEntry = { type: "error", args: [] };
    expect(entry.type).toBe("error");
  });

  it("image arg has type 'image' and string value", () => {
    const entry: LogEntry = { type: "log", args: [{ type: "image", value: "data:image/png;base64,abc" }] };
    expect(entry.args[0].type).toBe("image");
  });
});

describe("CodeRunnerResult — shape invariants", () => {
  it("success result has success=true and logs array", () => {
    const result: CodeRunnerResult = { success: true, logs: [] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.logs)).toBe(true);
  });

  it("failure result has success=false and error string", () => {
    const result: CodeRunnerResult = { success: false, logs: [], error: "Syntax error" };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("executionTimeMs is optional", () => {
    const result: CodeRunnerResult = { success: true, logs: [], executionTimeMs: 42 };
    expect(result.executionTimeMs).toBe(42);
  });

  it("result field is optional", () => {
    const r: CodeRunnerResult = { success: true, logs: [], result: { x: 1 } };
    expect(r.result).toEqual({ x: 1 });
  });
});

describe("CodeRunnerOptions — shape invariants", () => {
  it("minimal options has only code", () => {
    const opts: CodeRunnerOptions = { code: "console.log(1)" };
    expect(opts.code).toBe("console.log(1)");
  });

  it("timeout is optional", () => {
    const opts: CodeRunnerOptions = { code: "x", timeout: 5000 };
    expect(opts.timeout).toBe(5000);
  });

  it("onLog callback is optional", () => {
    const logs: string[] = [];
    const opts: CodeRunnerOptions = {
      code: "x",
      onLog: (entry) => logs.push(entry.type),
    };
    opts.onLog?.({ type: "log", args: [] });
    expect(logs).toContain("log");
  });
});

describe("CodeWorkerRequest — shape invariants", () => {
  it("has code, type, id fields", () => {
    const req: CodeWorkerRequest = { code: "print(1)", type: "python", id: "req-1" };
    expect(req.code).toBe("print(1)");
    expect(req.type).toBe("python");
    expect(req.id).toBe("req-1");
  });

  it("type can be javascript", () => {
    const req: CodeWorkerRequest = { code: "1+1", type: "javascript", id: "req-2" };
    expect(req.type).toBe("javascript");
  });
});

describe("CodeWorkerEvent — shape invariants", () => {
  it("is a log event with id, type, entry", () => {
    const evt: CodeWorkerEvent = {
      id: "req-1",
      type: "log",
      entry: { type: "log", args: [{ type: "data", value: "output" }] },
    };
    expect(evt.type).toBe("log");
    expect(evt.id).toBe("req-1");
  });
});

describe("CodeWorkerResult — shape invariants", () => {
  it("has id, type='result', and result field", () => {
    const res: CodeWorkerResult = {
      id: "req-1",
      type: "result",
      result: { success: true, logs: [] },
    };
    expect(res.type).toBe("result");
    expect(res.result.success).toBe(true);
  });
});
