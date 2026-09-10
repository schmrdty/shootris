'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { COLLECTION_CHAIN, COLLECTION_CONTRACT } from '@/app/config/onchainkit';
import { loadSeenCards, saveSeenCards, type AppliedSkins, type OwnedCard } from '@/lib/skins';

/**
 * On sign-in, look up the Shootris cards this wallet holds on the collection
 * chain and work out which piece skins are newly unlocked (i.e. cards the
 * player has not been prompted about yet).
 */
export function useCollectionSkins() {
  const { address } = useAccount();
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [newCards, setNewCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !COLLECTION_CONTRACT) return;
    setLoading(true);
    try {
      const res = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: COLLECTION_CHAIN, contract: COLLECTION_CONTRACT, address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const owned: OwnedCard[] = data.cards ?? [];
      setCards(owned);
      const seen = new Set(loadSeenCards());
      setNewCards(owned.filter((c) => !seen.has(c.tokenId)));
    } catch (e) {
      // Collection lookup is best-effort — never block play on it
      console.warn('Collection lookup skipped:', e instanceof Error ? e.message : e);
      setCards([]);
      setNewCards([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Mark every currently-owned card as prompted, so we don't ask again. */
  const acknowledgeAll = useCallback(() => {
    const ids = Array.from(new Set([...loadSeenCards(), ...cards.map((c) => c.tokenId)]));
    saveSeenCards(ids);
    setNewCards([]);
  }, [cards]);

  /** Skins implied by every card the wallet currently holds. */
  const skinsFromCards = useCallback((list: OwnedCard[]): AppliedSkins => {
    const skins: AppliedSkins = {};
    for (const card of list) skins[card.piece] = card.set;
    return skins;
  }, []);

  return { cards, newCards, loading, refresh, acknowledgeAll, skinsFromCards };
}
