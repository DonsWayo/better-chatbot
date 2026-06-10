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

  if (pathname === "/admin") {
    return NextResponse.redirect(new URL("/admin/users", request.url));
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
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
