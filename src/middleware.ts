import { NextResponse, NextRequest } from "next/server";

// Tags each request with an id for correlating client-side errors.
//
// NOTE: this used to POST every request's full headers AND cookies to an
// internal /api/logger route, which wrote them to a file on disk. That was
// Ohara telemetry: it captured visitor session cookies in plaintext, grew
// without bound, and doubled the request count on every page load. Removed.
export default function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  // The whole app runs inside an iframe on the DESKTOP Farcaster and Base
  // clients (phones use a native webview, which ignores frame headers), so
  // those hosts must be allowed to frame every route, not just /mini.
  // X-Frame-Options cannot express a cross-origin allow-list; shipping it
  // here once left the desktop mini-app stuck on its splash screen, with
  // the page refused before a single line of it ran. frame-ancestors is
  // the replacement: self, the mini-app clients, and nobody else.
  // /mini keeps its separate, wider policy from next.config.mjs.
  if (!request.nextUrl.pathname.startsWith("/mini")) {
    const ancestors =
      process.env.APP_FRAME_ANCESTORS ||
      "'self' https://farcaster.xyz https://*.farcaster.xyz https://warpcast.com https://*.warpcast.com https://base.app https://*.base.app https://wallet.coinbase.com";
    response.headers.set("Content-Security-Policy", `frame-ancestors ${ancestors};`);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/image|_next/static|favicon.ico).*)"],
};
