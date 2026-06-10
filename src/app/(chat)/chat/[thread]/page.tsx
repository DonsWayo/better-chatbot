import { selectThreadWithMessagesAction } from "@/app/api/chat/actions";
import ChatBot from "@/components/chat-bot";
import { PresenceAvatars } from "@/components/realtime/presence-avatars";

import { ChatMessage, ChatThread } from "app-types/chat";
import { getSession } from "auth/server";
import { isThreadShared } from "lib/teamspaces/folders";
import { RedirectType, redirect } from "next/navigation";

const fetchThread = async (
  threadId: string,
): Promise<(ChatThread & { messages: ChatMessage[] }) | null> => {
  return await selectThreadWithMessagesAction(threadId);
};

export default async function Page({
  params,
}: { params: Promise<{ thread: string }> }) {
  const { thread: threadId } = await params;

  const thread = await fetchThread(threadId);

  if (!thread) redirect("/", RedirectType.replace);

  // Presence only mounts on actually-shared threads ("team"-visible inside a
  // team folder) — same server-side gating idea as the live shared view.
  const [session, shared] = await Promise.all([
    getSession(),
    isThreadShared(threadId),
  ]);
  const userId = session?.user?.id;

  return (
    <>
      {shared && userId && (
        <div className="absolute top-14 right-5 z-30">
          <PresenceAvatars
            contextType="thread"
            contextId={threadId}
            selfUserId={userId}
          />
        </div>
      )}
      <ChatBot threadId={threadId} initialMessages={thread.messages} />
    </>
  );
}
