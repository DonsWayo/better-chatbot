import { describe, it, expect, vi, beforeEach } from "vitest";

const redisMock = {
  get: vi.fn(),
  set: vi.fn(),
  psetex: vi.fn(),
  exists: vi.fn(),
  del: vi.fn(),
  flushdb: vi.fn(),
  keys: vi.fn(),
  mget: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("ioredis", () => ({
  default: vi.fn(() => redisMock),
}));

vi.mock("logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { RedisCache } from "./redis-cache";

describe("RedisCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue("OK");
    redisMock.psetex.mockResolvedValue("OK");
    redisMock.exists.mockResolvedValue(0);
    redisMock.del.mockResolvedValue(1);
    redisMock.flushdb.mockResolvedValue("OK");
    redisMock.keys.mockResolvedValue([]);
    redisMock.mget.mockResolvedValue([]);
    redisMock.disconnect.mockReturnValue(undefined);
  });

  describe("constructor", () => {
    it("creates instance with default options", () => {
      const cache = new RedisCache();
      expect(cache).toBeInstanceOf(RedisCache);
    });

    it("creates instance with keyPrefix", () => {
      const cache = new RedisCache({ keyPrefix: "test:" });
      expect(cache).toBeInstanceOf(RedisCache);
    });

    it("creates instance with defaultTtlMs", () => {
      const cache = new RedisCache({ defaultTtlMs: 60_000 });
      expect(cache).toBeInstanceOf(RedisCache);
    });

    it("creates instance with redisUrl", () => {
      const cache = new RedisCache({ redisUrl: "redis://localhost:6379" });
      expect(cache).toBeInstanceOf(RedisCache);
    });
  });

  describe("get", () => {
    it("returns undefined when key does not exist", async () => {
      redisMock.get.mockResolvedValue(null);
      const cache = new RedisCache();
      const result = await cache.get("missing");
      expect(result).toBeUndefined();
    });

    it("parses JSON value from redis", async () => {
      redisMock.get.mockResolvedValue(JSON.stringify({ foo: "bar" }));
      const cache = new RedisCache();
      const result = await cache.get<{ foo: string }>("key1");
      expect(result).toEqual({ foo: "bar" });
    });

    it("returns raw string when value is not valid JSON", async () => {
      redisMock.get.mockResolvedValue("raw-value");
      const cache = new RedisCache();
      const result = await cache.get<string>("key2");
      expect(result).toBe("raw-value");
    });

    it("prepends keyPrefix to the redis key", async () => {
      redisMock.get.mockResolvedValue(null);
      const cache = new RedisCache({ keyPrefix: "ns:" });
      await cache.get("item");
      expect(redisMock.get).toHaveBeenCalledWith("ns:item");
    });
  });

  describe("set", () => {
    it("calls psetex when finite TTL is provided", async () => {
      const cache = new RedisCache();
      await cache.set("k1", "v1", 5000);
      expect(redisMock.psetex).toHaveBeenCalledWith("k1", 5000, JSON.stringify("v1"));
    });

    it("calls set (no expiry) when TTL is Infinity", async () => {
      const cache = new RedisCache();
      await cache.set("k2", "v2", Infinity);
      expect(redisMock.set).toHaveBeenCalledWith("k2", JSON.stringify("v2"));
      expect(redisMock.psetex).not.toHaveBeenCalled();
    });

    it("uses defaultTtlMs when no TTL arg given and default is finite", async () => {
      const cache = new RedisCache({ defaultTtlMs: 10_000 });
      await cache.set("k3", "v3");
      expect(redisMock.psetex).toHaveBeenCalledWith("k3", 10_000, JSON.stringify("v3"));
    });

    it("calls set with no expiry when defaultTtlMs is Infinity and no TTL arg", async () => {
      const cache = new RedisCache({ defaultTtlMs: Infinity });
      await cache.set("k4", "v4");
      expect(redisMock.set).toHaveBeenCalledWith("k4", JSON.stringify("v4"));
    });

    it("serializes objects as JSON", async () => {
      const cache = new RedisCache();
      await cache.set("obj", { a: 1, b: "two" }, 1000);
      expect(redisMock.psetex).toHaveBeenCalledWith("obj", 1000, JSON.stringify({ a: 1, b: "two" }));
    });

    it("prepends keyPrefix", async () => {
      const cache = new RedisCache({ keyPrefix: "p:" });
      await cache.set("key", 42, 100);
      expect(redisMock.psetex).toHaveBeenCalledWith("p:key", 100, JSON.stringify(42));
    });
  });

  describe("has", () => {
    it("returns true when redis exists returns 1", async () => {
      redisMock.exists.mockResolvedValue(1);
      const cache = new RedisCache();
      expect(await cache.has("present")).toBe(true);
    });

    it("returns false when redis exists returns 0", async () => {
      redisMock.exists.mockResolvedValue(0);
      const cache = new RedisCache();
      expect(await cache.has("absent")).toBe(false);
    });

    it("prepends keyPrefix for exists check", async () => {
      redisMock.exists.mockResolvedValue(1);
      const cache = new RedisCache({ keyPrefix: "ns:" });
      await cache.has("thing");
      expect(redisMock.exists).toHaveBeenCalledWith("ns:thing");
    });
  });

  describe("delete", () => {
    it("calls del with the key", async () => {
      const cache = new RedisCache();
      await cache.delete("remove-me");
      expect(redisMock.del).toHaveBeenCalledWith("remove-me");
    });

    it("prepends keyPrefix", async () => {
      const cache = new RedisCache({ keyPrefix: "x:" });
      await cache.delete("item");
      expect(redisMock.del).toHaveBeenCalledWith("x:item");
    });
  });

  describe("clear", () => {
    it("flushes db when no keyPrefix set", async () => {
      const cache = new RedisCache();
      await cache.clear();
      expect(redisMock.flushdb).toHaveBeenCalled();
    });

    it("deletes pattern-matching keys when keyPrefix is set", async () => {
      redisMock.keys.mockResolvedValue(["ns:a", "ns:b"]);
      const cache = new RedisCache({ keyPrefix: "ns:" });
      await cache.clear();
      expect(redisMock.keys).toHaveBeenCalledWith("ns:*");
      expect(redisMock.del).toHaveBeenCalledWith("ns:a", "ns:b");
    });

    it("skips del when pattern-match returns no keys", async () => {
      redisMock.keys.mockResolvedValue([]);
      const cache = new RedisCache({ keyPrefix: "empty:" });
      await cache.clear();
      expect(redisMock.del).not.toHaveBeenCalled();
    });
  });

  describe("getAll", () => {
    it("returns empty map when no keys exist", async () => {
      redisMock.keys.mockResolvedValue([]);
      const cache = new RedisCache();
      const result = await cache.getAll();
      expect(result).toEqual(new Map());
    });

    it("returns map of all key-value pairs", async () => {
      redisMock.keys.mockResolvedValue(["a", "b"]);
      redisMock.mget.mockResolvedValue([JSON.stringify(1), JSON.stringify("two")]);
      const cache = new RedisCache();
      const result = await cache.getAll();
      expect(result.get("a")).toBe(1);
      expect(result.get("b")).toBe("two");
    });

    it("strips keyPrefix from returned map keys", async () => {
      redisMock.keys.mockResolvedValue(["ns:foo", "ns:bar"]);
      redisMock.mget.mockResolvedValue([JSON.stringify("f"), JSON.stringify("b")]);
      const cache = new RedisCache({ keyPrefix: "ns:" });
      const result = await cache.getAll();
      expect(result.has("foo")).toBe(true);
      expect(result.has("bar")).toBe(true);
      expect(result.has("ns:foo")).toBe(false);
    });

    it("skips null values from mget", async () => {
      redisMock.keys.mockResolvedValue(["k1", "k2"]);
      redisMock.mget.mockResolvedValue([JSON.stringify("v1"), null]);
      const cache = new RedisCache();
      const result = await cache.getAll();
      expect(result.has("k1")).toBe(true);
      expect(result.has("k2")).toBe(false);
    });

    it("handles non-JSON values gracefully", async () => {
      redisMock.keys.mockResolvedValue(["raw"]);
      redisMock.mget.mockResolvedValue(["not-json"]);
      const cache = new RedisCache();
      const result = await cache.getAll();
      expect(result.get("raw")).toBe("not-json");
    });
  });

  describe("disconnect", () => {
    it("calls redis.disconnect", async () => {
      const cache = new RedisCache();
      await cache.disconnect();
      expect(redisMock.disconnect).toHaveBeenCalled();
    });
  });
});
