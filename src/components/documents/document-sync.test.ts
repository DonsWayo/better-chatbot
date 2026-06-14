import { describe, expect, it } from "vitest";
import {
  REMOTE_APPLY_IDLE_MS,
  SELF_ECHO_GRACE_MS,
  decideNearLive,
  isDirty,
  serializeDoc,
  type NearLiveState,
} from "./document-sync";

const SELF = "self-user-id";
const OTHER = "other-user-id";

const docA = { type: "doc", content: [{ type: "paragraph" }] };
const docB = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
};

describe("isDirty", () => {
  it("clean when title + content match the saved snapshot", () => {
    expect(
      isDirty({ title: "T", content: docA }, { title: "T", content: docA }),
    ).toBe(false);
  });

  it("dirty when the title diverges", () => {
    expect(
      isDirty({ title: "New", content: docA }, { title: "Old", content: docA }),
    ).toBe(true);
  });

  it("dirty when the content diverges", () => {
    expect(
      isDirty({ title: "T", content: docB }, { title: "T", content: docA }),
    ).toBe(true);
  });

  it("serializeDoc is stable for equal docs", () => {
    expect(serializeDoc(docA)).toBe(serializeDoc({ ...docA }));
  });
});

// Baseline: another user's change, editor clean + idle (the silent-apply case).
function cleanIdleState(over: Partial<NearLiveState> = {}): NearLiveState {
  return {
    selfUserId: SELF,
    editorDirty: false,
    editorFocused: false,
    msSinceLastEdit: REMOTE_APPLY_IDLE_MS + 1000,
    msSinceLastSave: Infinity,
    appliedAtMs: 1000,
    ...over,
  };
}

describe("decideNearLive", () => {
  it("ignores a signal with no timestamp", () => {
    const d = decideNearLive(
      { lastEditedBy: OTHER, lastEditedAtMs: null },
      cleanIdleState(),
    );
    expect(d).toEqual({ action: "ignore", reason: "no-timestamp" });
  });

  it("ignores our own write echoing back", () => {
    const d = decideNearLive(
      { lastEditedBy: SELF, lastEditedAtMs: 5000 },
      cleanIdleState(),
    );
    expect(d).toEqual({ action: "ignore", reason: "self" });
  });

  it("ignores a change at or before what we already applied", () => {
    const d = decideNearLive(
      { lastEditedBy: OTHER, lastEditedAtMs: 1000 },
      cleanIdleState({ appliedAtMs: 1000 }),
    );
    expect(d).toEqual({ action: "ignore", reason: "stale" });
  });

  it("ignores another user's change inside the self-echo grace window", () => {
    const d = decideNearLive(
      { lastEditedBy: OTHER, lastEditedAtMs: 5000 },
      cleanIdleState({ msSinceLastSave: SELF_ECHO_GRACE_MS - 1 }),
    );
    expect(d).toEqual({ action: "ignore", reason: "self-echo-grace" });
  });

  it("refetches when another user saved and the editor is clean + idle", () => {
    const d = decideNearLive(
      { lastEditedBy: OTHER, lastEditedAtMs: 5000 },
      cleanIdleState(),
    );
    expect(d).toEqual({ action: "refetch" });
  });

  it("shows the banner when the editor is dirty (don't clobber)", () => {
    const d = decideNearLive(
      { lastEditedBy: OTHER, lastEditedAtMs: 5000 },
      cleanIdleState({ editorDirty: true }),
    );
    expect(d).toEqual({ action: "banner" });
  });

  it("shows the banner when the editor is focused (don't clobber)", () => {
    const d = decideNearLive(
      { lastEditedBy: OTHER, lastEditedAtMs: 5000 },
      cleanIdleState({ editorFocused: true }),
    );
    expect(d).toEqual({ action: "banner" });
  });

  it("shows the banner when the user typed very recently", () => {
    const d = decideNearLive(
      { lastEditedBy: OTHER, lastEditedAtMs: 5000 },
      cleanIdleState({ msSinceLastEdit: REMOTE_APPLY_IDLE_MS - 1 }),
    );
    expect(d).toEqual({ action: "banner" });
  });

  it("treats a null last_edited_by as a foreign change (not self)", () => {
    const d = decideNearLive(
      { lastEditedBy: null, lastEditedAtMs: 5000 },
      cleanIdleState(),
    );
    expect(d).toEqual({ action: "refetch" });
  });
});
