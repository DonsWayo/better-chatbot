"use client";

import { ChatExportCommentWithUser } from "app-types/chat-export";
import { TipTapMentionJsonContent } from "app-types/util";
import { LoaderIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { Button } from "ui/button";
import MentionInput from "../mention-input";

export default function CommentForm({
  exportId,
  parentId,
  authorId,
  authorName,
  authorImage,
  onSubmit,
}: {
  exportId: string;
  parentId?: string;
  authorId?: string;
  authorName?: string | null;
  authorImage?: string;
  onSubmit?: (created?: ChatExportCommentWithUser) => void;
}) {
  const [content, setContent] = useState<
    TipTapMentionJsonContent | undefined | string
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { mutate } = useSWRConfig();

  const handleSubmit = async () => {
    if (!content) return;

    try {
      setIsSubmitting(true);

      const trimContent = (content as TipTapMentionJsonContent).content?.filter(
        (item) => {
          if (item.type == "paragraph" && !item.content) return false;
          return true;
        },
      );

      if ((content as TipTapMentionJsonContent).content) {
        (content as TipTapMentionJsonContent).content = trimContent;
      }

      const response = await fetch(`/api/export/${exportId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          parentId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create comment");
      }

      // Build an optimistic comment so it shows instantly and survives a poll
      // that fires before this POST's revalidation lands. mergeComments retires
      // it once the server returns the real row. A temporary id keeps it
      // distinct from server ids until then.
      const now = new Date();
      const optimistic: ChatExportCommentWithUser | undefined = authorId
        ? {
            id: `optimistic-${crypto.randomUUID()}`,
            exportId,
            authorId,
            parentId,
            content: content as TipTapMentionJsonContent,
            createdAt: now,
            updatedAt: now,
            authorName: authorName ?? "You",
            authorImage,
            isOwner: true,
          }
        : undefined;

      // Reset form
      setContent("");
      // Refresh comments
      mutate(`/api/export/${exportId}/comments`);

      onSubmit?.(optimistic);
    } catch (error) {
      console.error("Failed to create comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContentChange = ({
    json,
  }: {
    json: TipTapMentionJsonContent;
    mentions: { label: string; id: string }[];
  }) => {
    setContent(json);
  };

  return (
    <div className="flex gap-2 items-end w-full" data-testid="comment-form">
      <div className="flex-1 bg-secondary rounded-lg p-0.5">
        <MentionInput
          className="text-sm"
          placeholder="Write a comment..."
          content={content}
          onChange={handleContentChange}
          onEnter={handleSubmit}
          disabledMention={true}
        />
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={handleSubmit}
        disabled={!content || isSubmitting}
        data-testid="comment-submit"
      >
        {isSubmitting ? (
          <LoaderIcon className="mr-1 animate-spin" />
        ) : (
          <SendIcon className="mr-1" />
        )}
      </Button>
    </div>
  );
}
