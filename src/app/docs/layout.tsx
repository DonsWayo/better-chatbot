import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { source } from "./source";
import "./docs.css";

// /docs — platform documentation (Fumadocs). The fumadocs theme provider is
// disabled: the app root layout already mounts next-themes with the
// `class` attribute, which fumadocs' `.dark` styles key off.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        tree={source.getPageTree()}
        nav={{ title: "asafe-ai docs" }}
        githubUrl="https://github.com/cgoinglove/better-chatbot"
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
