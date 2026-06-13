import { workflowRepository } from "lib/db/repository";
import { apiOk, requirePrincipal } from "../_lib/respond";

export const dynamic = "force-dynamic";

// GET /api/v1/workflows — list workflows visible to the principal.
export async function GET(request: Request) {
  const auth = await requirePrincipal(request, "workflows:read");
  if (auth instanceof Response) return auth;

  const workflows = await workflowRepository.selectAll(auth.userId);
  return apiOk({
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description ?? null,
      visibility: w.visibility,
      isPublished: w.isPublished,
      userId: w.userId,
      updatedAt: w.updatedAt,
    })),
  });
}
