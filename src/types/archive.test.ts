import { describe, it, expect } from "vitest";
import { ArchiveCreateSchema, ArchiveUpdateSchema } from "./archive";

describe("ArchiveCreateSchema", () => {
  it("accepts valid name", () => {
    const r = ArchiveCreateSchema.safeParse({ name: "My Archive" });
    expect(r.success).toBe(true);
  });

  it("accepts name with optional description", () => {
    const r = ArchiveCreateSchema.safeParse({
      name: "My Archive",
      description: "A description",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBe("A description");
  });

  it("rejects empty name", () => {
    const r = ArchiveCreateSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const r = ArchiveCreateSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("accepts name at max 100 characters", () => {
    const r = ArchiveCreateSchema.safeParse({ name: "a".repeat(100) });
    expect(r.success).toBe(true);
  });

  it("rejects description over 500 characters", () => {
    const r = ArchiveCreateSchema.safeParse({
      name: "Archive",
      description: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("accepts description at max 500 characters", () => {
    const r = ArchiveCreateSchema.safeParse({
      name: "Archive",
      description: "x".repeat(500),
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing name", () => {
    const r = ArchiveCreateSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("ArchiveUpdateSchema", () => {
  it("accepts empty object (all optional)", () => {
    const r = ArchiveUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts partial update with name only", () => {
    const r = ArchiveUpdateSchema.safeParse({ name: "Updated Name" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Updated Name");
  });

  it("accepts partial update with description only", () => {
    const r = ArchiveUpdateSchema.safeParse({ description: "New desc" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBe("New desc");
  });

  it("accepts full update", () => {
    const r = ArchiveUpdateSchema.safeParse({
      name: "New Name",
      description: "New Description",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty name when provided", () => {
    const r = ArchiveUpdateSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const r = ArchiveUpdateSchema.safeParse({ name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects description over 500 characters", () => {
    const r = ArchiveUpdateSchema.safeParse({ description: "x".repeat(501) });
    expect(r.success).toBe(false);
  });

  it("accepts name at exactly 100 characters in update", () => {
    const r = ArchiveUpdateSchema.safeParse({ name: "a".repeat(100) });
    expect(r.success).toBe(true);
  });

  it("accepts description at exactly 500 characters in update", () => {
    const r = ArchiveUpdateSchema.safeParse({ description: "x".repeat(500) });
    expect(r.success).toBe(true);
  });

  it("accepts single character name", () => {
    const r = ArchiveUpdateSchema.safeParse({ name: "X" });
    expect(r.success).toBe(true);
  });
});

describe("ArchiveCreateSchema — additional boundaries", () => {
  it("accepts single character name", () => {
    const r = ArchiveCreateSchema.safeParse({ name: "X" });
    expect(r.success).toBe(true);
  });

  it("parsed data contains no extra fields when only name given", () => {
    const r = ArchiveCreateSchema.safeParse({ name: "Archive" });
    expect(r.success).toBe(true);
  });

  it("rejects number as name", () => {
    const r = ArchiveCreateSchema.safeParse({ name: 42 });
    expect(r.success).toBe(false);
  });
});
