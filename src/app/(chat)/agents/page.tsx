import { redirect } from "next/navigation";

// The agents gallery is now the Agents tab of Studio
// (docs/design/information-architecture.md §4). Redirect kept so inbound
// links survive.
export default function AgentsRedirect() {
  redirect("/studio");
}
