import { NextResponse } from 'next/server';
import { getChainRegistry } from '@/lib/chains';

// Read-only RPC for Base and Ethereum, proxied through this server.
//
// The browser needs chain reads the wallet does not provide: the player's
// $MYU balance on Base, and the name and avatar OnchainKit looks up on
// Ethereum. Pointed straight at public RPCs those run from each player's
// device, which is what one player's ISP flagged. Sending them here keeps
// the browser talking only to this domain and keeps keyed RPC URLs private.
// Sending a transaction still goes through the player's own wallet.
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

const PROXIED_CHAINS = new Set(['base', 'ethereum']);

export async function POST(request: Request, context: { params: Promise<{ chain: string }> }) {
  const { chain } = await context.params;
  if (!PROXIED_CHAINS.has(chain)) {
    return NextResponse.json({ error: 'Unknown chain' }, { status: 404 });
  }

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

  const { rpcUrl } = getChainRegistry()[chain] as { rpcUrl: string };
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
