import { redirect } from "next/navigation";

// /triage was renamed to /inbox (information-architecture.md §5).
// This server redirect protects existing deep links.
export default function TriageRedirectPage() {
  redirect("/inbox");
}
