import { ApiKeysPanel } from "@/components/admin/api-keys-panel";
import { requireAdminPermission } from "auth/permissions";
import { getAdminTeams } from "lib/admin/teams";
import { unauthorized } from "next/navigation";
import { listApiKeysAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const [keys, teams] = await Promise.all([
    listApiKeysAction(),
    getAdminTeams(),
  ]);

  return (
    <ApiKeysPanel
      initialKeys={keys}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
