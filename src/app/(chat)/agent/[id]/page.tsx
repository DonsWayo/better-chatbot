import EditAgent from "@/components/agent/edit-agent";
import { canCreateAgent } from "lib/auth/client-permissions";
import { agentRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { notFound, redirect } from "next/navigation";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  if (!session?.user.id) {
    redirect("/sign-in");
  }

  // For new agents, pass no initial data. Gate the creation form behind the
  // SAME permission the POST /api/agent route enforces (canCreateAgent): basic
  // users (role "user") otherwise see the full form and hit a cryptic 403 on
  // Save. Mirror how /studio redirects non-builders away.
  if (id === "new") {
    if (!canCreateAgent(session.user.role)) {
      redirect("/");
    }
    return <EditAgent userId={session.user.id} />;
  }

  // Fetch the agent data on the server
  const agent = await agentRepository.selectAgentById(id, session.user.id);

  if (!agent) {
    notFound();
  }

  const isOwner = agent.userId === session.user.id;
  const hasEditAccess = isOwner || agent.visibility === "public";

  return (
    <EditAgent
      key={id}
      initialAgent={agent}
      userId={session.user.id}
      isOwner={isOwner}
      hasEditAccess={hasEditAccess}
      isBookmarked={agent.isBookmarked || false}
    />
  );
}
