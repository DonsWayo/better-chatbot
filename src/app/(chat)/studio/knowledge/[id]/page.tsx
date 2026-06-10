import { getSession } from "auth/server";
import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "lib/auth/client-permissions";
import { redirect } from "next/navigation";

import { KnowledgeCollectionDetail } from "@/components/knowledge/knowledge-collection-detail";

// Studio › Knowledge › collection detail. Same builder gating as the Studio
// home — basic users are redirected away. Access to the collection itself is
// enforced by the knowledge APIs (unified visibility model).
export const dynamic = "force-dynamic";

export default async function KnowledgeCollectionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

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

  return <KnowledgeCollectionDetail id={id} />;
}
