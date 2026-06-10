import { getSession } from "auth/server";
import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "lib/auth/client-permissions";
import { agentRepository } from "lib/db/repository";
import { redirect } from "next/navigation";

import { AgentsList } from "@/components/agent/agents-list";
import { StudioTabs } from "@/components/studio/studio-tabs";
import WorkflowListPage from "@/components/workflow/workflow-list-page";

// Studio — the single role-gated builder home (Agents + Workflows tabs).
// Basic users never see it; we redirect them away so there's no empty chrome.
// docs/design/information-architecture.md §4.
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }

  const role = session.user.role;
  const isBuilder =
    canCreateAgent(role) || canCreateWorkflow(role) || canEditWorkflow(role);
  if (!isBuilder) {
    redirect("/");
  }

  const allAgents = await agentRepository.selectAgents(
    session.user.id,
    ["mine", "shared"],
    50,
  );
  const myAgents = allAgents.filter(
    (agent) => agent.userId === session.user.id,
  );
  const sharedAgents = allAgents.filter(
    (agent) => agent.userId !== session.user.id,
  );

  return (
    <StudioTabs
      agentsSlot={
        <AgentsList
          initialMyAgents={myAgents}
          initialSharedAgents={sharedAgents}
          userId={session.user.id}
          userRole={role}
        />
      }
      workflowsSlot={<WorkflowListPage userRole={role} />}
    />
  );
}
