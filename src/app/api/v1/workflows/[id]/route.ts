import { workflowRepository } from "lib/db/repository";
import { apiError, apiOk, requirePrincipal } from "../../_lib/respond";

export const dynamic = "force-dynamic";

// GET /api/v1/workflows/[id] — fetch one workflow the principal can read.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal(request, "workflows:read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const hasAccess = await workflowRepository
    .checkAccess(id, auth.userId, true)
    .catch(() => false);
  if (!hasAccess) return apiError("not_found", "Workflow not found");

  const workflow = await workflowRepository.selectById(id);
  if (!workflow) return apiError("not_found", "Workflow not found");

  return apiOk({
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? null,
    visibility: workflow.visibility,
    isPublished: workflow.isPublished,
    userId: workflow.userId,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  });
}
