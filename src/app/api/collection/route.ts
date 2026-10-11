import { NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, parseAbi, parseAbiItem } from 'viem';
import { getChainRegistry, isChainConfigured } from '@/lib/chains';
import { parseCardToSkin, type CollectionKey, type OwnedCard } from '@/lib/skins';
import { CARD_COLLECTIONS, LIVE_COLLECTIONS, collectionAt } from '@/app/config/collections';
import { isSafePublicUrl } from '@/lib/safeUrl';
import { isSameOrigin, withinRateLimit } from '@/lib/requestGuard';

// Lists the cards a wallet holds in one of our collections and maps them to
// piece skins. Works against an UNMODIFIED third-party collection
// (vibe.market): it only uses standard ERC-721 reads plus vibe's optional
// rarity getter.
//
// POST { collection, address } -> { cards: OwnedCard[] }
// (older pages send { chain, contract, address } for the same thing)
//
// Only our registered collections, and only for our own pages. This route
// calls the contract's tokenURI and then fetches whatever URL comes back, so
// accepting any contract let anyone point this server at a URL of their
// choosing: a malware sinkhole, for instance, which is exactly what gets a
// host's IP onto Spamhaus XBL.
//
// NOTE: vibe.market token ids can exceed JS's safe integer range, so ids are
// handled as bigint internally and returned as strings.

const MAX_TOKENS = 60;
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

const erc721Reads = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]);
const rarityRead = parseAbi(['function getTokenRarity(uint256 tokenId) view returns (uint8)']);
const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
);

function resolveUri(uri: string): string {
  if (uri.startsWith('ipfs://')) return IPFS_GATEWAY + uri.slice('ipfs://'.length).replace(/^ipfs\//, '');
  return uri;
}

async function fetchMetadata(uri: string): Promise<{ name?: string; image?: string; attributes?: unknown }> {
  if (uri.startsWith('data:application/json')) {
    const comma = uri.indexOf(',');
    const payload = uri.slice(comma + 1);
    const json = uri.slice(0, comma).includes('base64')
      ? Buffer.from(payload, 'base64').toString('utf8')
      : decodeURIComponent(payload);
    return JSON.parse(json);
  }
  const url = resolveUri(uri);
  // Belt and braces: even the real collection's metadata only goes out over
  // public HTTPS by hostname.
  if (!isSafePublicUrl(url)) throw new Error('metadata URL refused');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  return res.json();
}

// One check per collection per page load; well above that is not a player
const COLLECTION_REQUESTS_PER_MINUTE = 30;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Not available to third parties' }, { status: 403 });
  }
  if (!withinRateLimit(req, 'collection', COLLECTION_REQUESTS_PER_MINUTE)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  try {
    const body = await req.json();
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const collection: CollectionKey | null =
      typeof body.collection === 'string'
        ? (LIVE_COLLECTIONS.find((key) => key === body.collection) ?? null)
        : typeof body.chain === 'string' && typeof body.contract === 'string'
          ? collectionAt(body.chain, body.contract)
          : null;

    if (!collection) {
      return NextResponse.json({ error: 'Not one of our card collections' }, { status: 400 });
    }
    // From the registry, never from the request
    const { chain: chainKey, contract, fromBlock } = CARD_COLLECTIONS[collection];
    const registry = getChainRegistry();
    const entry = registry[chainKey];
    if (!entry || entry.type !== 'evm') {
      return NextResponse.json({ error: `Unsupported chain '${chainKey}'` }, { status: 400 });
    }
    if (!isChainConfigured(entry)) {
      return NextResponse.json(
        { error: `Chain '${chainKey}' is not configured — set its RPC URL and chain id` },
        { status: 500 }
      );
    }
    if (!isAddress(address) || !isAddress(contract)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const client = createPublicClient({
      chain: {
        id: entry.chainId,
        name: entry.name,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [entry.rpcUrl] } },
      },
      transport: http(entry.rpcUrl),
    });

    // Candidate tokens: anything that ever moved to this wallet.
    // Many public RPCs cap getLogs block ranges, so fall back to chunked
    // scanning if the single full-range query is rejected.
    // COLLECTION_FROM_BLOCK goes with NEXT_PUBLIC_COLLECTION_CONTRACT, which
    // only ever replaces the Shootris contract
    const fromBlockEnv = collection === 'shootris' ? process.env.COLLECTION_FROM_BLOCK : undefined;
    const startBlock = BigInt(fromBlockEnv || fromBlock);
    const logFilter = {
      address: contract as `0x${string}`,
      event: transferEvent,
      args: { to: address as `0x${string}` },
    } as const;

    let logs: Awaited<ReturnType<typeof client.getLogs>> = [];
    try {
      logs = await client.getLogs({ ...logFilter, fromBlock: startBlock, toBlock: 'latest' });
    } catch {
      // Chunked fallback, hard-bounded so one lookup can never turn into
      // hundreds of RPC calls. Without COLLECTION_FROM_BLOCK we scan only the
      // most recent window — set that env var to cover a collection's full
      // history on a long-lived chain.
      const latest = await client.getBlockNumber();
      const CHUNK = BigInt(process.env.COLLECTION_LOG_CHUNK || 45000);
      const MAX_CHUNKS = Number(process.env.COLLECTION_MAX_CHUNKS || 20);
      const window = CHUNK * BigInt(MAX_CHUNKS);
      let from = startBlock;
      if (from === BigInt(0) && latest > window) {
        from = latest - window;
        console.warn(
          `Collection scan limited to the last ${window} blocks — set COLLECTION_FROM_BLOCK to the collection's deploy block for full history.`
        );
      }
      for (let i = 0; i < MAX_CHUNKS && from <= latest; i++, from += CHUNK) {
        const to = from + CHUNK - BigInt(1) > latest ? latest : from + CHUNK - BigInt(1);
        try {
          logs = logs.concat(await client.getLogs({ ...logFilter, fromBlock: from, toBlock: to }));
        } catch (err) {
          console.warn('getLogs chunk failed', from.toString(), err instanceof Error ? err.message : err);
        }
      }
    }

    const candidates: bigint[] = [];
    for (const log of logs) {
      const id = log.args?.tokenId;
      if (typeof id === 'bigint' && !candidates.includes(id)) candidates.push(id);
      if (candidates.length >= MAX_TOKENS) break;
    }

    // Confirm the wallet still owns each one (it may have sold or opened it).
    const cards: OwnedCard[] = [];
    for (const tokenId of candidates) {
      try {
        const owner = await client.readContract({
          address: contract as `0x${string}`,
          abi: erc721Reads,
          functionName: 'ownerOf',
          args: [tokenId],
        });
        if (String(owner).toLowerCase() !== address.toLowerCase()) continue;

        const uri = await client.readContract({
          address: contract as `0x${string}`,
          abi: erc721Reads,
          functionName: 'tokenURI',
          args: [tokenId],
        });

        let rarity: number | undefined;
        try {
          rarity = Number(
            await client.readContract({
              address: contract as `0x${string}`,
              abi: rarityRead,
              functionName: 'getTokenRarity',
              args: [tokenId],
            })
          );
        } catch {
          // Collection doesn't expose rarity — name/attributes still work
        }

        const meta = await fetchMetadata(String(uri));
        const name = typeof meta.name === 'string' ? meta.name : '';
        const skin = parseCardToSkin(name, meta.attributes as never, rarity, collection);
        if (!skin) continue;

        cards.push({
          tokenId: tokenId.toString(),
          name,
          image: typeof meta.image === 'string' ? resolveUri(meta.image) : undefined,
          rarity,
          collection,
          set: skin.set,
          piece: skin.piece,
        });
      } catch (err) {
        console.warn('Skipping token', tokenId.toString(), err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ cards, configured: true });
  } catch (error) {
    console.error('Collection lookup failed:', error);
    return NextResponse.json({ error: 'Collection lookup failed' }, { status: 500 });
  }
}
