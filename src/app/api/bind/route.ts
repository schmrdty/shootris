import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Verifies that the caller's wallet signed a binding message for their
// SpacetimeDB identity, then attests the binding into the module via the
// SpacetimeDB HTTP API using the app server's (admin) token.
//
// viem's verifyMessage handles both EOA signatures (ecrecover) and smart
// wallet signatures (ERC-1271 / ERC-6492) via an RPC call — which is why
// verification lives here instead of inside the WASM module.

const SPACETIME_HTTP_HOST = 'https://maincloud.spacetimedb.com';

export async function POST(req: Request) {
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
      transport: http(process.env.BASE_RPC_URL),
    });
    const valid = await client.verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const token = process.env.SPACETIMEDB_ADMIN_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'Server not configured: SPACETIMEDB_ADMIN_TOKEN is missing' },
        { status: 500 }
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
