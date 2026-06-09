import { describe, it, expect } from "vitest";
import { detectConfigChanges } from "./mcp-config-diff";
import type { MCPServerConfig } from "app-types/mcp";

describe("MCP Config Diff", () => {
  describe("detectConfigChanges", () => {
    it("should detect added configurations", () => {
      const prev: Record<string, MCPServerConfig> = {};
      const next: Record<string, MCPServerConfig> = {
        newConfig: {
          url: "https://example.com/sse",
        },
      };

      const changes = detectConfigChanges(prev, next);
      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual({
        type: "add",
        key: "newConfig",
        value: {
          url: "https://example.com/sse",
        },
      });
    });

    it("should detect removed configurations", () => {
      const prev: Record<string, MCPServerConfig> = {
        oldConfig: {
          command: "python3",
        },
      };
      const next: Record<string, MCPServerConfig> = {};

      const changes = detectConfigChanges(prev, next);
      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual({
        type: "remove",
        key: "oldConfig",
        value: {
          command: "python3",
        },
      });
    });

    it("should detect updated configurations", () => {
      const prev: Record<string, MCPServerConfig> = {
        config: {
          url: "https://old-example.com/sse",
        },
      };
      const next: Record<string, MCPServerConfig> = {
        config: {
          url: "https://new-example.com/sse",
        },
      };

      const changes = detectConfigChanges(prev, next);
      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual({
        type: "update",
        key: "config",
        value: {
          url: "https://new-example.com/sse",
        },
      });
    });

    it("should detect multiple changes", () => {
      const prev: Record<string, MCPServerConfig> = {
        config1: {
          url: "https://example.com/sse1",
        },
        config2: {
          command: "python",
        },
      };
      const next: Record<string, MCPServerConfig> = {
        config1: {
          url: "https://example.com/sse1-updated",
        },
        config3: {
          command: "node",
        },
      };

      const changes = detectConfigChanges(prev, next);
      expect(changes.length).toBe(3);

      // Check that we have one of each type of change
      const changeTypes = changes.map((change) => change.type);
      expect(changeTypes).toContain("add");
      expect(changeTypes).toContain("remove");
      expect(changeTypes).toContain("update");

      // Verify the specific changes
      const addChange = changes.find((change) => change.type === "add");
      expect(addChange?.key).toBe("config3");

      const removeChange = changes.find((change) => change.type === "remove");
      expect(removeChange?.key).toBe("config2");

      const updateChange = changes.find((change) => change.type === "update");
      expect(updateChange?.key).toBe("config1");
    });

    it("should not detect changes for identical configurations", () => {
      const config: Record<string, MCPServerConfig> = {
        config: {
          url: "https://example.com/sse",
        },
      };

      const changes = detectConfigChanges(config, { ...config });
      expect(changes.length).toBe(0);
    });

    it("should throw error for invalid configurations", () => {
      const prev: Record<string, unknown> = {};
      const next: Record<string, unknown> = {
        invalidConfig: {
          type: "invalid",
        },
      };

      expect(() => detectConfigChanges(prev, next)).toThrow();
    });

    it("returns empty array when both prev and next are empty", () => {
      expect(detectConfigChanges({}, {})).toHaveLength(0);
    });

    it("no changes when config url is identical", () => {
      const cfg = { url: "https://same.com/sse" };
      expect(detectConfigChanges({ a: cfg }, { a: cfg })).toHaveLength(0);
    });

    it("add change has correct type and key", () => {
      const changes = detectConfigChanges({}, { myServer: { url: "https://new.com" } });
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("add");
      expect(changes[0].key).toBe("myServer");
    });

    it("remove change has correct type and key", () => {
      const changes = detectConfigChanges({ myServer: { url: "https://old.com" } }, {});
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("remove");
      expect(changes[0].key).toBe("myServer");
    });

    it("update change contains the new value", () => {
      const changes = detectConfigChanges(
        { s: { url: "https://old.com" } },
        { s: { url: "https://new.com" } },
      );
      expect(changes[0].type).toBe("update");
      expect((changes[0].value as any).url).toBe("https://new.com");
    });
  });
});

describe("detectConfigChanges — additional invariants", () => {
  it("always returns an array", () => {
    const changes = detectConfigChanges({}, {});
    expect(Array.isArray(changes)).toBe(true);
  });

  it("returns three changes when one added, one removed, one updated", () => {
    const prev: Record<string, MCPServerConfig> = {
      a: { url: "https://a.com" },
      b: { command: "py" },
    };
    const next: Record<string, MCPServerConfig> = {
      a: { url: "https://a-new.com" },
      c: { url: "https://c.com" },
    };
    const changes = detectConfigChanges(prev, next);
    expect(changes).toHaveLength(3);
  });

  it("each change object has type, key, and value properties", () => {
    const changes = detectConfigChanges({}, { s: { url: "https://s.com" } });
    expect(changes[0]).toHaveProperty("type");
    expect(changes[0]).toHaveProperty("key");
    expect(changes[0]).toHaveProperty("value");
  });

  it("remove change value matches the original config", () => {
    const cfg: MCPServerConfig = { command: "node" };
    const changes = detectConfigChanges({ srv: cfg }, {});
    expect(changes[0].value).toEqual(cfg);
  });
});
