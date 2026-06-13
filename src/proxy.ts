import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // The public programmatic API (/api/v1) authenticates with an
  // `Authorization: Bearer ck_live_...` API key, NOT a session cookie. The
  // cookie short-circuit below would 401 every external caller before the
  // route's own authenticateApiKey runs, so let /api/v1 through to it.
  if (pathname.startsWith("/api/v1/")) {
    return NextResponse.next();
  }

  // /admin is the admin console Dashboard (admin-sidebar.tsx); Users lives
  // at /admin/users — the old /admin → /admin/users redirect is gone.

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // API routes must answer with a machine-readable 401 rather than a 307
    // redirect to the HTML sign-in page. A fetch/XHR client cannot consume a
    // redirect to /sign-in, and following it (Playwright/browsers do) yields a
    // misleading 200. Route handlers all call getSession → 401/403 themselves,
    // so this only matters for the no-cookie short-circuit here.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // asafe-ai: /api/health + /api/metrics must stay public (k8s probes + Prometheus scrape — ADR-0006).
    // asafe-ai: also exclude static brand/image assets so they load on the unauthenticated sign-in page.
    // asafe-ai: /docs (+ its /api/search index) is the platform documentation — readable without a session.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|api/health|api/metrics|api/search|docs|export|sign-in|sign-up|.*\\.(?:png|svg|jpg|jpeg|webp|gif|ico|mp4|webm|ogg)$).*)",
  ],
};
