import { getSession } from "auth/server";
import { documentRepository } from "lib/db/repository";
import { notFound, redirect } from "next/navigation";

import { DocumentEditorPage } from "@/components/documents/document-editor-page";

/**
 * /documents/[id] — the editor surface for a single document.
 *
 * Server-side ACL: read access (unified visibility) is required to open the doc;
 * without it we 404 (don't leak existence). Edit access (owner/admin or an
 * edit/manage grant) decides whether the editor is writable. The body + autosave
 * + the SINGLE page-scoped Electric near-live subscriber + presence all live in
 * the client component — they mount only here, never in the sidebar, so the rest
 * of the app opens zero new connections.
 */
export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  // Read access first — 404 rather than leak the doc's existence.
  const canRead = await documentRepository.checkAccess(id, userId, true);
  if (!canRead) notFound();

  const doc = await documentRepository.getDocumentById(id);
  if (!doc) notFound();

  const canEdit = await documentRepository.checkAccess(id, userId, false);

  return (
    <DocumentEditorPage document={doc} selfUserId={userId} canEdit={canEdit} />
  );
}
