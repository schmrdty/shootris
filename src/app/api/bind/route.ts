import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { getChainRegistry } from '@/lib/chains';
import { isSameOrigin, withinRateLimit } from '@/lib/requestGuard';
import { sql, identityHex } from '@/lib/spacetimeSql';

// Verifies that the caller's wallet signed a binding message for their
// SpacetimeDB identity, then attests the binding into the module via the
// SpacetimeDB HTTP API using the app server's (admin) token.
//
// viem's verifyMessage handles both EOA signatures (ecrecover) and smart
// wallet signatures (ERC-1271 / ERC-6492) via an RPC call — which is why
// verification lives here instead of inside the WASM module.

const SPACETIME_HTTP_HOST = 'https://maincloud.spacetimedb.com';

// A player verifies once per device; retries stay well under this
const BIND_REQUESTS_PER_MINUTE = 10;
// Checked once per page load by a returning player
const BIND_STATUS_REQUESTS_PER_MINUTE = 30;

/**
 * GET /api/bind?wallet=0x...&identity=<hex> -> { bound: boolean }
 *
 * Browsers remember that they verified, so a returning player is not asked
 * to sign every visit. That memory can go stale: a binding reset (or any
 * server-side change) removes the binding while the browser still believes
 * in it, and the module then silently rejects that player's scores. The
 * client asks here before trusting what it remembers.
 */
export async function GET(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Not available to third parties' }, { status: 403 });
  }
  if (!withinRateLimit(req, 'bind-status', BIND_STATUS_REQUESTS_PER_MINUTE)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const params = new URL(req.url).searchParams;
  const wallet = (params.get('wallet') || '').toLowerCase();
  const identity = (params.get('identity') || '').replace(/^0x/i, '').toLowerCase();
  // Both are validated to strict formats before they reach the query
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !/^[0-9a-f]{64}$/.test(identity)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  try {
    const rows = await sql(`SELECT identity FROM wallet_bindings WHERE wallet = '${wallet}'`);
    const bound = rows.some((row) => identityHex(row[0]) === identity);
    return NextResponse.json({ bound }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('[bind] status check failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Status unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Not available to third parties' }, { status: 403 });
  }
  if (!withinRateLimit(req, 'bind', BIND_REQUESTS_PER_MINUTE)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  try {
    const body = await req.json();
    const wallet = typeof body.wallet === 'string' ? body.wallet.toLowerCase() : '';
    const identityHex =
      typeof body.identityHex === 'string'
        ? body.identityHex.replace(/^0x/, '').toLowerCase()
        : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';

    if (!/^0x[0-9a-f]{40}$/.test(wallet) || !/^[0-9a-f]{64}$/.test(identityHex) || !signature.startsWith('0x')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Must match the message constructed in src/lib/spacetime/hooks.ts exactly
    const message = `Shootris wallet verification\nWallet: ${wallet}\nIdentity: ${identityHex}`;

    const client = createPublicClient({
      chain: base,
      transport: http(getChainRegistry().base.rpcUrl),
    });
    const valid = await client.verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Least-privilege attestor token. This identity can ONLY attest wallet
    // bindings — it cannot publish or delete the database, so it is safe to
    // keep on a public server. SPACETIMEDB_ADMIN_TOKEN is accepted as a
    // legacy fallback but should be retired: that token owns the database.
    const token = process.env.SPACETIMEDB_ATTESTOR_TOKEN || process.env.SPACETIMEDB_ADMIN_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'Server not configured: SPACETIMEDB_ATTESTOR_TOKEN is missing' },
        { status: 500 }
      );
    }
    if (!process.env.SPACETIMEDB_ATTESTOR_TOKEN && process.env.SPACETIMEDB_ADMIN_TOKEN) {
      console.warn(
        'Using SPACETIMEDB_ADMIN_TOKEN (database-owner level). Mint an attestor identity and set SPACETIMEDB_ATTESTOR_TOKEN instead — see infra/spacetimedb-attestor.md'
      );
    }
    const moduleName = process.env.NEXT_PUBLIC_SPACETIME_MODULE_NAME || 'shootris-game';

    const res = await fetch(
      `${SPACETIME_HTTP_HOST}/v1/database/${moduleName}/call/admin_bind_wallet`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([wallet, identityHex]),
      }
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error('admin_bind_wallet failed:', res.status, detail);
      return NextResponse.json({ error: 'Binding attestation failed' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Bind route error:', error);
    return NextResponse.json({ error: 'Bind error' }, { status: 500 });
  }
}
