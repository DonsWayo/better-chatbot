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
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Button } from "ui/button";
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
          onClick={onClick}
          className={cn(
            "size-8 rounded-lg text-muted-foreground hover:text-foreground",
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

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("linkPrompt"), previous ?? "https://");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor, t]);

  const toolbar = useMemo(() => {
    if (!editor || !editable) return null;
    return (
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-xl border border-border/60 bg-background/80 px-1.5 py-1 backdrop-blur"
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
        <ToolbarButton
          label={t("toolbar.link")}
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <Link2 className="size-4" />
        </ToolbarButton>

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
  }, [editor, editable, setLink, t]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar}
      <EditorContent editor={editor} />
    </div>
  );
}
