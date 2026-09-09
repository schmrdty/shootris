'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

interface UseNftHoldingsOptions {
  /** Chain key from src/lib/chains.ts: 'base' | 'ethereum' | 'robinhood' | 'solana' */
  chain: string;
  /** NFT contract (EVM) or mint address (Solana) */
  contract: string;
  standard?: 'erc721' | 'erc1155' | 'spl';
  tokenId?: string;
  /**
   * Address to check. Defaults to the connected wallet — fine for EVM chains
   * where the player holds at the same address. Non-EVM chains (Solana) and
   * holders using a different wallet need an explicit address (a verified
   * address-linking step, like the /api/bind flow, is the future upgrade).
   */
  address?: string;
  enabled?: boolean;
}

/**
 * Cross-chain NFT ownership check for holder-gated perks (themes, skins,
 * badges, partner drops). Verification runs server-side via /api/holdings.
 */
export function useNftHoldings({ chain, contract, standard, tokenId, address, enabled = true }: UseNftHoldingsOptions) {
  const { address: connected } = useAccount();
  const target = address ?? connected ?? null;
  const [holds, setHolds] = useState(false);
  const [balance, setBalance] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled || !target || !contract) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain, address: target, contract, standard, tokenId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setHolds(!!data.holds);
      setBalance(data.balance ?? '0');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Holdings check failed');
      setHolds(false);
    } finally {
      setLoading(false);
    }
  }, [enabled, target, chain, contract, standard, tokenId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { holds, balance, loading, error, refetch, checkedAddress: target };
}
