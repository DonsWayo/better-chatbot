import { describe, it, expect } from "vitest";
import { ArchiveCreateSchema, ArchiveUpdateSchema } from "./archive";

describe("ArchiveCreateSchema", () => {
  describe("valid inputs", () => {
    it("accepts name only", () => {
      expect(() => ArchiveCreateSchema.parse({ name: "My Archive" })).not.toThrow();
    });

    it("accepts name and description", () => {
      expect(() =>
        ArchiveCreateSchema.parse({ name: "Archive", description: "Some description." }),
      ).not.toThrow();
    });

    it("accepts name of exactly 100 characters", () => {
      expect(() =>
        ArchiveCreateSchema.parse({ name: "a".repeat(100) }),
      ).not.toThrow();
    });

    it("accepts description of exactly 500 characters", () => {
      expect(() =>
        ArchiveCreateSchema.parse({ name: "x", description: "d".repeat(500) }),
      ).not.toThrow();
    });
  });

  describe("invalid inputs", () => {
    it("rejects empty name", () => {
      expect(() => ArchiveCreateSchema.parse({ name: "" })).toThrow();
    });

    it("rejects name longer than 100 characters", () => {
      expect(() => ArchiveCreateSchema.parse({ name: "a".repeat(101) })).toThrow();
    });

    it("rejects description longer than 500 characters", () => {
      expect(() =>
        ArchiveCreateSchema.parse({ name: "x", description: "d".repeat(501) }),
      ).toThrow();
    });

    it("rejects missing name", () => {
      expect(() => ArchiveCreateSchema.parse({})).toThrow();
    });
  });
});

describe("ArchiveUpdateSchema", () => {
  describe("valid inputs", () => {
    it("accepts empty object (all fields optional)", () => {
      expect(() => ArchiveUpdateSchema.parse({})).not.toThrow();
    });

    it("accepts name only", () => {
      expect(() => ArchiveUpdateSchema.parse({ name: "New Name" })).not.toThrow();
    });

    it("accepts description only", () => {
      expect(() => ArchiveUpdateSchema.parse({ description: "Updated" })).not.toThrow();
    });

    it("accepts both name and description", () => {
      expect(() =>
        ArchiveUpdateSchema.parse({ name: "New Name", description: "New Description" }),
      ).not.toThrow();
    });
  });

  describe("invalid inputs", () => {
    it("rejects empty name string (min 1)", () => {
      expect(() => ArchiveUpdateSchema.parse({ name: "" })).toThrow();
    });

    it("rejects name longer than 100 characters", () => {
      expect(() => ArchiveUpdateSchema.parse({ name: "a".repeat(101) })).toThrow();
    });

    it("rejects description longer than 500 characters", () => {
      expect(() =>
        ArchiveUpdateSchema.parse({ description: "d".repeat(501) }),
      ).toThrow();
    });
  });
});
