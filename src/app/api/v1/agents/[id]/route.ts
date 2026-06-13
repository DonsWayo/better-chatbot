import { agentRepository } from "lib/db/repository";
import { apiError, apiOk, requirePrincipal } from "../../_lib/respond";

export const dynamic = "force-dynamic";

// GET /api/v1/agents/[id] — fetch one agent the principal can see. The
// repository's selectAgentById already enforces own-or-visible scoping, so an
// unauthorized/missing agent comes back as null → 404.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal(request, "agents:read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const agent = await agentRepository.selectAgentById(id, auth.userId);
  if (!agent) return apiError("not_found", "Agent not found");

  return apiOk({
    id: agent.id,
    name: agent.name,
    description: agent.description ?? null,
    icon: agent.icon ?? null,
    instructions: agent.instructions,
    visibility: agent.visibility,
    userId: agent.userId,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  });
}
