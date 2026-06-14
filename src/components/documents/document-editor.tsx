"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "lib/utils";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import { Separator } from "ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

/**
 * Rich-text editor for collaborative documents. Emits / accepts ProseMirror
 * JSON (editor.getJSON()) that round-trips to asafe_document.content. StarterKit
 * supplies headings (h1–h3), bold/italic/strike/code, bullet + ordered lists,
 * blockquote, code block and horizontal rule; Placeholder + Link round out the
 * Notion-like feel. Styling uses the app tokens (teal primary) via the scoped
 * `.document-prose` block at the bottom — the project doesn't ship the Tailwind
 * typography plugin, so prose styling is defined here explicitly.
 *
 * Stateless about persistence: the parent owns autosave (see DocumentEditorPage)
 * and feeds `onUpdate` the latest JSON.
 */

export interface DocumentEditorProps {
  /** Initial ProseMirror JSON (asafe_document.content). */
  initialContent: Record<string, unknown>;
  /** Called with the latest JSON on every edit. */
  onUpdate?: (json: Record<string, unknown>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Read-only when the viewer lacks edit access. */
  editable?: boolean;
  /** Exposes the editor instance so the parent can force-replace content
   *  (near-live remote apply / version restore) without remounting. */
  editorRef?: (editor: Editor | null) => void;
  className?: string;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          // Keep the toolbar out of the natural Tab sequence so Tab moves
          // title input → editor body (ProseMirror), not title → toolbar
          // buttons. The buttons remain reachable by mouse and the editor body
          // keeps its own focus; this restores the expected writing flow.
          tabIndex={-1}
          onClick={onClick}
          className={cn(
            "size-8 min-h-9 min-w-9 rounded-lg text-muted-foreground hover:text-foreground md:min-h-0 md:min-w-0",
            active && "bg-primary/10 text-primary hover:text-primary",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Link control: a small popover with a URL input + Apply/Remove, replacing the
 * raw window.prompt (unstyled, untranslatable, blocking). Manages its own open
 * state so the memoized toolbar doesn't need to re-create on every keystroke.
 */
function LinkButton({
  editor,
  label,
  placeholder,
  applyLabel,
  removeLabel,
}: {
  editor: Editor;
  label: string;
  placeholder: string;
  applyLabel: string;
  removeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const active = editor.isActive("link");

  const apply = () => {
    const url = value.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url === "") chain.unsetLink().run();
    else chain.setLink({ href: url }).run();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next)
          setValue((editor.getAttributes("link").href as string) ?? "");
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              aria-pressed={active}
              tabIndex={-1}
              className={cn(
                "size-8 min-h-9 min-w-9 rounded-lg text-muted-foreground hover:text-foreground md:min-h-0 md:min-w-0",
                active && "bg-primary/10 text-primary hover:text-primary",
              )}
            >
              <Link2 className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
      >
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            className="h-9 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            {active ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setValue("");
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                {removeLabel}
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" onClick={apply}>
              {applyLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DocumentEditor({
  initialContent,
  onUpdate,
  onFocus,
  onBlur,
  editable = true,
  editorRef,
  className,
}: DocumentEditorProps) {
  const t = useTranslations("Documents");

  const editor = useEditor({
    editable,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: t("editorPlaceholder"),
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "document-link", rel: "noopener noreferrer" },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "document-prose focus:outline-none min-h-[60vh]",
        "data-testid": "document-editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getJSON() as Record<string, unknown>);
    },
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  });

  useEffect(() => {
    editorRef?.(editor ?? null);
    return () => editorRef?.(null);
  }, [editor, editorRef]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  const toolbar = useMemo(() => {
    if (!editor || !editable) return null;
    return (
      <div
        // Single row that scrolls horizontally on narrow viewports (≈380px)
        // instead of wrapping to two rows: flex-nowrap + overflow-x-auto +
        // scrollbar-hide. Buttons keep their intrinsic size (shrink-0) so they
        // never squash; desktop is unaffected (the row simply fits without
        // needing to scroll).
        className="sticky top-0 z-10 flex flex-nowrap items-center gap-0.5 overflow-x-auto scrollbar-hide rounded-xl border border-border/60 bg-background/80 px-1.5 py-1 backdrop-blur [&>*]:shrink-0"
        data-testid="document-toolbar"
      >
        <ToolbarButton
          label={t("toolbar.h1")}
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <Heading1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.h2")}
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.h3")}
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolbarButton
          label={t("toolbar.bold")}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.italic")}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.strike")}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.code")}
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-4" />
        </ToolbarButton>
        <LinkButton
          editor={editor}
          label={t("toolbar.link")}
          placeholder={t("linkPrompt")}
          applyLabel={t("toolbar.linkApply")}
          removeLabel={t("toolbar.linkRemove")}
        />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolbarButton
          label={t("toolbar.bulletList")}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.orderedList")}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.blockquote")}
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.codeBlock")}
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t("toolbar.horizontalRule")}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="size-4" />
        </ToolbarButton>
      </div>
    );
  }, [editor, editable, t]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar}
      <EditorContent editor={editor} />
    </div>
  );
}
