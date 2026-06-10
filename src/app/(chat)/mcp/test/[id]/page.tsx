import { redirect } from "next/navigation";

// Moved under Settings › Connectors. Redirect kept so inbound links survive.
export default async function McpTestRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/settings/connectors/test/${encodeURIComponent(id)}`);
}
