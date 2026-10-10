// Read-only SQL against the Shootris database, from the server.
//
// Runs as an anonymous identity minted here and kept in memory, so the
// owner token never touches a public endpoint. Only use this for tables
// that are already public.

const HOST = process.env.SPACETIME_HTTP_HOST || 'https://maincloud.spacetimedb.com';
// SPACETIME_MODULE_NAME first: NEXT_PUBLIC_ vars are inlined at build time,
// so only a server-side name can be pointed at another database at runtime.
const MODULE =
  process.env.SPACETIME_MODULE_NAME || process.env.NEXT_PUBLIC_SPACETIME_MODULE_NAME || 'shootris-game';

let readToken: string | null = null;

async function identityToken(): Promise<string> {
  const configured = process.env.SPACETIMEDB_READ_TOKEN;
  if (configured) return configured;
  if (readToken) return readToken;
  const res = await fetch(`${HOST}/v1/identity`, { method: 'POST' });
  if (!res.ok) throw new Error(`Could not mint a read identity: ${res.status}`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error('Read identity response had no token');
  readToken = body.token;
  return readToken;
}

/**
 * Run one SQL statement and return its rows as arrays of cell values.
 * Never interpolate unvalidated input into `query`.
 */
export async function sql(query: string): Promise<unknown[][]> {
  const res = await fetch(`${HOST}/v1/database/${MODULE}/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await identityToken()}`, 'Content-Type': 'text/plain' },
    body: query,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SpacetimeDB SQL failed: ${res.status} ${await res.text()}`);
  const statements = (await res.json()) as Array<{ rows?: unknown[][] }>;
  return statements[0]?.rows ?? [];
}

/**
 * An Identity cell as bare lowercase hex. Over SQL it arrives wrapped, as
 * ["0xc200..."]; elsewhere it is often unprefixed.
 */
export function identityHex(cell: unknown): string {
  const raw = Array.isArray(cell) ? cell[0] : cell;
  return String(raw ?? '').replace(/^0x/i, '').toLowerCase();
}
