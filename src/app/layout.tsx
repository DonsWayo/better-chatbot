import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Schibsted_Grotesk,
} from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import {
  ThemeProvider,
  ThemeStyleProvider,
} from "@/components/layouts/theme-provider";
import { CapacitorBridge } from "@/components/native/capacitor-bridge";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "ui/sonner";
// Design language ("Calm Industrial", docs/design/ui-language.md):
// Schibsted Grotesk = body/UI; Bricolage Grotesque = display moments.
const appSans = Schibsted_Grotesk({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const appDisplay = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Conek AI",
  description:
    "A Safe Digital's internal AI assistant — connected, governed, and grounded in company knowledge.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${appSans.variable} ${appDisplay.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          themes={["light", "dark"]}
          storageKey="app-theme-v2"
          disableTransitionOnChange
        >
          <ThemeStyleProvider>
            <NextIntlClientProvider>
              <div id="root">
                {children}
                <Toaster richColors />
                {/* Mobile (Capacitor) shell niceties — no-op on plain web */}
                <CapacitorBridge />
              </div>
            </NextIntlClientProvider>
          </ThemeStyleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
