/**
 * GET /api/gateway/openrouter/models
 *
 * Returns the caller's ENTITLED model list (approved short list ∩ org/team
 * allow-list ∪ per-user grants) so the desktop's opencode surface can
 * populate its model map. Same auth as the chat-completions proxy:
 * `Authorization: Bearer <better-auth session cookie value>`.
 *
 * Shape (OpenAI-models-list compatible, plus a human-readable name):
 *   { "object": "list", "data": [{ "id": "gpt-5.1", "object": "model", "name": "GPT-5.1" }, …] }
 */

import {
  authenticateGatewayRequest,
  gatewayError,
  getEntitledGatewayModels,
} from "../shared";

export async function GET(request: Request) {
  const caller = await authenticateGatewayRequest(request);
  if (!caller) {
    return gatewayError(
      401,
      "unauthorized",
      "Invalid or missing session token. Send `Authorization: Bearer <better-auth session cookie value>`.",
    );
  }

  const models = await getEntitledGatewayModels(caller);
  return Response.json({
    object: "list",
    data: models.map((m) => ({ id: m.id, object: "model", name: m.name })),
  });
}
