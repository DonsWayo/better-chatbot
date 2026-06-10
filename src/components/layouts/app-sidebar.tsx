"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Particles from "ui/particles";
import { Sidebar, SidebarContent, SidebarFooter } from "ui/sidebar";

import { AppSidebarAgents } from "./app-sidebar-agents";
import { AppSidebarMenus } from "./app-sidebar-menus";
import { AppSidebarRuns } from "./app-sidebar-runs";
import { AppSidebarThreads } from "./app-sidebar-threads";
import { AsafeLogo } from "./asafe-logo";
import { SidebarHeaderShared } from "./sidebar-header";

import { BasicUser } from "app-types/user";
import { Shortcuts, isShortcutEvent } from "lib/keyboard-shortcuts";
import { AppSidebarUser } from "./app-sidebar-user";

export function AppSidebar({
  user,
}: {
  user?: BasicUser;
}) {
  const userRole = user?.role;
  const router = useRouter();
  const pathname = usePathname();

  // Handle new chat shortcut (specific to main app)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, Shortcuts.openNewChat)) {
        e.preventDefault();
        router.push("/");
        router.refresh();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // Admin console is a hard mode-swap: /admin/* renders its own left nav
  // (admin-sidebar.tsx in the (admin) route-group layout), not the daily
  // sidebar. See docs/design/information-architecture.md §3.
  if (pathname.startsWith("/admin")) return null;

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/80"
    >
      {/* A-SAFE pellet particles drifting behind the sidebar content */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-50 fade-in animate-in duration-5000">
        <Particles
          className="bg-transparent"
          particleCount={80}
          particleBaseSize={8}
          speed={0.06}
          alphaParticles
        />
      </div>
      <SidebarHeaderShared
        title={<AsafeLogo className="h-7" />}
        href="/"
        enableShortcuts={true}
        onLinkClick={() => {
          router.push("/");
          router.refresh();
        }}
      />

      <SidebarContent className="mt-2 overflow-hidden relative">
        <div className="flex flex-col overflow-y-auto">
          <AppSidebarMenus />
          <AppSidebarAgents userRole={userRole} />
          <AppSidebarRuns />
          <AppSidebarThreads />
        </div>
      </SidebarContent>
      <SidebarFooter className="flex flex-col items-stretch space-y-2">
        <AppSidebarUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
