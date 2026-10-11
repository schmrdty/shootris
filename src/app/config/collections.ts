import type { CollectionKey } from '@/lib/skins';
import { SHOOTRIS_CARDS, COLLECTION_CHAIN, COLLECTION_CONTRACT } from '@/app/config/onchainkit';

// Every vibe.market card collection the game reads, one contract each.
//
// A collection stays dormant, with nothing fetched and nothing shown, until
// its contract is filled in. To launch one: set its contract and fromBlock
// (the block the contract was deployed in, so ownership scans start there
// rather than at the chain's beginning), register its sets in
// src/lib/skins.ts with `collection` set to its key, and add its links.

export interface CardCollection {
  label: string;
  /** Key in src/lib/chains.ts. */
  chain: string;
  /** ERC-721 contract address; empty until the collection launches. */
  contract: string;
  /** Deploy block of the contract. */
  fromBlock: number;
  vibeMarketUrl?: string;
  openSeaUrl?: string;
}

export const CARD_COLLECTIONS: Record<CollectionKey, CardCollection> = {
  shootris: {
    label: 'Shootris',
    chain: COLLECTION_CHAIN,
    contract: COLLECTION_CONTRACT,
    fromBlock: SHOOTRIS_CARDS.fromBlock,
    vibeMarketUrl: SHOOTRIS_CARDS.vibeMarketUrl,
    openSeaUrl: SHOOTRIS_CARDS.openSeaUrl,
  },
  // Sports gear: balls (with transparent corners), bats, mitts, pucks...
  sportris: {
    label: 'Sportris',
    chain: 'robinhood',
    contract: '',
    fromBlock: 0,
  },
  // Haberdashery, colour-coordinated per set
  smasherdasher: {
    label: 'SmasherDasher',
    chain: 'robinhood',
    contract: '',
    fromBlock: 0,
  },
};

/** Collections whose contract is set, in display order. */
export const LIVE_COLLECTIONS = (Object.keys(CARD_COLLECTIONS) as CollectionKey[]).filter(
  (key) => CARD_COLLECTIONS[key].contract
);

/** The live collection a (chain, contract) pair belongs to, or null. */
export function collectionAt(chain: string, contract: string): CollectionKey | null {
  const c = contract.trim().toLowerCase();
  return (
    LIVE_COLLECTIONS.find(
      (key) => CARD_COLLECTIONS[key].chain === chain && CARD_COLLECTIONS[key].contract.toLowerCase() === c
    ) ?? null
  );
}
