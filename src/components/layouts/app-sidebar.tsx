"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar, SidebarContent, SidebarFooter } from "ui/sidebar";
import Particles from "ui/particles";

import { AppSidebarAgents } from "./app-sidebar-agents";
import { AppSidebarMenus } from "./app-sidebar-menus";
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
          <AppSidebarMenus user={user} />
          <AppSidebarAgents userRole={userRole} />
          <AppSidebarThreads />
        </div>
      </SidebarContent>
      <SidebarFooter className="flex flex-col items-stretch space-y-2">
        <AppSidebarUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
