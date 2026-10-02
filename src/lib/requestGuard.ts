// Keeps the server's outbound helpers (the RPC proxy, name lookups) for the
// app's own pages instead of the whole internet.
//
// These endpoints make the server call an upstream provider on request.
// Without a caller check that is an open relay: anyone can point a script at
// it and spend our RPC quota and our host's bandwidth, which reads as abuse
// from the outside.

const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Caddy puts the real client in X-Forwarded-For; fall back to the socket. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * True when the request came from one of our own pages. Browsers attach an
 * Origin to a cross-origin POST, and Sec-Fetch-Site on every fetch, so a
 * same-origin call always identifies itself. A script with curl does not.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'same-site') return true;
  if (site && site !== 'none') return false;

  const host = request.headers.get('host');
  if (!host) return false;
  const source = request.headers.get('origin') ?? request.headers.get('referer');
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

/**
 * True while this caller is under `limit` requests a minute for `scope`.
 *
 * Scoped per endpoint: a player loading a leaderboard full of names should
 * not use up the budget that the game's own chain reads need.
 */
export function withinRateLimit(request: Request, scope: string, limit: number): boolean {
  const key = `${scope}:${clientKey(request)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    // Opportunistic sweep: these entries are tiny and expire in a minute
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
}
