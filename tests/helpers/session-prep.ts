import { type Page, expect } from "@playwright/test";

// Shared per-user session preparation for UI specs.
//
// Two first-run overlays can sit on top of any authenticated page and
// intercept clicks:
//  1. The AUP modal (src/components/compliance/aup-modal.tsx) — opens while
//     GET /api/compliance/aup reports accepted=false.
//  2. The onboarding tours (src/components/tour/app-tours.tsx) — auto-start
//     on "/", "/studio" and "/admin" once the AUP is accepted, unless the
//     tour name is already in UserPreferences.completedTours.
//
// Specs that are NOT about those features call suppressOnboardingOverlays()
// before navigating; the tours spec instead resets completedTours on a
// dedicated test user.

export const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

/** All tour names from src/components/tour/tour-logic.ts. */
export const ALL_TOUR_NAMES = ["welcome", "studio", "admin"] as const;

/** Cookie-based API sign-in (same pattern as tests/lifecycle/auth-states.setup.ts). */
export async function signInViaApi(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json" },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(res.status(), `sign-in as ${credentials.email}`).toBe(200);
}

/** GET /api/user/preferences for the signed-in user ({} when unset). */
export async function getPreferences(
  page: Page,
): Promise<Record<string, unknown>> {
  const res = await page.request.get("/api/user/preferences");
  expect(res.ok(), "GET /api/user/preferences").toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

/** PUT /api/user/preferences (full replace — merge with GET first). */
export async function putPreferences(
  page: Page,
  preferences: Record<string, unknown>,
): Promise<void> {
  const res = await page.request.put("/api/user/preferences", {
    headers: { "Content-Type": "application/json" },
    data: preferences,
  });
  expect(res.ok(), "PUT /api/user/preferences").toBeTruthy();
}

/** Overwrite completedTours while preserving the rest of the preferences. */
export async function setCompletedTours(
  page: Page,
  tours: string[],
): Promise<void> {
  const prefs = await getPreferences(page);
  await putPreferences(page, { ...prefs, completedTours: tours });
}

/**
 * Record AUP acceptance for the signed-in user (idempotent). The compliance
 * seed (tests/helpers/seed-compliance.ts) fills asafe_aup_acceptance, but the
 * live gates — the AUP modal and the tour auto-start — read user.accepted_aup_at
 * via /api/compliance/aup, so specs accept through the same endpoint.
 */
export async function acceptAupViaApi(page: Page): Promise<void> {
  const res = await page.request.post("/api/compliance/aup");
  expect(res.ok(), "POST /api/compliance/aup").toBeTruthy();
}

/**
 * Make the signed-in user safe for UI interaction: mark every tour completed
 * FIRST (so none can auto-start), then accept the AUP (acceptance is what
 * unblocks tour auto-start, so the order matters).
 */
export async function suppressOnboardingOverlays(page: Page): Promise<void> {
  await setCompletedTours(page, [...ALL_TOUR_NAMES]);
  await acceptAupViaApi(page);
}
