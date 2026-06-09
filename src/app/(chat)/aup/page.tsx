import { getSession } from "lib/auth/server";
import { redirect } from "next/navigation";
import { hasAcceptedAup, CURRENT_AUP_VERSION } from "lib/compliance/aup";
import { AupClient } from "@/components/compliance/aup-client";

export const metadata = { title: "Acceptable Use Policy — Asafe AI" };

export default async function AupPage() {
  const session = await getSession();
  if (!session) redirect("/auth/signin");

  const accepted = await hasAcceptedAup(session.user.id);
  if (accepted) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <AupClient version={CURRENT_AUP_VERSION} />
    </div>
  );
}
