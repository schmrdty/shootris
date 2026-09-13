// Multi-chain registry for NFT/token verification.
//
// The game's wallet lives on Base, but partner NFTs may live anywhere —
// Robinhood Chain, Ethereum, Solana, etc. Verification always happens
// SERVER-SIDE (/api/holdings) so RPC keys stay private and results can't
// be spoofed by the client.
//
// Adding a chain: add an entry here (EVM chains need id + RPC; Solana-style
// chains just need an RPC). Chain IDs/RPCs are env-overridable so new
// networks don't require a code change.

export interface EvmChainEntry {
  type: 'evm';
  name: string;
  chainId: number;
  rpcUrl: string;
}

export interface SolanaChainEntry {
  type: 'solana';
  name: string;
  rpcUrl: string;
}

export type ChainEntry = EvmChainEntry | SolanaChainEntry;

function env(name: string): string | undefined {
  // Server-side first (private), NEXT_PUBLIC fallback for convenience
  return process.env[name] || process.env[`NEXT_PUBLIC_${name}`] || undefined;
}

// Alchemy endpoint for a network slug, when ALCHEMY_API_KEY is set.
// Server-side only: never expose this key as NEXT_PUBLIC_.
function alchemy(slug: string): string | undefined {
  const key = process.env.ALCHEMY_API_KEY;
  return key ? `https://${slug}.g.alchemy.com/v2/${key}` : undefined;
}

export function getChainRegistry(): Record<string, ChainEntry> {
  return {
    base: {
      type: 'evm',
      name: 'Base',
      chainId: 8453,
      rpcUrl: env('BASE_RPC_URL') || alchemy('base-mainnet') || 'https://mainnet.base.org',
    },
    ethereum: {
      type: 'evm',
      name: 'Ethereum',
      chainId: 1,
      rpcUrl: env('ETHEREUM_RPC_URL') || alchemy('eth-mainnet') || 'https://eth.llamarpc.com',
    },
    robinhood: {
      type: 'evm',
      // Arbitrum Orbit L2, ETH gas. Details: https://docs.robinhood.com/chain/connecting
      // Explorer: https://robinhoodchain.blockscout.com
      name: 'Robinhood Chain',
      chainId: Number(env('ROBINHOOD_CHAIN_ID') || 4663),
      rpcUrl:
        env('ROBINHOOD_RPC_URL') ||
        alchemy('robinhood-mainnet') ||
        // Public endpoint is rate-limited — fine for testing, not for launch
        'https://rpc.mainnet.chain.robinhood.com',
    },
    solana: {
      type: 'solana',
      name: 'Solana',
      rpcUrl: env('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com',
    },
  };
}

export function isChainConfigured(entry: ChainEntry): boolean {
  if (!entry.rpcUrl) return false;
  if (entry.type === 'evm' && !entry.chainId) return false;
  return true;
}
