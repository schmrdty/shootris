'use client';

import { useName } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import { isAddress } from 'viem';

function shortAddress(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/**
 * Show a player's Basename or ENS name, falling back to a short address.
 * OnchainKit checks Base first, then Ethereum mainnet ENS, and only accepts
 * names whose forward record resolves back to the same address.
 */
export function PlayerName({ wallet, className }: { wallet: string; className?: string }) {
  const valid = isAddress(wallet);
  const { data: name } = useName(
    { address: (valid ? wallet : undefined) as `0x${string}` | undefined, chain: base },
    { enabled: valid, staleTime: 60 * 60 * 1000 }
  );

  return (
    <span className={className} title={wallet}>
      {name || shortAddress(wallet)}
    </span>
  );
}
