import { redirect } from "next/navigation";

// Moved under Settings › Connectors. Redirect kept so inbound links survive.
export default async function McpModifyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/settings/connectors/${encodeURIComponent(id)}`);
}
