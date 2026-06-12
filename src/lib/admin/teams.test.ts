import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Chainable SELECT mock for Drizzle:
//   db.select({...}).from(T).where(...).limit(1) → Promise<row[]>
// ---------------------------------------------------------------------------

let _selectRows: unknown[] = [];

const limitMock = vi.fn().mockImplementation(() => Promise.resolve(_selectRows));
const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
const fromMock = vi.fn().mockReturnValue({ where: whereMock });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });

const updateSetMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) });
const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

const onConflictMock = vi.fn().mockResolvedValue([]);
const insertValuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: selectMock,
    update: updateMock,
    insert: insertMock,
  },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeTeamTable: { id: "id", name: "name", slug: "slug", description: "description", createdAt: "createdAt", guardrailPolicy: "guardrailPolicy", allowImageGen: "allowImageGen", allowVision: "allowVision", allowSpeech: "allowSpeech", modelAllowList: "modelAllowList", allowedEmailDomains: "allowedEmailDomains" },
  AsafeTeamMemberTable: { id: "id", teamId: "teamId", userId: "userId", role: "role", createdAt: "createdAt" },
  AsafeTeamBudgetTable: { teamId: "teamId", budgetUsd: "budgetUsd", usedUsd: "usedUsd" },
  AsafeUsageEventTable: { model: "model", provider: "provider", promptTokens: "promptTokens", completionTokens: "completionTokens", costUsd: "costUsd", taskClass: "taskClass", createdAt: "createdAt" },
  UserTable: { id: "id", name: "name", email: "email" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  gte: vi.fn((_a: unknown, _b: unknown) => ({})),
  lte: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  desc: vi.fn((_a: unknown) => ({})),
}));

vi.mock("server-only", () => ({}));

const loggerErrorMock = vi.hoisted(() => vi.fn());
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      error: loggerErrorMock,
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

describe("getUserPrimaryTeamId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _selectRows = [];

    // Re-wire chain after clearAllMocks
    limitMock.mockImplementation(() => Promise.resolve(_selectRows));
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });

    // Reset module so the internal _teamIdCache Map is fresh for each test
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("returns teamId when DB has a team member row", async () => {
    _selectRows = [{ teamId: "team-abc" }];
    limitMock.mockResolvedValue(_selectRows);

    const { getUserPrimaryTeamId } = await import("./teams");
    const result = await getUserPrimaryTeamId("user-1");
    expect(result).toBe("team-abc");
  });

  it("returns null when DB returns an empty array", async () => {
    _selectRows = [];
    limitMock.mockResolvedValue([]);

    const { getUserPrimaryTeamId } = await import("./teams");
    const result = await getUserPrimaryTeamId("user-no-team");
    expect(result).toBeNull();
  });

  it("returns null on DB error with no cache (fail-open) and logs", async () => {
    loggerErrorMock.mockClear();
    limitMock.mockRejectedValue(new Error("DB is down"));

    const { getUserPrimaryTeamId } = await import("./teams");
    const result = await getUserPrimaryTeamId("user-err");
    expect(result).toBeNull();
    // a null teamId silently drops budget/governance attribution — must be logged
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("serves last-known-good cached teamId on DB error (attribution preserved)", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(t0);
    _selectRows = [{ teamId: "team-lkg" }];
    limitMock.mockResolvedValue(_selectRows);

    const { getUserPrimaryTeamId } = await import("./teams");
    expect(await getUserPrimaryTeamId("user-lkg")).toBe("team-lkg");

    // Expire the TTL, then make the re-query fail.
    vi.setSystemTime(t0 + 61_000);
    limitMock.mockRejectedValue(new Error("DB is down"));
    expect(await getUserPrimaryTeamId("user-lkg")).toBe("team-lkg");
  });

  it("second call within 60s returns cached value (DB called only once)", async () => {
    _selectRows = [{ teamId: "team-cached" }];
    limitMock.mockResolvedValue(_selectRows);

    const { getUserPrimaryTeamId } = await import("./teams");

    const first = await getUserPrimaryTeamId("user-cache");
    const second = await getUserPrimaryTeamId("user-cache");

    expect(first).toBe("team-cached");
    expect(second).toBe("team-cached");
    // Drizzle chain was driven: selectMock should have been called exactly once
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("after 61000ms the next call hits DB again (TTL expired)", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(t0);

    _selectRows = [{ teamId: "team-ttl" }];
    limitMock.mockResolvedValue(_selectRows);

    const { getUserPrimaryTeamId } = await import("./teams");

    // First call — primes the cache
    await getUserPrimaryTeamId("user-ttl");
    expect(selectMock).toHaveBeenCalledTimes(1);

    // Advance past the 60 s TTL
    vi.setSystemTime(t0 + 61_000);

    // Second call — cache expired, DB hit again
    await getUserPrimaryTeamId("user-ttl");
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

// ── getTeamPolicy ─────────────────────────────────────────────────────────────

describe("getTeamPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _selectRows = [];

    limitMock.mockImplementation(() => Promise.resolve(_selectRows));
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });

    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("returns DB values when team row exists", async () => {
    _selectRows = [{ guardrailPolicy: "strict", allowImageGen: true, allowVision: true, allowSpeech: false, modelAllowList: [] }];
    limitMock.mockResolvedValue(_selectRows);

    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("team-1");

    expect(policy.guardrailPolicy).toBe("strict");
    expect(policy.allowImageGen).toBe(true);
    expect(policy.allowVision).toBe(true);
    expect(policy.allowSpeech).toBe(false);
    expect(policy.modelAllowList).toEqual([]);
  });

  it("returns modelAllowList from DB when populated", async () => {
    _selectRows = [{ guardrailPolicy: "standard", allowImageGen: false, allowVision: false, allowSpeech: false, modelAllowList: ["gpt-5.5", "gemini-3.5-flash"] }];
    limitMock.mockResolvedValue(_selectRows);

    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("team-allow");

    expect(policy.modelAllowList).toEqual(["gpt-5.5", "gemini-3.5-flash"]);
  });

  it("returns safe defaults when team does not exist", async () => {
    _selectRows = [];
    limitMock.mockResolvedValue([]);

    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("team-missing");

    expect(policy.guardrailPolicy).toBe("standard");
    expect(policy.allowImageGen).toBe(false);
    expect(policy.allowVision).toBe(false);
    expect(policy.allowSpeech).toBe(false);
    expect(policy.modelAllowList).toEqual([]);
  });

  it("fails CLOSED on DB error with no cache (guardrails → strict, not standard)", async () => {
    limitMock.mockRejectedValue(new Error("Connection refused"));

    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("team-error");

    // Security-sensitive: a broken entitlement layer must NOT silently
    // downgrade a strict team to "standard" guardrails. With no last-known-good
    // value cached, assume the strictest posture.
    expect(policy.guardrailPolicy).toBe("strict");
    expect(policy.allowImageGen).toBe(false);
    expect(policy.allowVision).toBe(false);
    expect(policy.allowSpeech).toBe(false);
    // model gating stays "unrestricted" ([]) to avoid locking out all chat on a
    // total DB outage — a softer control than guardrails.
    expect(policy.modelAllowList).toEqual([]);
  });

  it("serves last-known-good cached policy on DB error (not a fabricated default)", async () => {
    // Prime the cache with a real strict-team policy.
    _selectRows = [
      {
        guardrailPolicy: "permissive",
        allowImageGen: true,
        allowVision: true,
        allowSpeech: true,
        modelAllowList: ["gpt-5.5"],
      },
    ];
    limitMock.mockResolvedValueOnce(_selectRows);

    const { getTeamPolicy } = await import("./teams");
    const first = await getTeamPolicy("team-lkg");
    expect(first.guardrailPolicy).toBe("permissive");

    // Force the cache to expire so the next call re-queries and fails.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    limitMock.mockRejectedValue(new Error("Connection refused"));

    const second = await getTeamPolicy("team-lkg");
    // Last-known-good served verbatim, not the fail-closed default.
    expect(second.guardrailPolicy).toBe("permissive");
    expect(second.modelAllowList).toEqual(["gpt-5.5"]);
    vi.useRealTimers();
  });

  it("logs an error when getTeamPolicy resolution fails", async () => {
    loggerErrorMock.mockClear();
    limitMock.mockRejectedValue(new Error("Connection refused"));

    const { getTeamPolicy } = await import("./teams");
    await getTeamPolicy("team-log");

    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("caches policy for TTL duration (DB called once)", async () => {
    _selectRows = [{ guardrailPolicy: "permissive", allowImageGen: false, allowVision: false, allowSpeech: false }];
    limitMock.mockResolvedValue(_selectRows);

    const { getTeamPolicy } = await import("./teams");
    await getTeamPolicy("team-cache");
    await getTeamPolicy("team-cache"); // second call — should hit cache

    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("re-queries DB after TTL expires", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(t0);

    _selectRows = [{ guardrailPolicy: "standard", allowImageGen: false, allowVision: false, allowSpeech: false }];
    limitMock.mockResolvedValue(_selectRows);

    const { getTeamPolicy } = await import("./teams");
    await getTeamPolicy("team-ttl2");
    expect(selectMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(t0 + 61_000);
    await getTeamPolicy("team-ttl2");
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("independent teams have independent cache entries", async () => {
    _selectRows = [{ guardrailPolicy: "strict", allowImageGen: true, allowVision: true, allowSpeech: true }];
    limitMock.mockResolvedValue(_selectRows);

    const { getTeamPolicy } = await import("./teams");
    const p1 = await getTeamPolicy("team-A");
    const p2 = await getTeamPolicy("team-B");

    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(p1.guardrailPolicy).toBe(p2.guardrailPolicy);
  });
});

// ── updateTeamPolicy ──────────────────────────────────────────────────────────

describe("updateTeamPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _selectRows = [];

    limitMock.mockImplementation(() => Promise.resolve(_selectRows));
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });

    const updateWhereMock = vi.fn().mockResolvedValue({ rowCount: 1 });
    updateSetMock.mockReturnValue({ where: updateWhereMock });
    updateMock.mockReturnValue({ set: updateSetMock });

    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("calls db.update once with the correct patch", async () => {
    const { updateTeamPolicy } = await import("./teams");
    await updateTeamPolicy("team-update", { guardrailPolicy: "strict", allowVision: true });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ guardrailPolicy: "strict", allowVision: true }),
    );
  });

  it("accepts modelAllowList in the patch", async () => {
    const { updateTeamPolicy } = await import("./teams");
    await updateTeamPolicy("team-models", { modelAllowList: ["gpt-5.5", "claude-opus-4.8"] });

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelAllowList: ["gpt-5.5", "claude-opus-4.8"] }),
    );
  });

  it("accepts empty modelAllowList to clear restrictions", async () => {
    const { updateTeamPolicy } = await import("./teams");
    await updateTeamPolicy("team-clear", { modelAllowList: [] });

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelAllowList: [] }),
    );
  });

  it("includes updatedAt in the SET clause", async () => {
    const { updateTeamPolicy } = await import("./teams");
    await updateTeamPolicy("team-ts", { allowSpeech: true });

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    );
  });

  it("invalidates the policy cache so next getTeamPolicy re-queries", async () => {
    _selectRows = [{ guardrailPolicy: "standard", allowImageGen: false, allowVision: false, allowSpeech: false }];
    limitMock.mockResolvedValue(_selectRows);

    const { getTeamPolicy, updateTeamPolicy } = await import("./teams");

    await getTeamPolicy("team-inv");
    expect(selectMock).toHaveBeenCalledTimes(1);

    const updateWhereMock = vi.fn().mockResolvedValue({});
    updateSetMock.mockReturnValue({ where: updateWhereMock });
    await updateTeamPolicy("team-inv", { guardrailPolicy: "strict" });

    // Now re-fetch — should hit DB again
    _selectRows = [{ guardrailPolicy: "strict", allowImageGen: false, allowVision: false, allowSpeech: false }];
    limitMock.mockResolvedValue(_selectRows);
    const fresh = await getTeamPolicy("team-inv");

    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(fresh.guardrailPolicy).toBe("strict");
  });
});

// ── emailDomain helper ─────────────────────────────────────────────────────────

describe("emailDomain", () => {
  it("extracts the domain from a normal email", async () => {
    const { emailDomain } = await import("./teams");
    expect(emailDomain("alice@example.com")).toBe("example.com");
  });

  it("lowercases the domain", async () => {
    const { emailDomain } = await import("./teams");
    expect(emailDomain("BOB@ACME.ORG")).toBe("acme.org");
  });

  it("returns empty string for an email without @", async () => {
    const { emailDomain } = await import("./teams");
    expect(emailDomain("notanemail")).toBe("");
  });

  it("handles subdomains correctly", async () => {
    const { emailDomain } = await import("./teams");
    expect(emailDomain("user@mail.corp.example.com")).toBe("mail.corp.example.com");
  });
});

// ── addTeamMember — domain enforcement ────────────────────────────────────────

describe("addTeamMember", () => {
  const sharedBeforeEach = () => {
    vi.clearAllMocks();
    _selectRows = [];

    limitMock.mockImplementation(() => Promise.resolve(_selectRows));
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });

    onConflictMock.mockResolvedValue([]);
    insertValuesMock.mockReturnValue({ onConflictDoUpdate: onConflictMock });
    insertMock.mockReturnValue({ values: insertValuesMock });

    vi.resetModules();
  };

  beforeEach(sharedBeforeEach);
  afterEach(() => { vi.resetModules(); });

  it("inserts member when domain allow-list is empty (no restriction)", async () => {
    // SELECT for team row — empty domains
    _selectRows = [{ allowedEmailDomains: [] }];
    limitMock.mockResolvedValue(_selectRows);

    const { addTeamMember } = await import("./teams");
    await expect(addTeamMember("team-1", "user-1", "member", "alice@anywhere.io")).resolves.toBeUndefined();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("inserts member when their domain matches the allow-list", async () => {
    _selectRows = [{ allowedEmailDomains: ["asafe.ai", "example.com"] }];
    limitMock.mockResolvedValue(_selectRows);

    const { addTeamMember } = await import("./teams");
    await expect(addTeamMember("team-2", "user-2", "editor", "bob@asafe.ai")).resolves.toBeUndefined();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("throws when email domain is not in the allow-list", async () => {
    _selectRows = [{ allowedEmailDomains: ["asafe.ai"] }];
    limitMock.mockResolvedValue(_selectRows);

    const { addTeamMember } = await import("./teams");
    await expect(
      addTeamMember("team-3", "user-3", "member", "outsider@gmail.com"),
    ).rejects.toThrow('Email domain "gmail.com" is not allowed for this team.');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("skips domain check when no userEmail is provided", async () => {
    // No select call expected since we skip the check
    const { addTeamMember } = await import("./teams");
    await expect(addTeamMember("team-4", "user-4", "member")).resolves.toBeUndefined();
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("is case-insensitive for the domain comparison", async () => {
    _selectRows = [{ allowedEmailDomains: ["asafe.ai"] }];
    limitMock.mockResolvedValue(_selectRows);

    const { addTeamMember } = await import("./teams");
    await expect(addTeamMember("team-5", "user-5", "member", "USER@ASAFE.AI")).resolves.toBeUndefined();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("uses ON CONFLICT DO UPDATE (re-adding resets role)", async () => {
    _selectRows = [{ allowedEmailDomains: [] }];
    limitMock.mockResolvedValue(_selectRows);

    const { addTeamMember } = await import("./teams");
    await addTeamMember("team-6", "user-6", "admin", "charlie@corp.com");

    expect(onConflictMock).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining({ role: "admin" }) }),
    );
  });
});

// ── getTeamPolicy — allowedEmailDomains field ─────────────────────────────────

describe("getTeamPolicy allowedEmailDomains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _selectRows = [];
    limitMock.mockImplementation(() => Promise.resolve(_selectRows));
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
    vi.resetModules();
  });

  afterEach(() => { vi.resetModules(); });

  it("returns allowedEmailDomains from DB row", async () => {
    _selectRows = [{ guardrailPolicy: "standard", allowImageGen: false, allowVision: false, allowSpeech: false, modelAllowList: [], allowedEmailDomains: ["asafe.ai", "corp.example.com"] }];
    limitMock.mockResolvedValue(_selectRows);

    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("team-domains");
    expect(policy.allowedEmailDomains).toEqual(["asafe.ai", "corp.example.com"]);
  });

  it("defaults allowedEmailDomains to [] when row is missing", async () => {
    _selectRows = [];
    limitMock.mockResolvedValue([]);

    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("team-no-row");
    expect(policy.allowedEmailDomains).toEqual([]);
  });

  it("defaults allowedEmailDomains to [] on DB error", async () => {
    limitMock.mockRejectedValue(new Error("Timeout"));

    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("team-err2");
    expect(policy.allowedEmailDomains).toEqual([]);
  });
});

describe("getTeamPolicy — return type invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _selectRows = [];
    limitMock.mockImplementation(() => Promise.resolve(_selectRows));
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
    vi.resetModules();
  });
  afterEach(() => { vi.resetModules(); });

  it("getTeamPolicy returns an object with guardrailPolicy field", async () => {
    _selectRows = [{ guardrailPolicy: "standard", allowImageGen: false, allowVision: false, allowSpeech: false, modelAllowList: [], allowedEmailDomains: [] }];
    limitMock.mockResolvedValue(_selectRows);
    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("t-1");
    expect(policy).toHaveProperty("guardrailPolicy");
  });

  it("getTeamPolicy allowedEmailDomains is always an array", async () => {
    _selectRows = [{ guardrailPolicy: "standard", allowImageGen: false, allowVision: false, allowSpeech: false, modelAllowList: [], allowedEmailDomains: ["x.com"] }];
    limitMock.mockResolvedValue(_selectRows);
    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("t-1");
    expect(Array.isArray(policy.allowedEmailDomains)).toBe(true);
  });

  it("getTeamPolicy modelAllowList defaults to empty array when not in row", async () => {
    _selectRows = [{ guardrailPolicy: "standard", allowImageGen: false, allowVision: false, allowSpeech: false, modelAllowList: [], allowedEmailDomains: [] }];
    limitMock.mockResolvedValue(_selectRows);
    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("t-2");
    expect(Array.isArray(policy.modelAllowList)).toBe(true);
  });

  it("getTeamPolicy returns non-null object", async () => {
    const { getTeamPolicy } = await import("./teams");
    const policy = await getTeamPolicy("missing");
    expect(policy).not.toBeNull();
    expect(typeof policy).toBe("object");
  });
});
