import { getSession } from "auth/server";
import { documentRepository } from "lib/db/repository";
import { redirect } from "next/navigation";

import { DocumentsList } from "@/components/documents/documents-list";

/**
 * /documents — the user's collaborative-document home. Lists their own docs plus
 * any shared/team/company docs they can read. Available to ALL authenticated
 * users (documents are personal/collaborative like chat threads, not builder-
 * gated). This page holds NO Electric connection — the near-live subscriber and
 * presence heartbeat live only on /documents/[id], so a normal load reaches
 * network-idle.
 */
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const documents = await documentRepository.listDocumentsForUser(
    session.user.id,
  );
  return <DocumentsList initialDocuments={documents} />;
}
