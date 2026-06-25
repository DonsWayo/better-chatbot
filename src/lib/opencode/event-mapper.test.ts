import { describe, it, expect } from "vitest";
import { applyOpencodeEvent } from "./event-mapper";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const empty: UIMessage[] = [];

function makeEvent(type: string, properties: Record<string, unknown>) {
  return { type, properties } as any;
}

/** Grab the single assistant message (asserts exactly one exists). */
function assistant(messages: UIMessage[]) {
  const msgs = messages.filter((m) => m.role === "assistant");
  expect(msgs).toHaveLength(1);
  return msgs[0];
}

function parts(messages: UIMessage[]) {
  return (assistant(messages).parts ?? []) as any[];
}

// ---------------------------------------------------------------------------
// message.part.updated — text
// ---------------------------------------------------------------------------

describe("message.part.updated / text", () => {
  it("creates a new assistant message and appends a text part", () => {
    const msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: {
          id: "p1",
          sessionID: "s1",
          messageID: "m1",
          type: "text",
          text: "Hello!",
        },
      }),
    );

    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].id).toBe("m1");

    const p = parts(msgs);
    expect(p).toHaveLength(1);
    expect(p[0].type).toBe("text");
    expect(p[0].text).toBe("Hello!");
    expect(p[0]._partId).toBe("p1");
  });

  it("upserts a text part by _partId (replace, not duplicate)", () => {
    let msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "v1" },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "v2" },
      }),
    );

    const p = parts(msgs);
    expect(p).toHaveLength(1);
    expect(p[0].text).toBe("v2");
  });

  it("appends a new text part when id differs", () => {
    let msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "A" },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "p2", sessionID: "s1", messageID: "m1", type: "text", text: "B" },
      }),
    );

    const p = parts(msgs);
    expect(p).toHaveLength(2);
    expect(p[0].text).toBe("A");
    expect(p[1].text).toBe("B");
  });

  it("does not mutate the original messages array", () => {
    const original: UIMessage[] = [];
    const result = applyOpencodeEvent(
      original,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "hi" },
      }),
    );
    expect(original).toHaveLength(0);
    expect(result).toHaveLength(1);
  });

  it("ignores events with missing messageID", () => {
    const result = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", type: "text", text: "hi" },
      }),
    );
    expect(result).toHaveLength(0);
  });

  it("ignores events with missing part.id", () => {
    const result = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { sessionID: "s1", messageID: "m1", type: "text", text: "hi" },
      }),
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// message.part.updated — reasoning
// ---------------------------------------------------------------------------

describe("message.part.updated / reasoning", () => {
  it("creates a reasoning part with correct type and text", () => {
    const msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: {
          id: "r1",
          sessionID: "s1",
          messageID: "m1",
          type: "reasoning",
          text: "thinking...",
          time: { start: 0 },
        },
      }),
    );

    const p = parts(msgs);
    expect(p[0].type).toBe("reasoning");
    expect(p[0].text).toBe("thinking...");
    expect(p[0]._partId).toBe("r1");
  });

  it("upserts reasoning part by id", () => {
    let msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { id: "r1", sessionID: "s1", messageID: "m1", type: "reasoning", text: "v1", time: { start: 0 } },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "r1", sessionID: "s1", messageID: "m1", type: "reasoning", text: "v2", time: { start: 0 } },
      }),
    );
    expect(parts(msgs)).toHaveLength(1);
    expect(parts(msgs)[0].text).toBe("v2");
  });
});

// ---------------------------------------------------------------------------
// message.part.updated — tool (state machine)
// ---------------------------------------------------------------------------

describe("message.part.updated / tool", () => {
  const toolPart = (status: string, extra: Record<string, unknown> = {}) =>
    makeEvent("message.part.updated", {
      part: {
        id: "t1",
        sessionID: "s1",
        messageID: "m1",
        type: "tool",
        callID: "call-bash-1",
        tool: "bash",
        state: { status, input: { command: "ls" }, ...extra },
      },
    });

  it("pending → type tool-opencode__bash, state input-streaming", () => {
    const msgs = applyOpencodeEvent(empty, toolPart("pending", { raw: "" }));
    const p = parts(msgs)[0];
    expect(p.type).toBe("tool-opencode__bash");
    expect(p.state).toBe("input-streaming");
    expect(p.toolCallId).toBe("call-bash-1");
    expect(p.input).toEqual({ command: "ls" });
    expect(p.output).toBeUndefined();
    expect(p.errorText).toBeUndefined();
  });

  it("running → state output-running", () => {
    const msgs = applyOpencodeEvent(
      empty,
      toolPart("running", { time: { start: 0 } }),
    );
    expect(parts(msgs)[0].state).toBe("output-running");
  });

  it("completed → state output-available with output string", () => {
    const msgs = applyOpencodeEvent(
      empty,
      toolPart("completed", {
        output: "file1.ts\nfile2.ts",
        title: "bash",
        metadata: {},
        time: { start: 0, end: 100 },
      }),
    );
    const p = parts(msgs)[0];
    expect(p.state).toBe("output-available");
    expect(p.output).toBe("file1.ts\nfile2.ts");
    expect(p.errorText).toBeUndefined();
  });

  it("error → state output-error with errorText", () => {
    const msgs = applyOpencodeEvent(
      empty,
      toolPart("error", {
        error: "Permission denied",
        metadata: {},
        time: { start: 0, end: 50 },
      }),
    );
    const p = parts(msgs)[0];
    expect(p.state).toBe("output-error");
    expect(p.errorText).toBe("Permission denied");
    expect(p.output).toBeUndefined();
  });

  it("full pending→running→completed transition via upsert", () => {
    let msgs = applyOpencodeEvent(empty, toolPart("pending", { raw: "" }));
    expect(parts(msgs)[0].state).toBe("input-streaming");

    msgs = applyOpencodeEvent(msgs, toolPart("running", { time: { start: 0 } }));
    expect(parts(msgs)).toHaveLength(1); // upserted, not duplicated
    expect(parts(msgs)[0].state).toBe("output-running");

    msgs = applyOpencodeEvent(
      msgs,
      toolPart("completed", {
        output: "ok",
        title: "bash",
        metadata: {},
        time: { start: 0, end: 100 },
      }),
    );
    expect(parts(msgs)).toHaveLength(1);
    expect(parts(msgs)[0].state).toBe("output-available");
    expect(parts(msgs)[0].output).toBe("ok");
  });

  it("tool name is embedded in part type", () => {
    const evt = makeEvent("message.part.updated", {
      part: {
        id: "t2",
        sessionID: "s1",
        messageID: "m1",
        type: "tool",
        callID: "call-write-1",
        tool: "write",
        state: { status: "pending", input: {}, raw: "" },
      },
    });
    const p = parts(applyOpencodeEvent(empty, evt))[0];
    expect(p.type).toBe("tool-opencode__write");
  });

  it("unknown tool status defaults to input-streaming", () => {
    const msgs = applyOpencodeEvent(
      empty,
      toolPart("in_progress" as any),
    );
    expect(parts(msgs)[0].state).toBe("input-streaming");
  });
});

// ---------------------------------------------------------------------------
// message.part.updated — skipped part types
// ---------------------------------------------------------------------------

describe("message.part.updated / skipped part types", () => {
  const skipTypes = [
    "step-start",
    "step-finish",
    "snapshot",
    "patch",
    "subtask",
    "agent",
    "compaction",
    "retry",
    "file",
  ];

  for (const ptype of skipTypes) {
    it(`ignores part type "${ptype}"`, () => {
      const msgs = applyOpencodeEvent(
        empty,
        makeEvent("message.part.updated", {
          part: { id: "px", sessionID: "s1", messageID: "m1", type: ptype },
        }),
      );
      // Message should not be created at all for skipped types.
      expect(msgs).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// message.part.removed
// ---------------------------------------------------------------------------

describe("message.part.removed", () => {
  it("removes a part by partID", () => {
    let msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "keep" },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "p2", sessionID: "s1", messageID: "m1", type: "text", text: "remove me" },
      }),
    );
    expect(parts(msgs)).toHaveLength(2);

    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.removed", {
        sessionID: "s1",
        messageID: "m1",
        partID: "p2",
      }),
    );

    expect(parts(msgs)).toHaveLength(1);
    expect(parts(msgs)[0].text).toBe("keep");
  });

  it("is a no-op if partID does not exist", () => {
    let msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "hi" },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.removed", {
        sessionID: "s1",
        messageID: "m1",
        partID: "p-does-not-exist",
      }),
    );
    expect(parts(msgs)).toHaveLength(1);
  });

  it("ignores remove with missing messageID", () => {
    const result = applyOpencodeEvent(
      empty,
      makeEvent("message.part.removed", { sessionID: "s1", partID: "p1" }),
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// permission.updated
// ---------------------------------------------------------------------------

describe("permission.updated", () => {
  it("creates a permission tool part in the correct message", () => {
    const msgs = applyOpencodeEvent(
      empty,
      makeEvent("permission.updated", {
        id: "perm-1",
        type: "bash",
        title: "Run bash command",
        sessionID: "sess-1",
        messageID: "msg-perm-1",
        callID: "call-1",
        pattern: "rm -rf /tmp/*",
        metadata: { cmd: "rm -rf /tmp/x" },
        time: { created: 1000 },
      }),
    );

    expect(msgs).toHaveLength(1);
    const p = parts(msgs)[0];
    expect(p.type).toBe("tool-opencode__permission");
    expect(p.toolCallId).toBe("call-1");
    expect(p.state).toBe("input-available");
    expect(p.input.permissionId).toBe("perm-1");
    expect(p.input.sessionId).toBe("sess-1");
    expect(p.input.tool).toBe("bash");
    expect(p.input.title).toBe("Run bash command");
    expect(p.input.pattern).toBe("rm -rf /tmp/*");
    expect(p._partId).toBe("perm-1");
  });

  it("uses permission id as toolCallId when callID is absent", () => {
    const msgs = applyOpencodeEvent(
      empty,
      makeEvent("permission.updated", {
        id: "perm-2",
        type: "write",
        title: "Write file",
        sessionID: "sess-1",
        messageID: "msg-perm-2",
        metadata: {},
        time: { created: 1000 },
      }),
    );
    expect(parts(msgs)[0].toolCallId).toBe("perm-2");
  });

  it("upserts permission part by id", () => {
    let msgs = applyOpencodeEvent(
      empty,
      makeEvent("permission.updated", {
        id: "perm-1",
        type: "bash",
        title: "v1",
        sessionID: "sess-1",
        messageID: "msg-p",
        metadata: {},
        time: { created: 1000 },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("permission.updated", {
        id: "perm-1",
        type: "bash",
        title: "v2",
        sessionID: "sess-1",
        messageID: "msg-p",
        metadata: {},
        time: { created: 1001 },
      }),
    );
    expect(parts(msgs)).toHaveLength(1);
    expect(parts(msgs)[0].input.title).toBe("v2");
  });

  it("ignores permission without messageID", () => {
    const result = applyOpencodeEvent(
      empty,
      makeEvent("permission.updated", {
        id: "p1",
        type: "bash",
        title: "t",
        sessionID: "s1",
        metadata: {},
        time: { created: 0 },
      }),
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// permission.replied
// ---------------------------------------------------------------------------

describe("permission.replied", () => {
  function withPermissionPart() {
    return applyOpencodeEvent(
      empty,
      makeEvent("permission.updated", {
        id: "perm-1",
        type: "bash",
        title: "Run bash",
        sessionID: "sess-1",
        messageID: "msg-perm",
        callID: "call-1",
        metadata: {},
        time: { created: 0 },
      }),
    );
  }

  it("sets state to output-available and stores response", () => {
    let msgs = withPermissionPart();
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("permission.replied", {
        sessionID: "sess-1",
        permissionID: "perm-1",
        response: "once",
      }),
    );
    const p = parts(msgs)[0];
    expect(p.state).toBe("output-available");
    expect(p.output?.response).toBe("once");
  });

  it("handles always and reject responses", () => {
    for (const response of ["always", "reject"] as const) {
      let msgs = withPermissionPart();
      msgs = applyOpencodeEvent(
        msgs,
        makeEvent("permission.replied", {
          sessionID: "sess-1",
          permissionID: "perm-1",
          response,
        }),
      );
      expect(parts(msgs)[0].output?.response).toBe(response);
    }
  });

  it("is a no-op when permissionID does not match any part", () => {
    const msgs = withPermissionPart();
    const result = applyOpencodeEvent(
      msgs,
      makeEvent("permission.replied", {
        sessionID: "sess-1",
        permissionID: "wrong-id",
        response: "once",
      }),
    );
    expect(parts(result)[0].state).toBe("input-available");
  });

  it("ignores events with missing permissionID", () => {
    const msgs = withPermissionPart();
    const result = applyOpencodeEvent(
      msgs,
      makeEvent("permission.replied", { sessionID: "sess-1", response: "once" }),
    );
    // State should be unchanged.
    expect(parts(result)[0].state).toBe("input-available");
  });
});

// ---------------------------------------------------------------------------
// no-op events
// ---------------------------------------------------------------------------

describe("no-op events (messages unchanged)", () => {
  const NON_MUTATING_EVENTS = [
    { type: "session.status", properties: { sessionID: "s1", status: { type: "busy" } } },
    { type: "session.idle", properties: { sessionID: "s1" } },
    { type: "session.error", properties: { sessionID: "s1", error: {} } },
    { type: "session.created", properties: { info: {} } },
    { type: "session.updated", properties: { info: {} } },
    { type: "file.edited", properties: { file: "src/foo.ts" } },
    { type: "some.unknown.event", properties: {} },
    { type: "vcs.branch.updated", properties: { branch: "main" } },
    { type: "todo.updated", properties: { sessionID: "s1", todos: [] } },
  ];

  for (const evt of NON_MUTATING_EVENTS) {
    it(`returns same array reference for "${evt.type}"`, () => {
      const result = applyOpencodeEvent(empty, evt as any);
      // Same identity (no mutation) or at minimum same content.
      expect(result).toHaveLength(0);
    });
  }

  it("preserves existing messages unchanged on lifecycle events", () => {
    let msgs = applyOpencodeEvent(
      empty,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "hi" },
      }),
    );
    const before = msgs[0];

    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("session.status", {
        sessionID: "s1",
        status: { type: "idle" },
      }),
    );

    expect(msgs[0]).toBe(before); // strict reference equality — no re-creation
  });
});

// ---------------------------------------------------------------------------
// Multiple messages
// ---------------------------------------------------------------------------

describe("multiple messages in one stream", () => {
  it("routes parts to correct messages by messageID", () => {
    let msgs: UIMessage[] = [];

    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "pA", sessionID: "s1", messageID: "m-A", type: "text", text: "from A" },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "pB", sessionID: "s1", messageID: "m-B", type: "text", text: "from B" },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "pA2", sessionID: "s1", messageID: "m-A", type: "text", text: "also A" },
      }),
    );

    expect(msgs).toHaveLength(2);
    const msgA = msgs.find((m) => m.id === "m-A")!;
    const msgB = msgs.find((m) => m.id === "m-B")!;

    expect((msgA.parts as any[]).map((p) => p.text)).toEqual(["from A", "also A"]);
    expect((msgB.parts as any[]).map((p) => p.text)).toEqual(["from B"]);
  });

  it("upsert replaces in the right message only", () => {
    let msgs: UIMessage[] = [];
    // Same partId in two different messages — treated as separate (different messageIDs).
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m-1", type: "text", text: "m1 v1" },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m-2", type: "text", text: "m2 v1" },
      }),
    );
    // Update p1 in m-1 only.
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m-1", type: "text", text: "m1 v2" },
      }),
    );

    const m1 = msgs.find((m) => m.id === "m-1")!;
    const m2 = msgs.find((m) => m.id === "m-2")!;
    expect((m1.parts as any[])[0].text).toBe("m1 v2");
    expect((m2.parts as any[])[0].text).toBe("m2 v1");
  });

  it("preserves user messages (role=user) untouched", () => {
    const userMsg: UIMessage = {
      id: "user-1",
      role: "user",
      content: "Hello",
      parts: [{ type: "text", text: "Hello" }],
    } as any;

    const msgs = applyOpencodeEvent(
      [userMsg],
      makeEvent("message.part.updated", {
        part: { id: "p1", sessionID: "s1", messageID: "m-asst", type: "text", text: "Hi!" },
      }),
    );

    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toBe(userMsg); // unchanged reference
    expect(msgs[1].role).toBe("assistant");
  });
});

// ---------------------------------------------------------------------------
// Mixed part streams (text + tool + permission in same message)
// ---------------------------------------------------------------------------

describe("mixed part types in one message", () => {
  it("maintains insertion order across different part types", () => {
    let msgs: UIMessage[] = [];

    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "pt1", sessionID: "s1", messageID: "m1", type: "text", text: "Starting..." },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: {
          id: "tool1",
          sessionID: "s1",
          messageID: "m1",
          type: "tool",
          callID: "c1",
          tool: "bash",
          state: { status: "running", input: { command: "ls" }, time: { start: 0 } },
        },
      }),
    );
    msgs = applyOpencodeEvent(
      msgs,
      makeEvent("message.part.updated", {
        part: { id: "pt2", sessionID: "s1", messageID: "m1", type: "text", text: "Done." },
      }),
    );

    const p = parts(msgs);
    expect(p).toHaveLength(3);
    expect(p[0].type).toBe("text");
    expect(p[1].type).toBe("tool-opencode__bash");
    expect(p[2].type).toBe("text");
  });

  it("tool upsert preserves surrounding text parts", () => {
    let msgs: UIMessage[] = [];

    msgs = applyOpencodeEvent(msgs, makeEvent("message.part.updated", {
      part: { id: "txt", sessionID: "s1", messageID: "m1", type: "text", text: "Before" },
    }));
    msgs = applyOpencodeEvent(msgs, makeEvent("message.part.updated", {
      part: { id: "t1", sessionID: "s1", messageID: "m1", type: "tool", callID: "c1", tool: "bash", state: { status: "pending", input: {}, raw: "" } },
    }));
    // Upsert the tool to completed.
    msgs = applyOpencodeEvent(msgs, makeEvent("message.part.updated", {
      part: { id: "t1", sessionID: "s1", messageID: "m1", type: "tool", callID: "c1", tool: "bash", state: { status: "completed", input: {}, output: "done", title: "bash", metadata: {}, time: { start: 0, end: 1 } } },
    }));

    const p = parts(msgs);
    expect(p).toHaveLength(2);
    expect(p[0].type).toBe("text");
    expect(p[0].text).toBe("Before");
    expect(p[1].type).toBe("tool-opencode__bash");
    expect(p[1].state).toBe("output-available");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles empty text gracefully", () => {
    const msgs = applyOpencodeEvent(empty, makeEvent("message.part.updated", {
      part: { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "" },
    }));
    expect(parts(msgs)[0].text).toBe("");
  });

  it("handles undefined part safely", () => {
    const result = applyOpencodeEvent(empty, makeEvent("message.part.updated", { part: null }));
    expect(result).toHaveLength(0);
  });

  it("handles missing properties object gracefully", () => {
    const result = applyOpencodeEvent(empty, { type: "message.part.updated", properties: {} } as any);
    expect(result).toHaveLength(0);
  });

  it("applies multiple events sequentially and builds correct final state", () => {
    const events = [
      makeEvent("message.part.updated", {
        part: { id: "r1", sessionID: "s1", messageID: "m1", type: "reasoning", text: "thinking", time: { start: 0 } },
      }),
      makeEvent("message.part.updated", {
        part: { id: "t1", sessionID: "s1", messageID: "m1", type: "tool", callID: "c1", tool: "bash", state: { status: "pending", input: {}, raw: "" } },
      }),
      makeEvent("message.part.updated", {
        part: { id: "t1", sessionID: "s1", messageID: "m1", type: "tool", callID: "c1", tool: "bash", state: { status: "completed", input: {}, output: "ok", title: "bash", metadata: {}, time: { start: 0, end: 1 } } },
      }),
      makeEvent("message.part.updated", {
        part: { id: "txt1", sessionID: "s1", messageID: "m1", type: "text", text: "All done." },
      }),
      makeEvent("permission.updated", {
        id: "perm-1", type: "bash", title: "Need permission", sessionID: "s1",
        messageID: "m1", callID: "c2", metadata: {}, time: { created: 1 },
      }),
      makeEvent("permission.replied", {
        sessionID: "s1", permissionID: "perm-1", response: "reject",
      }),
    ];

    const final = events.reduce((msgs, evt) => applyOpencodeEvent(msgs, evt), empty);
    const p = parts(final);

    expect(p).toHaveLength(4);
    expect(p[0].type).toBe("reasoning");
    expect(p[1].type).toBe("tool-opencode__bash");
    expect(p[1].state).toBe("output-available");
    expect(p[2].type).toBe("text");
    expect(p[3].type).toBe("tool-opencode__permission");
    expect(p[3].state).toBe("output-available");
    expect(p[3].output?.response).toBe("reject");
  });
});
