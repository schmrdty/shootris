import { NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, erc721Abi } from 'viem';
import { getChainRegistry, isChainConfigured } from '@/lib/chains';

// Cross-chain NFT/token holdings check, server-side so RPC endpoints stay
// private and results are authoritative for gating decisions.
//
// POST { chain, address, contract, standard?, tokenId? }
//   chain:    key from src/lib/chains.ts ('base' | 'ethereum' | 'robinhood' | 'solana')
//   address:  holder address (0x… for EVM chains, base58 for Solana)
//   contract: ERC-721/1155 contract (EVM) or SPL mint address (Solana)
//   standard: 'erc721' (default) | 'erc1155' (needs tokenId) | 'spl'
// → { chain, address, contract, balance, holds }

const erc1155BalanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chainKey = typeof body.chain === 'string' ? body.chain : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const contract = typeof body.contract === 'string' ? body.contract.trim() : '';
    const standard = typeof body.standard === 'string' ? body.standard : 'erc721';

    const registry = getChainRegistry();
    const entry = registry[chainKey];
    if (!entry) {
      return NextResponse.json(
        { error: `Unknown chain '${chainKey}'. Known: ${Object.keys(registry).join(', ')}` },
        { status: 400 }
      );
    }
    if (!isChainConfigured(entry)) {
      return NextResponse.json(
        { error: `Chain '${chainKey}' is not configured — set its RPC URL (and chain id for EVM) in .env.local` },
        { status: 500 }
      );
    }
    if (!address || !contract) {
      return NextResponse.json({ error: 'address and contract are required' }, { status: 400 });
    }

    let balance = BigInt(0);

    if (entry.type === 'evm') {
      if (!isAddress(address) || !isAddress(contract)) {
        return NextResponse.json({ error: 'Invalid EVM address' }, { status: 400 });
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
      if (standard === 'erc1155') {
        if (body.tokenId === undefined) {
          return NextResponse.json({ error: 'erc1155 requires tokenId' }, { status: 400 });
        }
        balance = await client.readContract({
          address: contract as `0x${string}`,
          abi: erc1155BalanceAbi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`, BigInt(body.tokenId)],
        });
      } else {
        balance = await client.readContract({
          address: contract as `0x${string}`,
          abi: erc721Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });
      }
    } else {
      // Solana: sum token accounts for this mint (works for SPL NFTs and tokens)
      const res = await fetch(entry.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [address, { mint: contract }, { encoding: 'jsonParsed' }],
        }),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Solana RPC error: ${res.status}` }, { status: 502 });
      }
      const data = await res.json();
      if (data.error) {
        return NextResponse.json({ error: `Solana RPC: ${data.error.message}` }, { status: 502 });
      }
      const accounts: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }> =
        data.result?.value ?? [];
      for (const acc of accounts) {
        balance += BigInt(acc.account?.data?.parsed?.info?.tokenAmount?.amount ?? '0');
      }
    }

    return NextResponse.json({
      chain: chainKey,
      address,
      contract,
      balance: balance.toString(),
      holds: balance > BigInt(0),
    });
  } catch (error) {
    console.error('Holdings check failed:', error);
    return NextResponse.json({ error: 'Holdings check failed' }, { status: 500 });
  }
}
