import { describe, it, expect } from "vitest";
import {
  AgentInstructionsSchema,
  AgentCreateSchema,
  AgentUpdateSchema,
  AgentQuerySchema,
} from "./agent";

describe("AgentInstructionsSchema", () => {
  it("accepts empty object", () => {
    expect(() => AgentInstructionsSchema.parse({})).not.toThrow();
  });

  it("accepts full instructions", () => {
    const input = {
      role: "analyst",
      systemPrompt: "You are a data analyst.",
      mentions: [],
    };
    expect(() => AgentInstructionsSchema.parse(input)).not.toThrow();
  });

  it("accepts partial instructions with only role", () => {
    expect(() => AgentInstructionsSchema.parse({ role: "developer" })).not.toThrow();
  });

  it("accepts partial instructions with only systemPrompt", () => {
    expect(() =>
      AgentInstructionsSchema.parse({ systemPrompt: "Be helpful." }),
    ).not.toThrow();
  });
});

describe("AgentCreateSchema", () => {
  const validCreate = {
    name: "Test Agent",
    userId: "user-123",
    instructions: { role: "helper", systemPrompt: "Be helpful." },
  };

  describe("valid inputs", () => {
    it("accepts minimal create payload", () => {
      expect(() => AgentCreateSchema.parse(validCreate)).not.toThrow();
    });

    it("accepts create payload with all optional fields", () => {
      const input = {
        ...validCreate,
        description: "A helpful agent",
        icon: { type: "emoji", value: "🤖" },
        visibility: "public",
      };
      expect(() => AgentCreateSchema.parse(input)).not.toThrow();
    });

    it("defaults visibility to 'private'", () => {
      const result = AgentCreateSchema.parse(validCreate);
      expect(result.visibility).toBe("private");
    });

    it("accepts 'public' visibility", () => {
      const result = AgentCreateSchema.parse({ ...validCreate, visibility: "public" });
      expect(result.visibility).toBe("public");
    });

    it("accepts icon with style record", () => {
      const input = {
        ...validCreate,
        icon: { type: "emoji", value: "🔬", style: { color: "blue" } },
      };
      expect(() => AgentCreateSchema.parse(input)).not.toThrow();
    });

    it("strips unknown fields (schema is .strip())", () => {
      const input = { ...validCreate, unknownField: "should-be-removed" };
      const result = AgentCreateSchema.parse(input);
      expect("unknownField" in result).toBe(false);
    });
  });

  describe("invalid inputs", () => {
    it("rejects name that is empty string", () => {
      expect(() => AgentCreateSchema.parse({ ...validCreate, name: "" })).toThrow();
    });

    it("rejects name longer than 100 characters", () => {
      expect(() =>
        AgentCreateSchema.parse({ ...validCreate, name: "a".repeat(101) }),
      ).toThrow();
    });

    it("rejects description longer than 8000 characters", () => {
      expect(() =>
        AgentCreateSchema.parse({
          ...validCreate,
          description: "x".repeat(8001),
        }),
      ).toThrow();
    });

    it("rejects missing userId", () => {
      const { userId: _, ...noUser } = validCreate;
      expect(() => AgentCreateSchema.parse(noUser)).toThrow();
    });

    it("rejects missing instructions", () => {
      const { instructions: _, ...noInstructions } = validCreate;
      expect(() => AgentCreateSchema.parse(noInstructions)).toThrow();
    });
  });
});

describe("AgentUpdateSchema", () => {
  it("accepts empty update payload", () => {
    expect(() => AgentUpdateSchema.parse({})).not.toThrow();
  });

  it("accepts partial update with name only", () => {
    expect(() => AgentUpdateSchema.parse({ name: "New Name" })).not.toThrow();
  });

  it("accepts partial update with visibility", () => {
    expect(() => AgentUpdateSchema.parse({ visibility: "public" })).not.toThrow();
  });

  it("strips unknown fields", () => {
    const result = AgentUpdateSchema.parse({ name: "n", extra: "x" });
    expect("extra" in result).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    expect(() => AgentUpdateSchema.parse({ name: "a".repeat(101) })).toThrow();
  });
});

describe("AgentQuerySchema", () => {
  it("parses minimal query", () => {
    const result = AgentQuerySchema.parse({});
    expect(result.type).toBe("all");
    expect(result.limit).toBe(50);
  });

  it("accepts all valid type values", () => {
    const types = ["all", "mine", "shared", "bookmarked"] as const;
    for (const type of types) {
      const result = AgentQuerySchema.parse({ type });
      expect(result.type).toBe(type);
    }
  });

  it("coerces string limit to number", () => {
    const result = AgentQuerySchema.parse({ limit: "10" });
    expect(result.limit).toBe(10);
  });

  it("rejects limit below 1", () => {
    expect(() => AgentQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit above 100", () => {
    expect(() => AgentQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("accepts filters string", () => {
    const result = AgentQuerySchema.parse({ filters: "coding" });
    expect(result.filters).toBe("coding");
  });

  it("rejects invalid type", () => {
    expect(() => AgentQuerySchema.parse({ type: "invalid" })).toThrow();
  });
});
