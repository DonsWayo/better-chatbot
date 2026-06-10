import { getSession } from "auth/server";
import { getUserPrimaryTeamId } from "lib/admin/teams";
import { userRepository } from "lib/db/repository";
import { resolveMemoryPolicy } from "lib/memory/policy";
import { listActiveMemories } from "lib/memory/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/memory — SWR feed for the memory manager
 * (Settings → Personalization): active memories (embeddings stripped), the
 * user's tri-state mode, and the resolved org/team policy so the UI can
 * surface "disabled by your organization". Mutations go through Server
 * Actions in ./actions.ts (docs/CLAUDE.md decision matrix).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const teamId = await getUserPrimaryTeamId(userId);
  const [policy, preferences, memories] = await Promise.all([
    resolveMemoryPolicy(teamId),
    userRepository.getPreferences(userId),
    listActiveMemories(userId),
  ]);

  return NextResponse.json({
    policy,
    mode: preferences?.memoryMode ?? "on",
    memories: memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      confidence: m.confidence,
      createdAt: m.createdAt,
      lastUsedAt: m.lastUsedAt,
    })),
  });
}
