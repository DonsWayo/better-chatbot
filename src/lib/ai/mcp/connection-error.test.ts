import { describe, expect, it } from "vitest";
import {
  MCP_CONNECTION_ERROR_MESSAGE,
  isMcpConnectionError,
} from "./connection-error";

describe("isMcpConnectionError", () => {
  it("detects the QA repro: SSE error + fetch failed + ECONNREFUSED", () => {
    expect(
      isMcpConnectionError(
        new Error(
          "SSE error: TypeError: fetch failed: connect ECONNREFUSED ::1:19999",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    "fetch failed",
    "connect ECONNREFUSED 127.0.0.1:8080",
    "getaddrinfo ENOTFOUND example.invalid",
    "connect ETIMEDOUT",
    "socket hang up",
    "read ECONNRESET",
    "UND_ERR_CONNECT_TIMEOUT",
    "Request timed out",
    "EHOSTUNREACH",
  ])("classifies transport message %j as a connection error", (msg) => {
    expect(isMcpConnectionError(new Error(msg))).toBe(true);
  });

  it("walks the cause chain to find the underlying transport failure", () => {
    const wrapper = new Error("Failed to connect to MCP server");
    (wrapper as { cause?: unknown }).cause = new Error(
      "fetch failed: ECONNREFUSED",
    );
    expect(isMcpConnectionError(wrapper)).toBe(true);
  });

  it("handles a plain string error", () => {
    expect(isMcpConnectionError("connect ECONNREFUSED ::1:19999")).toBe(true);
  });

  it("does NOT classify application/validation errors as connection errors", () => {
    expect(
      isMcpConnectionError(
        new Error("A featured MCP server with this name already exists"),
      ),
    ).toBe(false);
    expect(
      isMcpConnectionError(
        new Error("Only administrators can register org-wide MCP servers"),
      ),
    ).toBe(false);
    expect(
      isMcpConnectionError(
        new Error("Name must contain only alphanumeric characters"),
      ),
    ).toBe(false);
  });

  it("returns false for null / empty / non-error inputs", () => {
    expect(isMcpConnectionError(null)).toBe(false);
    expect(isMcpConnectionError(undefined)).toBe(false);
    expect(isMcpConnectionError(new Error(""))).toBe(false);
    expect(isMcpConnectionError({})).toBe(false);
  });

  it("does not loop forever on a self-referential cause chain", () => {
    const e = new Error("boom") as Error & { cause?: unknown };
    e.cause = e;
    expect(() => isMcpConnectionError(e)).not.toThrow();
  });

  it("exposes a stable user-safe message constant", () => {
    expect(MCP_CONNECTION_ERROR_MESSAGE).toMatch(/could not connect/i);
    expect(MCP_CONNECTION_ERROR_MESSAGE).not.toMatch(/ECONNREFUSED|fetch/i);
  });
});
