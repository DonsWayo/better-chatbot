"use client";

import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "lib/auth/client-permissions";
import { useTranslations } from "next-intl";
import type { Step, Tour } from "nextstepjs";
import { useMemo } from "react";

import { TOUR_ADMIN, TOUR_STUDIO, TOUR_WELCOME } from "./tour-logic";

// Selector targets (all stable ids/testids that already exist in the app,
// except #tour-new-chat which app-sidebar-menus.tsx adds for the tour):
// - #tour-new-chat                                  sidebar New Chat button
// - [data-testid="sidebar-search"]                  sidebar Search (⌘K)
// - [data-testid="sidebar-inbox-link"]              sidebar Inbox
// - fieldset:has([data-testid="model-selector-button"])  the composer wrapper
//   (prompt-input.tsx is read-only for us; :has() reaches the wrapper from
//   the model-selector testid inside it)
// - [data-testid="sidebar-user-button"]             profile/settings menu
// - [data-testid="studio-tabs"] + studio-tab-*      Studio tabs
// - [data-testid="admin-sidebar-link-*"]            admin rail items

const POINTER = { pointerPadding: 8, pointerRadius: 16 } as const;

function step(partial: Omit<Step, "icon">): Step {
  return { icon: null, showSkip: true, ...POINTER, ...partial };
}

/**
 * Builds the Tour[] for NextStep from the user's role. The studio tour is
 * only included for users who can see Studio (same predicate as the
 * sidebar entry); the admin tour only for admins.
 */
export function useTourSteps(userRole?: string | null): Tour[] {
  const t = useTranslations("Tours");

  return useMemo(() => {
    const canSeeStudio =
      canCreateAgent(userRole) ||
      canCreateWorkflow(userRole) ||
      canEditWorkflow(userRole);
    const isAdmin = userRole === "admin";

    const tours: Tour[] = [
      {
        tour: TOUR_WELCOME,
        steps: [
          // Centered intro — no selector
          step({
            title: t("Welcome.introTitle"),
            content: t("Welcome.introContent"),
          }),
          step({
            title: t("Welcome.newChatTitle"),
            content: t("Welcome.newChatContent"),
            selector: "#tour-new-chat",
            side: "right",
          }),
          step({
            title: t("Welcome.searchTitle"),
            content: t("Welcome.searchContent"),
            selector: '[data-testid="sidebar-search"]',
            side: "right",
          }),
          step({
            title: t("Welcome.inboxTitle"),
            content: t("Welcome.inboxContent"),
            selector: '[data-testid="sidebar-inbox-link"]',
            side: "right",
          }),
          step({
            title: t("Welcome.composerTitle"),
            content: t("Welcome.composerContent"),
            selector: 'fieldset:has([data-testid="model-selector-button"])',
            side: "top",
          }),
          step({
            title: t("Welcome.profileTitle"),
            content: t("Welcome.profileContent"),
            selector: '[data-testid="sidebar-user-button"]',
            side: "right-bottom",
          }),
        ],
      },
    ];

    if (canSeeStudio) {
      tours.push({
        tour: TOUR_STUDIO,
        steps: [
          // The tour only auto-starts on /studio (AppTours controller), so
          // no nextRoute hop is needed — the anchors are already mounted.
          step({
            title: t("Studio.introTitle"),
            content: t("Studio.introContent"),
            selector: '[data-testid="studio-tabs"]',
            side: "bottom",
          }),
          step({
            title: t("Studio.agentsTitle"),
            content: t("Studio.agentsContent"),
            selector: '[data-testid="studio-tab-agents"]',
            side: "bottom",
          }),
          step({
            title: t("Studio.workflowsTitle"),
            content: t("Studio.workflowsContent"),
            selector: '[data-testid="studio-tab-workflows"]',
            side: "bottom",
          }),
          step({
            title: t("Studio.knowledgeTitle"),
            content: t("Studio.knowledgeContent"),
            selector: '[data-testid="studio-tab-knowledge"]',
            side: "bottom",
          }),
        ],
      });
    }

    if (isAdmin) {
      tours.push({
        tour: TOUR_ADMIN,
        steps: [
          step({
            title: t("Admin.introTitle"),
            content: t("Admin.introContent"),
            selector: '[data-testid="admin-sidebar"]',
            side: "right",
          }),
          step({
            title: t("Admin.usersTitle"),
            content: t("Admin.usersContent"),
            selector: '[data-testid="admin-sidebar-link-users"]',
            side: "right",
          }),
          step({
            title: t("Admin.teamsTitle"),
            content: t("Admin.teamsContent"),
            selector: '[data-testid="admin-sidebar-link-teams"]',
            side: "right",
          }),
          step({
            title: t("Admin.mcpTitle"),
            content: t("Admin.mcpContent"),
            selector: '[data-testid="admin-sidebar-link-mcp"]',
            side: "right",
          }),
          step({
            title: t("Admin.flagsTitle"),
            content: t("Admin.flagsContent"),
            selector: '[data-testid="admin-sidebar-link-feature-flags"]',
            side: "right",
          }),
        ],
      });
    }

    return tours;
  }, [t, userRole]);
}
