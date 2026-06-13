import {
  ChatExportCommentWithUser,
  ChatExportWithUser,
} from "app-types/chat-export";
import { formatDate } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { PreviewMessage } from "../message";

import Particles from "ui/particles";
import Comments from "./comments";
import DocumentPresence from "./document-presence";

export default function ChatPreview({
  thread,
  comments,
}: { thread: ChatExportWithUser; comments: ChatExportCommentWithUser[] }) {
  return (
    <div
      className="flex flex-col min-w-0 h-full relative"
      data-testid="export-preview"
    >
      <div className="absolute top-0 left-0 w-full h-full -z-10">
        <Particles particleCount={400} particleBaseSize={10} />
      </div>
      <div className="fixed top-0 right-0 p-4 flex items-center gap-2">
        <DocumentPresence exportId={thread.id} />
        <Comments id={thread.id} defaultComments={comments} />
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto pb-20">
        <div className="w-full mx-auto max-w-3xl px-6 py-8">
          <h1
            className="font-display text-3xl font-semibold tracking-tight mb-2"
            data-testid="export-title"
          >
            {thread.title}
          </h1>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            {formatDate(thread.exportedAt, "MMM d, yyyy")}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-xs">
                  <Avatar className="size-4 rounded-full">
                    <AvatarImage src={thread.exporterImage} />
                    <AvatarFallback>
                      {thread.exporterName?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent>{thread.exporterName}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {thread.messages.map((message, index) => {
          return (
            <PreviewMessage
              key={message.id}
              message={message}
              isLastMessage={index === thread.messages.length - 1}
              readonly={true}
            />
          );
        })}
      </div>
    </div>
  );
}
