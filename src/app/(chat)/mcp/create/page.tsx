import { redirect } from "next/navigation";

// Moved under Settings › Connectors. Preserve query params (name/config)
// from recommended-MCP deep links.
export default async function McpCreateRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  const name = params.name;
  const config = params.config;
  if (typeof name === "string") qs.set("name", name);
  if (typeof config === "string") qs.set("config", config);
  const suffix = qs.toString();
  redirect(`/settings/connectors/create${suffix ? `?${suffix}` : ""}`);
}
