import { NextResponse } from 'next/server';
import { getChainRegistry } from '@/lib/chains';

// Read-only Ethereum mainnet RPC, proxied through this server.
//
// OnchainKit does its own mainnet lookups (the name and avatar in the wallet
// modal). Pointed straight at a public RPC those run from each player's
// device; one player's ISP flagged the traffic. Sending them here keeps the
// browser talking only to this domain, and keeps any keyed RPC URL private.
//
// Deliberately narrow: read methods only, no transactions, no filters, no
// arbitrary passthrough. Anything not listed is refused.
const ALLOWED_METHODS = new Set([
  'eth_call',
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'net_version',
]);

const MAX_BODY_BYTES = 128 * 1024;
const MAX_BATCH = 20;

type RpcCall = { method?: unknown; id?: unknown; jsonrpc?: unknown };

function refusal(method: unknown, id: unknown) {
  return {
    jsonrpc: '2.0',
    id: typeof id === 'string' || typeof id === 'number' ? id : null,
    error: { code: -32601, message: `Method not available through this proxy: ${String(method)}` },
  };
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  let body: RpcCall | RpcCall[];
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return NextResponse.json({ error: 'Unsupported batch size' }, { status: 400 });
  }
  const refused = calls.find((call) => !ALLOWED_METHODS.has(String(call?.method)));
  if (refused) {
    // Answer in JSON-RPC's own shape so the caller reports it cleanly
    const error = refusal(refused.method, refused.id);
    return NextResponse.json(Array.isArray(body) ? [error] : error, { status: 200 });
  }

  const { rpcUrl } = getChainRegistry().ethereum as { rpcUrl: string };
  try {
    const upstream = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Upstream RPC unavailable' }, { status: 502 });
  }
}
