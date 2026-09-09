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

export function getChainRegistry(): Record<string, ChainEntry> {
  return {
    base: {
      type: 'evm',
      name: 'Base',
      chainId: 8453,
      rpcUrl: env('BASE_RPC_URL') || 'https://mainnet.base.org',
    },
    ethereum: {
      type: 'evm',
      name: 'Ethereum',
      chainId: 1,
      rpcUrl: env('ETHEREUM_RPC_URL') || 'https://eth.llamarpc.com',
    },
    robinhood: {
      type: 'evm',
      name: 'Robinhood Chain',
      // Set ROBINHOOD_CHAIN_ID and ROBINHOOD_RPC_URL in .env.local —
      // grab the current values from https://docs.robinhood.com/chain
      chainId: Number(env('ROBINHOOD_CHAIN_ID') || 0),
      rpcUrl: env('ROBINHOOD_RPC_URL') || '',
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
