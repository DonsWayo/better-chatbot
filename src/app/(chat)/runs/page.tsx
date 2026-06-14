import { redirect } from "next/navigation";

// /runs has no list view of its own — the runs/triage list lives in the Inbox
// (/inbox; /triage is itself a legacy redirect to /inbox). Bare /runs used to
// 404; this server redirect sends it to the runs list. The per-run transcript
// at /runs/[id] is unaffected.
export default function RunsIndexRedirectPage() {
  redirect("/inbox");
}
