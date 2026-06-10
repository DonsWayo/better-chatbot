import { PreviewMessage } from "@/components/message";
import { LiveThreadMessages } from "@/components/realtime/live-thread-messages";
import { UIMessage } from "ai";
import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { canReadThread, getThreadTeam } from "lib/teamspaces/folders";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export default async function SharedThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) notFound();

  if (!(await canReadThread(threadId, userId))) notFound();

  const thread = await chatRepository.selectThreadDetails(threadId);
  if (!thread) notFound();

  const [team, t] = await Promise.all([
    getThreadTeam(threadId),
    getTranslations("Teamspaces"),
  ]);

  const messages = thread.messages.map(
    (message) =>
      ({
        id: message.id,
        role: message.role,
        parts: message.parts,
        metadata: message.metadata,
      }) as UIMessage,
  );

  return (
    <div
      className="flex flex-col min-w-0 h-full relative"
      data-testid="shared-thread-view"
    >
      {/* Live island: subscribes to this thread's chat_message shape via the
          authenticated Electric proxy and router.refresh()es this server
          component when teammates add messages. Renders nothing itself. */}
      <LiveThreadMessages threadId={threadId} />
      <div className="flex flex-col gap-2 overflow-y-auto pb-20">
        <div className="w-full mx-auto max-w-3xl px-6 py-8">
          <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground w-fit">
            <Users className="size-3.5" />
            <span>
              {t("sharedWithTeamReadOnly", {
                team: team?.name ?? t("team"),
              })}
            </span>
          </div>
          <h1
            className="font-display text-3xl font-semibold tracking-tight"
            data-testid="shared-thread-title"
          >
            {thread.title}
          </h1>
        </div>
        {messages.map((message, index) => (
          <PreviewMessage
            key={message.id}
            message={message}
            isLastMessage={index === messages.length - 1}
            readonly={true}
          />
        ))}
      </div>
    </div>
  );
}
