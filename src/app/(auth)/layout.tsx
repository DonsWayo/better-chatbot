import { getSession } from "lib/auth/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AsafeLogo } from "@/components/layouts/asafe-logo";
import { BackgroundPaths } from "ui/background-paths";
import { FlipWords } from "ui/flip-words";

export default async function AuthLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getSession();
  if (session) {
    redirect("/");
  }
  const t = await getTranslations("Auth.Intro");
  return (
    <main className="relative w-full flex flex-col h-screen">
      <div className="flex-1">
        <div className="flex min-h-screen w-full">
          <div className="hidden lg:flex lg:w-1/2 bg-muted border-r flex-col p-18 relative">
            <div className="absolute inset-0 w-full h-full">
              <BackgroundPaths />
            </div>
            <div className="animate-in fade-in duration-1000">
              <AsafeLogo className="h-10" />
            </div>
            <div className="flex-1" />
            <FlipWords
              words={[t("description")]}
              className=" mb-4 text-muted-foreground"
            />
          </div>

          <div className="w-full lg:w-1/2 p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
