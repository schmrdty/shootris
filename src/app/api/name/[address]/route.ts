import { NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, namehash, parseAbi } from 'viem';
import { base, mainnet } from 'viem/chains';
import { getChainRegistry } from '@/lib/chains';
import { withinRateLimit } from '@/lib/requestGuard';

// Resolves a wallet's Basename (or ENS name) SERVER-SIDE.
//
// GET /api/name/0x... -> { name: string | null }
//
// Doing this in the browser meant every player's device talked straight to a
// public Ethereum RPC, dozens of times per session. That endpoint rejects
// eth_call, so names never resolved at all, and the traffic was flagged as
// crypto activity by at least one player's ISP. Here the lookup happens once
// on our server, behind our own RPC, and is cached for everyone.
//
// A name is only returned when its forward record points back at the same
// address, so a wallet cannot claim someone else's name.

const BASE_L2_RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD';
// ENSIP-11 coin type for Base: 0x80000000 | 8453, unsigned. The >>> 0 is
// load-bearing: a plain bitwise OR is signed, giving "-7fffdefb" and a
// reverse node that resolves to nothing.
const BASE_COIN_TYPE = ((0x80000000 | base.id) >>> 0).toString(16);

const resolverAbi = parseAbi([
  'function name(bytes32 node) view returns (string)',
  'function addr(bytes32 node) view returns (address)',
]);

const CACHE_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const cache = new Map<string, { name: string | null; at: number }>();

function cached(address: string): { name: string | null } | null {
  const hit = cache.get(address);
  if (!hit) return null;
  const ttl = hit.name === null ? NEGATIVE_TTL_MS : CACHE_TTL_MS;
  if (Date.now() - hit.at > ttl) {
    cache.delete(address);
    return null;
  }
  return { name: hit.name };
}

function remember(address: string, name: string | null) {
  // Plain FIFO trim: this only ever holds names, and the process is small
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(address, { name, at: Date.now() });
}

function client(chainKey: 'base' | 'ethereum') {
  const entry = getChainRegistry()[chainKey];
  return createPublicClient({
    chain: chainKey === 'base' ? base : mainnet,
    transport: http(entry.rpcUrl),
  });
}

/** The node holding a wallet's Base reverse record: <addr>.<coinType>.reverse */
function baseReverseNode(address: string) {
  return namehash(`${address.toLowerCase().slice(2)}.${BASE_COIN_TYPE}.reverse`);
}

async function resolveBasename(address: string): Promise<string | null> {
  const baseClient = client('base');
  const name = await baseClient.readContract({
    abi: resolverAbi,
    address: BASE_L2_RESOLVER,
    functionName: 'name',
    args: [baseReverseNode(address)],
  });
  if (!name) return null;

  // Forward check on Base itself. OnchainKit verifies this against Ethereum
  // mainnet, which is the call that was failing in the browser.
  const forward = await baseClient.readContract({
    abi: resolverAbi,
    address: BASE_L2_RESOLVER,
    functionName: 'addr',
    args: [namehash(name)],
  });
  return forward?.toLowerCase() === address.toLowerCase() ? name : null;
}

async function resolveEns(address: `0x${string}`): Promise<string | null> {
  // viem's reverse lookup verifies the forward record itself
  return client('ethereum').getEnsName({ address });
}

// A leaderboard page asks for one name per row, once
const NAME_REQUESTS_PER_MINUTE = 120;

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  // Cached names are free, but an unknown address costs an upstream call,
  // and the set of possible addresses is endless.
  if (!withinRateLimit(request, 'name', NAME_REQUESTS_PER_MINUTE)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { address: raw } = await context.params;
  if (!isAddress(raw, { strict: false })) {
    return NextResponse.json({ error: 'Not a wallet address' }, { status: 400 });
  }
  const address = raw.toLowerCase() as `0x${string}`;

  const hit = cached(address);
  if (hit) {
    return NextResponse.json(hit, {
      headers: { 'Cache-Control': 'public, max-age=3600', 'X-Name-Cache': 'hit' },
    });
  }

  let name: string | null = null;
  try {
    name = await resolveBasename(address);
  } catch (error) {
    // No reverse record, or Base is unreachable: fall through to ENS
    console.warn('[name] Base lookup failed:', error instanceof Error ? error.message : error);
  }
  if (!name) {
    try {
      name = await resolveEns(address);
    } catch (error) {
      // Leave it unnamed; the client shows a short address
      console.warn('[name] ENS lookup failed:', error instanceof Error ? error.message : error);
    }
  }

  remember(address, name);
  return NextResponse.json(
    { name },
    { headers: { 'Cache-Control': 'public, max-age=3600', 'X-Name-Cache': 'miss' } }
  );
}
