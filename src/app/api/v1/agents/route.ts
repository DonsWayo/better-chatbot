import { AgentCreateSchema } from "app-types/agent";
import { principalCanCreateAgent } from "lib/auth/api-key-auth";
import { agentRepository } from "lib/db/repository";
import { apiError, apiOk, requirePrincipal } from "../_lib/respond";

export const dynamic = "force-dynamic";

// GET /api/v1/agents — list agents visible to the principal (own + shared).
export async function GET(request: Request) {
  const auth = await requirePrincipal(request, "agents:read");
  if (auth instanceof Response) return auth;

  const agents = await agentRepository.selectAgents(auth.userId, ["all"], 100);
  return apiOk({
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? null,
      visibility: a.visibility,
      userId: a.userId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  });
}

// POST /api/v1/agents — create an agent (respects canCreateAgent for the
// principal's role). The agent is owned by the principal's user.
export async function POST(request: Request) {
  const auth = await requirePrincipal(request, "agents:write");
  if (auth instanceof Response) return auth;

  if (!principalCanCreateAgent(auth)) {
    return apiError(
      "forbidden",
      "This API key's role is not permitted to create agents",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON");
  }

  const parsed = AgentCreateSchema.safeParse({
    ...(body as Record<string, unknown>),
    // Ownership is the principal's user — never trust a client-supplied userId.
    userId: auth.userId,
  });
  if (!parsed.success) {
    return apiError(
      "invalid_request",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }

  const agent = await agentRepository.insertAgent(parsed.data);
  return apiOk(
    {
      id: agent.id,
      name: agent.name,
      description: agent.description ?? null,
      visibility: agent.visibility,
      userId: agent.userId,
      createdAt: agent.createdAt,
    },
    201,
  );
}
