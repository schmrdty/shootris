import { NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, parseAbi, parseAbiItem } from 'viem';
import { getChainRegistry, isChainConfigured } from '@/lib/chains';
import { parseCardToSkin, type OwnedCard } from '@/lib/skins';

// Lists the Shootris cards a wallet holds and maps them to piece skins.
// Works against an UNMODIFIED third-party collection (vibe.market): it only
// uses standard ERC-721 reads plus vibe's optional rarity getter.
//
// POST { chain, contract, address } -> { cards: OwnedCard[] }
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
  const res = await fetch(resolveUri(uri), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  return res.json();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chainKey = typeof body.chain === 'string' ? body.chain : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const contract = typeof body.contract === 'string' ? body.contract.trim() : '';

    if (!contract) {
      // Collection not configured yet — not an error, just nothing to unlock
      return NextResponse.json({ cards: [], configured: false });
    }
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
    const fromBlockEnv = process.env.COLLECTION_FROM_BLOCK;
    const startBlock = fromBlockEnv ? BigInt(fromBlockEnv) : BigInt(0);
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
        const skin = parseCardToSkin(name, meta.attributes as never, rarity);
        if (!skin) continue;

        cards.push({
          tokenId: tokenId.toString(),
          name,
          image: typeof meta.image === 'string' ? resolveUri(meta.image) : undefined,
          rarity,
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
