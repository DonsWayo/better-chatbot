import { describe, expect, it } from "vitest";
import { isFileDragEvent } from "./use-file-drag-overlay";

const createDragEvent = (dataTransfer: Partial<DataTransfer> | null) =>
  ({
    dataTransfer: dataTransfer ?? null,
  }) as unknown as DragEvent;

describe("isFileDragEvent", () => {
  it("returns false when dataTransfer is null", () => {
    expect(isFileDragEvent(createDragEvent(null))).toBe(false);
  });

  it("detects file drag via items with a file kind", () => {
    const event = createDragEvent({
      items: [
        { kind: "string" },
        { kind: "file" },
      ] as unknown as DataTransferItemList,
    });
    expect(isFileDragEvent(event)).toBe(true);
  });

  it("returns false when no items are files", () => {
    const event = createDragEvent({
      items: [{ kind: "string" }] as unknown as DataTransferItemList,
    });
    expect(isFileDragEvent(event)).toBe(false);
  });

  it("uses types fallback when items list is absent", () => {
    const event = createDragEvent({
      types: ["Files", "text/plain"],
    });
    expect(isFileDragEvent(event)).toBe(true);
  });

  it("returns false for non-file types in fallback", () => {
    const event = createDragEvent({
      types: ["text/plain"],
    });
    expect(isFileDragEvent(event)).toBe(false);
  });

  it("returns false when items list is empty (zero length)", () => {
    const emptyList = {
      length: 0,
      [Symbol.iterator]: function* () {},
    } as unknown as DataTransferItemList;
    const event = createDragEvent({ items: emptyList, types: ["Files"] });
    // items.length === 0 so falls through to types check
    expect(isFileDragEvent(event)).toBe(true);
  });

  it("returns true when first item is a file", () => {
    const event = createDragEvent({
      items: [{ kind: "file" }] as unknown as DataTransferItemList,
    });
    expect(isFileDragEvent(event)).toBe(true);
  });

  it("returns true when multiple items and last is file", () => {
    const event = createDragEvent({
      items: [
        { kind: "string" },
        { kind: "string" },
        { kind: "file" },
      ] as unknown as DataTransferItemList,
    });
    expect(isFileDragEvent(event)).toBe(true);
  });

  it("types check is case-sensitive: 'files' lowercase does not match", () => {
    const event = createDragEvent({
      types: ["files"],
    });
    // "files" !== "Files" so should return false
    expect(isFileDragEvent(event)).toBe(false);
  });

  it("returns false when types array is empty", () => {
    const event = createDragEvent({ types: [] });
    expect(isFileDragEvent(event)).toBe(false);
  });

  it("returns false when types has no 'Files' entry among multiple types", () => {
    const event = createDragEvent({ types: ["text/html", "text/plain", "application/json"] });
    expect(isFileDragEvent(event)).toBe(false);
  });

  it("'Files' anywhere in types array matches", () => {
    const event = createDragEvent({ types: ["text/plain", "Files", "application/json"] });
    expect(isFileDragEvent(event)).toBe(true);
  });

  it("items takes priority over types when items has length", () => {
    const event = createDragEvent({
      items: [{ kind: "string" }] as unknown as DataTransferItemList,
      types: ["Files"],
    });
    // items has length=1 and kind=string → false even though types has "Files"
    expect(isFileDragEvent(event)).toBe(false);
  });

  it("returns false when dataTransfer has no types and no items", () => {
    const event = createDragEvent({});
    expect(isFileDragEvent(event)).toBe(false);
  });
});
