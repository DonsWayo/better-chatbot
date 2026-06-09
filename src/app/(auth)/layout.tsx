import { getSession } from "lib/auth/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AsafeLogo } from "@/components/layouts/asafe-logo";
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
          {/* Left panel — video background with vignette */}
          <div className="hidden lg:flex lg:w-1/2 border-r flex-col p-18 relative overflow-hidden">
            {/* Background video */}
            <video
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              src="/brand/login-bg.mp4"
            />
            {/* Edge vignette overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
              }}
            />
            {/* Content above video */}
            <div className="relative z-10 animate-in fade-in duration-1000">
              <AsafeLogo className="h-10" />
            </div>
            <div className="flex-1" />
            <div className="relative z-10">
              <FlipWords
                words={[t("description")]}
                className="mb-4 text-white/80"
              />
            </div>
          </div>

          <div className="w-full lg:w-1/2 p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
