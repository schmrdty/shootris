'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { COLLECTION_CHAIN, COLLECTION_CONTRACT } from '@/app/config/onchainkit';
import {
  computeSetProgress,
  unlockedSetsFrom,
  type OwnedCard,
  type SetProgress,
  type SkinSet,
} from './skins';

interface CollectionContextValue {
  /** Cards verified on-chain for the connected wallet. */
  ownedCards: OwnedCard[];
  /** Per minted set: which pieces are held and whether all 7 are. */
  setProgress: SetProgress[];
  /** Sets the player may actually render: free sets plus completed ones. */
  unlockedSets: SkinSet[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

/**
 * Source of truth for which skins a player may use.
 *
 * Unlocks are derived from the connected wallet's verified holdings on every
 * load — never from stored preferences — so disconnecting, or selling a card
 * that breaks a set, removes access. Failures fail CLOSED: if holdings cannot
 * be verified, only free sets are usable.
 */
export function CollectionProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !COLLECTION_CONTRACT) {
      setOwnedCards([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: COLLECTION_CHAIN, contract: COLLECTION_CONTRACT, address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setOwnedCards(data.cards ?? []);
    } catch (e) {
      console.warn('Holdings unverifiable, minted skins disabled:', e instanceof Error ? e.message : e);
      setOwnedCards([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Re-verify when the wallet changes, and when the player returns to the
  // tab — catches a set that was completed or broken on vibe.market meanwhile.
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const setProgress = useMemo(() => computeSetProgress(ownedCards), [ownedCards]);
  const unlockedSets = useMemo(() => unlockedSetsFrom(ownedCards), [ownedCards]);

  return (
    <CollectionContext.Provider value={{ ownedCards, setProgress, unlockedSets, loading, refresh }}>
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error('useCollection must be used within CollectionProvider');
  return ctx;
}
