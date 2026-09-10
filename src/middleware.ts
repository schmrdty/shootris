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
  return response;
}

export const config = {
  matcher: ["/((?!_next/image|_next/static|favicon.ico).*)"],
};
