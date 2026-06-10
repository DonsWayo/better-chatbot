import { redirect } from "next/navigation";

// The workflow list is now the Workflows tab of Studio
// (docs/design/information-architecture.md §4). Redirect kept so inbound
// links survive.
export default function WorkflowRedirect() {
  redirect("/studio?tab=workflows");
}
