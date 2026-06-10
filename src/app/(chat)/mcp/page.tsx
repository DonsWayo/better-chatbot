import { redirect } from "next/navigation";

// The personal MCP suite moved under Settings › Connectors.
// docs/design/information-architecture.md §2. Redirect kept so inbound
// links survive.
export default function McpIndexRedirect() {
  redirect("/settings/connectors");
}
