import { requireAdminPermission } from "auth/permissions";
import { getSession } from "auth/server";
import { unauthorized } from "next/navigation";

import {
  type RolePackView,
  RolePacksPanel,
} from "@/components/admin/role-packs-panel";
import { getRolePackStatus } from "lib/role-packs/install";
import { ROLE_PACKS } from "lib/role-packs/packs";

export const dynamic = "force-dynamic";

export default async function RolePacksPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    unauthorized();
  }

  // Slim, serializable view model — system prompts stay on the server.
  const packs: RolePackView[] = await Promise.all(
    ROLE_PACKS.map(async (pack) => {
      const status = await getRolePackStatus(pack.id, userId);
      return {
        id: pack.id,
        title: pack.title,
        tagline: pack.tagline,
        agents: pack.agents.map((a) => ({
          name: a.name,
          description: a.description,
        })),
        workflow: {
          name: pack.workflow.name,
          description: pack.workflow.description,
        },
        schedule: {
          label: pack.schedule.label,
          description: pack.schedule.description,
          cronExpr: pack.schedule.cronExpr,
          timezone: pack.schedule.timezone,
        },
        installed: status.installed,
        installedCount: status.items.filter((i) => i.installed).length,
        totalCount: status.items.length,
      };
    }),
  );

  return <RolePacksPanel packs={packs} />;
}
