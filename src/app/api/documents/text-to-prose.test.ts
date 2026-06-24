/**
 * Unit tests for `textToProseMirrorDoc`.
 *
 * The function is private to actions.ts, so we inline an exact copy here for
 * direct, pure input/output testing.  If the source implementation changes,
 * update this copy accordingly.
 */
import { describe, expect, it } from "vitest";

// ─── Inline copy of the private helpers ───────────────────────────────────────

type TextNode = { type: "text"; text: string; marks?: { type: string }[] };

function parseInline(src: string): TextNode[] {
  const result: TextNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(src)) !== null) {
    if (match.index > last) {
      result.push({ type: "text", text: src.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      result.push({ type: "text", text: match[1], marks: [{ type: "bold" }] });
    } else if (match[2] !== undefined) {
      result.push({
        type: "text",
        text: match[2],
        marks: [{ type: "italic" }],
      });
    } else if (match[3] !== undefined) {
      result.push({ type: "text", text: match[3], marks: [{ type: "code" }] });
    }
    last = match.index + match[0].length;
  }
  if (last < src.length) {
    result.push({ type: "text", text: src.slice(last) });
  }
  return result;
}

function indentDepth(raw: string): number {
  const leading = raw.match(/^(\s*)/)?.[1] ?? "";
  let spaces = 0;
  for (const ch of leading) {
    if (ch === "\t") spaces += 2;
    else spaces++;
  }
  return Math.floor(spaces / 2);
}

type RawListItem = { depth: number; text: string; ordered: boolean };

function buildListNode(
  items: RawListItem[],
  depth: number,
  ordered: boolean,
): Record<string, unknown> {
  const listItems: Record<string, unknown>[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.depth !== depth) {
      i++;
      continue;
    }
    const children: RawListItem[] = [];
    let j = i + 1;
    while (j < items.length && items[j].depth > depth) {
      children.push(items[j]);
      j++;
    }
    const listItemContent: Record<string, unknown>[] = [
      { type: "paragraph", content: parseInline(item.text) },
    ];
    if (children.length > 0) {
      listItemContent.push(
        buildListNode(children, depth + 1, children[0].ordered),
      );
    }
    listItems.push({ type: "listItem", content: listItemContent });
    i = j;
  }
  return { type: ordered ? "orderedList" : "bulletList", content: listItems };
}

function textToProseMirrorDoc(text: string): Record<string, unknown> {
  if (!text || !text.trim()) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const nodes: Record<string, unknown>[] = [];
  const lines = text.split("\n");
  let i = 0;

  const pendingList: RawListItem[] = [];

  function flushList(): void {
    if (pendingList.length === 0) return;
    nodes.push(buildListNode(pendingList, 0, pendingList[0].ordered));
    pendingList.length = 0;
  }

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    const fenceOpen = raw.match(/^(\s*)```([\w-]*)\s*$/);
    if (fenceOpen) {
      flushList();
      const lang = fenceOpen[2] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const code = codeLines.join("\n");
      nodes.push({
        type: "codeBlock",
        attrs: { language: lang || null },
        content: code ? [{ type: "text", text: code }] : [],
      });
      continue;
    }

    if (!trimmed) {
      flushList();
      i++;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      nodes.push({
        type: "heading",
        attrs: { level },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    if (/^(\s*)>\s?/.test(raw)) {
      flushList();
      const bqLines: string[] = [raw.replace(/^(\s*)>\s?/, "")];
      i++;
      while (i < lines.length && /^(\s*)>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^(\s*)>\s?/, ""));
        i++;
      }
      const bqContent = bqLines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => ({ type: "paragraph", content: parseInline(l) }));
      nodes.push({
        type: "blockquote",
        content: bqContent.length ? bqContent : [{ type: "paragraph" }],
      });
      continue;
    }

    const bulletMatch = raw.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bulletMatch) {
      const depth = indentDepth(raw);
      if (pendingList.length > 0 && depth === 0 && pendingList[0].ordered) {
        flushList();
      }
      pendingList.push({ depth, text: bulletMatch[2], ordered: false });
      i++;
      continue;
    }

    const orderedMatch = raw.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      const depth = indentDepth(raw);
      if (pendingList.length > 0 && depth === 0 && !pendingList[0].ordered) {
        flushList();
      }
      pendingList.push({ depth, text: orderedMatch[2], ordered: true });
      i++;
      continue;
    }

    flushList();
    nodes.push({ type: "paragraph", content: parseInline(trimmed) });
    i++;
  }

  flushList();

  return {
    type: "doc",
    content: nodes.length ? nodes : [{ type: "paragraph" }],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("textToProseMirrorDoc (extracted for testing)", () => {
  // ── Empty / whitespace inputs ───────────────────────────────────────────────

  it("empty string → doc with empty paragraph", () => {
    expect(textToProseMirrorDoc("")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("whitespace-only string → doc with empty paragraph", () => {
    expect(textToProseMirrorDoc("   \n  \n\t")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("string with only blank lines → doc with empty paragraph", () => {
    expect(textToProseMirrorDoc("\n\n\n")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("text that starts with blank lines is handled correctly", () => {
    const result = textToProseMirrorDoc("\n\nHello");
    expect(result.type).toBe("doc");
    const content = result.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("paragraph");
  });

  // ── Plain paragraphs ────────────────────────────────────────────────────────

  it("single paragraph", () => {
    const result = textToProseMirrorDoc("Hello world");
    expect(result).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });
  });

  it("two paragraphs separated by blank line", () => {
    const result = textToProseMirrorDoc("First paragraph\n\nSecond paragraph");
    const content = result.content as Record<string, unknown>[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "First paragraph" }],
    });
    expect(content[1]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Second paragraph" }],
    });
  });

  it("multiple paragraphs", () => {
    const input = "One\n\nTwo\n\nThree";
    const content = textToProseMirrorDoc(input).content as unknown[];
    expect(content).toHaveLength(3);
  });

  it("leading/trailing whitespace on a paragraph line is trimmed", () => {
    const result = textToProseMirrorDoc("   hello world   ");
    const content = result.content as Record<string, unknown>[];
    const para = content[0] as { content: TextNode[] };
    expect(para.content[0].text).toBe("hello world");
  });

  // ── ATX Headings ────────────────────────────────────────────────────────────

  it("# H1 heading", () => {
    const result = textToProseMirrorDoc("# Heading One");
    expect(result.content).toEqual([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Heading One" }],
      },
    ]);
  });

  it("## H2 heading", () => {
    const result = textToProseMirrorDoc("## Heading Two");
    const node = (result.content as Record<string, unknown>[])[0];
    expect(node.type).toBe("heading");
    expect((node.attrs as Record<string, unknown>).level).toBe(2);
  });

  it("### H3 heading", () => {
    const result = textToProseMirrorDoc("### Heading Three");
    const node = (result.content as Record<string, unknown>[])[0];
    expect((node.attrs as Record<string, unknown>).level).toBe(3);
  });

  it("multiple headings with different levels", () => {
    const input = "# Title\n## Section\n### Sub";
    const result = textToProseMirrorDoc(input);
    const nodes = result.content as {
      type: string;
      attrs: { level: number };
    }[];
    expect(nodes[0].attrs.level).toBe(1);
    expect(nodes[1].attrs.level).toBe(2);
    expect(nodes[2].attrs.level).toBe(3);
  });

  it("heading followed by a paragraph", () => {
    const result = textToProseMirrorDoc("# Title\n\nSome text");
    const content = result.content as Record<string, unknown>[];
    expect(content[0].type).toBe("heading");
    expect(content[1].type).toBe("paragraph");
  });

  // ── Inline marks ────────────────────────────────────────────────────────────

  it("bold text **…**", () => {
    const result = textToProseMirrorDoc("This is **bold** text");
    const nodes = (
      (result.content as Record<string, unknown>[])[0] as {
        content: TextNode[];
      }
    ).content;
    expect(nodes).toEqual([
      { type: "text", text: "This is " },
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
      { type: "text", text: " text" },
    ]);
  });

  it("italic text *…*", () => {
    const result = textToProseMirrorDoc("This is *italic* text");
    const nodes = (
      (result.content as Record<string, unknown>[])[0] as {
        content: TextNode[];
      }
    ).content;
    expect(nodes).toEqual([
      { type: "text", text: "This is " },
      { type: "text", text: "italic", marks: [{ type: "italic" }] },
      { type: "text", text: " text" },
    ]);
  });

  it("inline code `…`", () => {
    const result = textToProseMirrorDoc("Use `console.log()` here");
    const nodes = (
      (result.content as Record<string, unknown>[])[0] as {
        content: TextNode[];
      }
    ).content;
    expect(nodes).toEqual([
      { type: "text", text: "Use " },
      { type: "text", text: "console.log()", marks: [{ type: "code" }] },
      { type: "text", text: " here" },
    ]);
  });

  it("bold takes priority over italic (** before *)", () => {
    // **bold** must not be misread as two italic fragments
    const result = textToProseMirrorDoc("**bold**");
    const nodes = (
      (result.content as Record<string, unknown>[])[0] as {
        content: TextNode[];
      }
    ).content;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].marks).toEqual([{ type: "bold" }]);
  });

  it("mixed inline marks in same paragraph", () => {
    const result = textToProseMirrorDoc("**a** *b* `c`");
    const nodes = (
      (result.content as Record<string, unknown>[])[0] as {
        content: TextNode[];
      }
    ).content;
    expect(nodes[0].marks).toEqual([{ type: "bold" }]);
    // space between marks becomes a plain text node
    expect(nodes[2].marks).toEqual([{ type: "italic" }]);
    expect(nodes[4].marks).toEqual([{ type: "code" }]);
  });

  it("heading with bold inline mark", () => {
    const result = textToProseMirrorDoc("## **Bold** heading");
    const node = (result.content as Record<string, unknown>[])[0] as {
      type: string;
      attrs: { level: number };
      content: TextNode[];
    };
    expect(node.type).toBe("heading");
    expect(node.attrs.level).toBe(2);
    expect(node.content[0].marks).toEqual([{ type: "bold" }]);
  });

  it("plain asterisks with no enclosing pair remain as plain text", () => {
    const result = textToProseMirrorDoc("price * 2 is fine");
    const nodes = (
      (result.content as Record<string, unknown>[])[0] as {
        content: TextNode[];
      }
    ).content;
    // The whole string has no closing *, so it becomes a single plain text node
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("price * 2 is fine");
    expect(nodes[0].marks).toBeUndefined();
  });

  // ── Bullet lists ────────────────────────────────────────────────────────────

  it("single bullet item", () => {
    const result = textToProseMirrorDoc("- Item one");
    expect(result.content).toEqual([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item one" }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("multiple bullet items form one bulletList node", () => {
    const result = textToProseMirrorDoc("- A\n- B\n- C");
    const content = result.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("bulletList");
    const items = content[0].content as unknown[];
    expect(items).toHaveLength(3);
  });

  it("bullet item with bold text", () => {
    const result = textToProseMirrorDoc("- **Bold** item");
    const list = (result.content as Record<string, unknown>[])[0];
    const firstItem = (list.content as Record<string, unknown>[])[0];
    const para = (firstItem.content as Record<string, unknown>[])[0] as {
      content: TextNode[];
    };
    expect(para.content[0].marks).toEqual([{ type: "bold" }]);
  });

  it("nested bullets (2-space indent)", () => {
    const input = "- Parent\n  - Child";
    const result = textToProseMirrorDoc(input);
    const list = (result.content as Record<string, unknown>[])[0] as {
      content: Record<string, unknown>[];
    };
    const parentItem = list.content[0] as {
      content: Record<string, unknown>[];
    };
    // The listItem should contain a paragraph AND a nested bulletList
    expect(parentItem.content).toHaveLength(2);
    expect((parentItem.content[1] as Record<string, unknown>).type).toBe(
      "bulletList",
    );
  });

  it("nested bullets via tab indent", () => {
    const input = "- Parent\n\t- Child";
    const result = textToProseMirrorDoc(input);
    const list = (result.content as Record<string, unknown>[])[0] as {
      content: Record<string, unknown>[];
    };
    const parentItem = list.content[0] as {
      content: Record<string, unknown>[];
    };
    expect(parentItem.content).toHaveLength(2);
    const nested = parentItem.content[1] as { type: string };
    expect(nested.type).toBe("bulletList");
  });

  it("* and + are also valid bullet markers", () => {
    const resultStar = textToProseMirrorDoc("* Star item");
    const resultPlus = textToProseMirrorDoc("+ Plus item");
    expect(
      (
        (resultStar.content as Record<string, unknown>[])[0] as {
          type: string;
        }
      ).type,
    ).toBe("bulletList");
    expect(
      (
        (resultPlus.content as Record<string, unknown>[])[0] as {
          type: string;
        }
      ).type,
    ).toBe("bulletList");
  });

  // ── Ordered lists ────────────────────────────────────────────────────────────

  it("single ordered list item", () => {
    const result = textToProseMirrorDoc("1. First");
    expect(
      ((result.content as Record<string, unknown>[])[0] as { type: string })
        .type,
    ).toBe("orderedList");
  });

  it("multiple ordered list items", () => {
    const result = textToProseMirrorDoc("1. One\n2. Two\n3. Three");
    const content = result.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("orderedList");
    expect((content[0].content as unknown[]).length).toBe(3);
  });

  it("ordered list items with ) separator", () => {
    const result = textToProseMirrorDoc("1) First\n2) Second");
    expect(
      ((result.content as Record<string, unknown>[])[0] as { type: string })
        .type,
    ).toBe("orderedList");
  });

  it("ordered list followed immediately by unordered list flushes into two nodes", () => {
    const input = "1. First\n- Bullet";
    const result = textToProseMirrorDoc(input);
    const nodes = result.content as { type: string }[];
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe("orderedList");
    expect(nodes[1].type).toBe("bulletList");
  });

  it("unordered list followed by ordered list flushes into two nodes", () => {
    const input = "- Bullet\n1. First";
    const result = textToProseMirrorDoc(input);
    const nodes = result.content as { type: string }[];
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe("bulletList");
    expect(nodes[1].type).toBe("orderedList");
  });

  // ── Fenced code blocks ──────────────────────────────────────────────────────

  it("fenced code block with language tag", () => {
    const input = "```typescript\nconst x = 1;\n```";
    const result = textToProseMirrorDoc(input);
    expect(result.content).toEqual([
      {
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [{ type: "text", text: "const x = 1;" }],
      },
    ]);
  });

  it("fenced code block without language tag → language: null", () => {
    const input = "```\nsome code\n```";
    const result = textToProseMirrorDoc(input);
    const block = (result.content as Record<string, unknown>[])[0];
    expect((block.attrs as Record<string, unknown>).language).toBeNull();
  });

  it("fenced code block with kebab-case language tag", () => {
    const input = "```shell-script\necho hi\n```";
    const result = textToProseMirrorDoc(input);
    const block = (result.content as Record<string, unknown>[])[0];
    expect((block.attrs as Record<string, unknown>).language).toBe(
      "shell-script",
    );
  });

  it("code block content is verbatim — inline marks are NOT parsed inside", () => {
    const input = "```\n**not bold** and *not italic*\n```";
    const result = textToProseMirrorDoc(input);
    const block = (result.content as Record<string, unknown>[])[0];
    const textContent = (block.content as { text: string }[])[0].text;
    expect(textContent).toBe("**not bold** and *not italic*");
  });

  it("code block preserves multi-line content with newlines", () => {
    const input = "```js\nline one\nline two\nline three\n```";
    const result = textToProseMirrorDoc(input);
    const block = (result.content as Record<string, unknown>[])[0];
    const text = (block.content as { text: string }[])[0].text;
    expect(text).toBe("line one\nline two\nline three");
  });

  it("empty fenced code block → empty content array", () => {
    const input = "```\n```";
    const result = textToProseMirrorDoc(input);
    const block = (result.content as Record<string, unknown>[])[0];
    expect(block.content).toEqual([]);
  });

  // ── Blockquotes ─────────────────────────────────────────────────────────────

  it("blockquote with single line", () => {
    const result = textToProseMirrorDoc("> Quote text");
    expect(result.content).toEqual([
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Quote text" }],
          },
        ],
      },
    ]);
  });

  it("blockquote with multiple consecutive lines", () => {
    const input = "> Line one\n> Line two";
    const result = textToProseMirrorDoc(input);
    const bq = (result.content as Record<string, unknown>[])[0] as {
      content: unknown[];
    };
    expect(bq.content).toHaveLength(2);
  });

  it("blockquote with inline marks inside", () => {
    const input = "> **Bold** in quote";
    const result = textToProseMirrorDoc(input);
    const bq = (result.content as Record<string, unknown>[])[0] as {
      content: { content: TextNode[] }[];
    };
    expect(bq.content[0].content[0].marks).toEqual([{ type: "bold" }]);
  });

  it("empty blockquote line → blockquote with empty paragraph", () => {
    const input = ">";
    const result = textToProseMirrorDoc(input);
    const bq = (result.content as Record<string, unknown>[])[0] as {
      content: unknown[];
    };
    expect(bq.content).toEqual([{ type: "paragraph" }]);
  });

  // ── Mixed content ────────────────────────────────────────────────────────────

  it("heading + paragraph + list + code block in sequence", () => {
    const input = [
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "- Item A",
      "- Item B",
      "",
      "```js",
      "console.log('hi');",
      "```",
    ].join("\n");

    const result = textToProseMirrorDoc(input);
    const nodes = result.content as { type: string }[];
    expect(nodes).toHaveLength(4);
    expect(nodes[0].type).toBe("heading");
    expect(nodes[1].type).toBe("paragraph");
    expect(nodes[2].type).toBe("bulletList");
    expect(nodes[3].type).toBe("codeBlock");
  });

  it("list items without blank line separator are grouped into one list", () => {
    const input = "- A\n- B\n- C";
    const nodes = textToProseMirrorDoc(input).content as unknown[];
    expect(nodes).toHaveLength(1);
  });

  it("list flushed by a blank line, then a new list starts", () => {
    const input = "- A\n- B\n\n- C\n- D";
    const nodes = textToProseMirrorDoc(input).content as { type: string }[];
    // Each group becomes its own bulletList
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe("bulletList");
    expect(nodes[1].type).toBe("bulletList");
  });

  it("list at end of input (no trailing newline) is flushed", () => {
    const input = "- Item";
    const result = textToProseMirrorDoc(input);
    expect((result.content as unknown[]).length).toBe(1);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it("very long line (>500 chars) becomes a paragraph", () => {
    const longText = "a".repeat(600);
    const result = textToProseMirrorDoc(longText);
    const nodes = result.content as Record<string, unknown>[];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("paragraph");
    const textNodes = nodes[0].content as TextNode[];
    expect(textNodes[0].text).toBe(longText);
  });

  it("unicode characters are preserved verbatim", () => {
    const input = "こんにちは 🌸 العالم";
    const result = textToProseMirrorDoc(input);
    const para = (result.content as { content: TextNode[] }[])[0];
    expect(para.content[0].text).toBe(input);
  });

  it("lines with only spaces are treated as blank separators", () => {
    const input = "Para one\n   \nPara two";
    const nodes = textToProseMirrorDoc(input).content as unknown[];
    expect(nodes).toHaveLength(2);
  });

  it("returns the top-level type always as 'doc'", () => {
    expect(textToProseMirrorDoc("anything").type).toBe("doc");
    expect(textToProseMirrorDoc("").type).toBe("doc");
  });

  it("content array is never empty (falls back to empty paragraph)", () => {
    // Whitespace-only → single empty paragraph
    const result = textToProseMirrorDoc("\n\n");
    expect((result.content as unknown[]).length).toBeGreaterThan(0);
  });

  it("paragraph with only inline code on the whole line", () => {
    const result = textToProseMirrorDoc("`only-code`");
    const para = (result.content as { content: TextNode[] }[])[0];
    expect(para.content).toEqual([
      { type: "text", text: "only-code", marks: [{ type: "code" }] },
    ]);
  });

  it("heading text with italic inline mark", () => {
    const result = textToProseMirrorDoc("# *Italic* heading");
    const node = (result.content as Record<string, unknown>[])[0] as {
      type: string;
      content: TextNode[];
    };
    expect(node.type).toBe("heading");
    expect(node.content[0].marks).toEqual([{ type: "italic" }]);
  });

  it("blockquote followed by a paragraph", () => {
    const input = "> Quote\n\nParagraph after";
    const nodes = textToProseMirrorDoc(input).content as { type: string }[];
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe("blockquote");
    expect(nodes[1].type).toBe("paragraph");
  });

  it("paragraph preceding a heading (no blank line required)", () => {
    // Heading is detected on trimmed line regardless of adjacent lines
    const input = "Intro\n# Heading";
    const nodes = textToProseMirrorDoc(input).content as { type: string }[];
    expect(nodes[0].type).toBe("paragraph");
    expect(nodes[1].type).toBe("heading");
  });

  it("ordered list item with bold text", () => {
    const result = textToProseMirrorDoc("1. **Step one**");
    const list = (result.content as Record<string, unknown>[])[0] as {
      content: Record<string, unknown>[];
    };
    const item = list.content[0] as {
      content: { content: TextNode[] }[];
    };
    const para = item.content[0];
    expect(para.content[0].marks).toEqual([{ type: "bold" }]);
  });

  it("deeply nested bullet list (three levels)", () => {
    const input = "- L1\n  - L2\n    - L3";
    const result = textToProseMirrorDoc(input);
    const list = (result.content as Record<string, unknown>[])[0] as {
      content: Record<string, unknown>[];
    };
    const l1Item = list.content[0] as { content: Record<string, unknown>[] };
    const l2List = l1Item.content[1] as {
      type: string;
      content: Record<string, unknown>[];
    };
    expect(l2List.type).toBe("bulletList");
    const l2Item = l2List.content[0] as { content: Record<string, unknown>[] };
    const l3List = l2Item.content[1] as { type: string };
    expect(l3List.type).toBe("bulletList");
  });

  it("code block immediately followed by paragraph (no blank line)", () => {
    const input = "```\ncode\n```\nAfter";
    const nodes = textToProseMirrorDoc(input).content as { type: string }[];
    expect(nodes[0].type).toBe("codeBlock");
    expect(nodes[1].type).toBe("paragraph");
  });
});
