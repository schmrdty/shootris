// Piece skin system — lets vibe.market card art replace the flat rendered
// pieces WITHOUT any change to the NFT contract. The game reads standard
// ERC-721 metadata (name/attributes) and maps each owned card to a
// (set, piece) skin. Only the ART and CARD NAMES matter on the mint side.

export type PieceKey = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type SkinSet = 'basic' | 'earthen' | 'neon' | 'collector' | 'gunmetal';

export const PIECE_KEYS: PieceKey[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const SKIN_SETS: SkinSet[] = ['basic', 'earthen', 'neon', 'collector', 'gunmetal'];

// Sets obtainable by holding a vibe.market card. gunmetal is deliberately
// absent: it is never minted, so it is a free in-game choice rather than an
// unlock, and the metadata parser never maps a card to it.
export const MINTED_SETS: SkinSet[] = ['basic', 'earthen', 'neon', 'collector'];
export const FREE_SETS: SkinSet[] = ['gunmetal'];

export const SET_LABELS: Record<SkinSet, string> = {
  basic: 'Basic',
  earthen: 'Earthen',
  neon: 'Neon',
  collector: 'Collector (alt art)',
  gunmetal: 'Gunmetal',
};

// The engine stores neon hex codes as piece identity (see tetrominoes.ts),
// so colour is how we know which piece a cell belongs to.
export const PIECE_BY_COLOR: Record<string, PieceKey> = {
  '#00f0f0': 'I',
  '#f0f000': 'O',
  '#a000f0': 'T',
  '#00f000': 'S',
  '#f00000': 'Z',
  '#0000f0': 'J',
  '#f0a000': 'L',
};

// Card nicknames from the art brief, so cards named
// "The Lance" / "The Root" still resolve to a piece.
const NICKNAME_BY_PIECE: Record<PieceKey, string[]> = {
  I: ['lance', 'root'],
  O: ['core', 'cobble'],
  T: ['conductor', 'bloom'],
  S: ['serpent', 'fern'],
  Z: ['fang', 'ember'],
  J: ['hook', 'riverstone'],
  L: ['crane', 'harvest'],
};

/** Per-cell tile art. Missing files simply fall back to the flat colour. */
export function tileUrl(set: SkinSet, piece: PieceKey): string {
  return `/skins/${set}/${piece.toLowerCase()}.png`;
}

export interface OwnedCard {
  tokenId: string;
  name: string;
  image?: string;
  rarity?: number;
  set: SkinSet;
  piece: PieceKey;
}

interface MetadataAttribute {
  trait_type?: string;
  value?: unknown;
}

function attrValue(attrs: MetadataAttribute[] | undefined, match: RegExp): string | null {
  if (!Array.isArray(attrs)) return null;
  for (const a of attrs) {
    if (typeof a?.trait_type === 'string' && match.test(a.trait_type)) {
      return String(a.value ?? '').trim();
    }
  }
  return null;
}

function setFromText(text: string): SkinSet | null {
  const t = text.toLowerCase();
  // Alt-art collector variants win over the base set they riff on
  if (/collector|alt[\s-]?art|variant|prismatic|golden/.test(t)) return 'collector';
  if (/earthen|earth/.test(t)) return 'earthen';
  if (/neon/.test(t)) return 'neon';
  if (/basic|classic|standard/.test(t)) return 'basic';
  return null;
}

function pieceFromText(text: string): PieceKey | null {
  const t = text.toLowerCase();
  for (const piece of PIECE_KEYS) {
    for (const nick of NICKNAME_BY_PIECE[piece]) {
      if (t.includes(nick)) return piece;
    }
  }
  // Standalone piece letter, e.g. "Neon I" or "T-piece"
  const m = text.match(/\b([IOTSZJL])\b|\b([IOTSZJL])[\s-]?piece\b/i);
  const letter = (m?.[1] || m?.[2] || '').toUpperCase();
  if (letter && PIECE_KEYS.includes(letter as PieceKey)) return letter as PieceKey;
  return null;
}

/**
 * Map one card's standard NFT metadata to a skin.
 * Attributes are preferred; the card name is the fallback. Returns null when
 * the card can't be identified — those are ignored rather than guessed at.
 */
export function parseCardToSkin(
  name: string,
  attributes?: MetadataAttribute[],
  rarityCode?: number
): { set: SkinSet; piece: PieceKey } | null {
  const setAttr = attrValue(attributes, /^(set|collection|series|edition)$/i);
  const pieceAttr = attrValue(attributes, /^(piece|tetromino|shape|block)$/i);

  const set = (setAttr && setFromText(setAttr)) || setFromText(name);
  const piece = (pieceAttr && pieceFromText(pieceAttr)) || pieceFromText(name);
  if (!piece) return null;

  // Rarity is recorded but never used to infer a set: under "collect all 7"
  // a misattributed card would corrupt completion counts. Identify from the
  // card's own set words, or ignore it.
  void rarityCode;
  if (!set) return null;
  return { set, piece };
}

export type AppliedSkins = Partial<Record<PieceKey, SkinSet>>;

export const SKINS_STORAGE_KEY = 'shootris_applied_skins';
export function loadAppliedSkins(): AppliedSkins {
  try {
    const raw = localStorage.getItem(SKINS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppliedSkins) : {};
  } catch {
    return {};
  }
}

export function saveAppliedSkins(skins: AppliedSkins): void {
  try {
    localStorage.setItem(SKINS_STORAGE_KEY, JSON.stringify(skins));
  } catch {
    // preference just won't persist
  }
}

export const SEEN_SETS_KEY = 'shootris_seen_completed_sets';

// ── Set completion ────────────────────────────────────────────────────
// A minted set is usable only once ALL seven of its pieces are held.
// Hold all 28 cards and every minted set is complete, so "collect all 28 to
// unlock all sets" follows automatically. Free sets are always usable.

export interface SetProgress {
  set: SkinSet;
  held: PieceKey[];
  total: number;
  complete: boolean;
}

export function computeSetProgress(cards: OwnedCard[]): SetProgress[] {
  return MINTED_SETS.map((set) => {
    // Distinct pieces: two copies of the same card still count once
    const held = PIECE_KEYS.filter((p) => cards.some((c) => c.set === set && c.piece === p));
    return { set, held, total: PIECE_KEYS.length, complete: held.length === PIECE_KEYS.length };
  });
}

export function unlockedSetsFrom(cards: OwnedCard[]): SkinSet[] {
  const completed = computeSetProgress(cards)
    .filter((p) => p.complete)
    .map((p) => p.set);
  return [...FREE_SETS, ...completed];
}

export function loadSeenSets(): SkinSet[] {
  try {
    const raw = localStorage.getItem(SEEN_SETS_KEY);
    return raw ? (JSON.parse(raw) as SkinSet[]) : [];
  } catch {
    return [];
  }
}

export function saveSeenSets(sets: SkinSet[]): void {
  try {
    localStorage.setItem(SEEN_SETS_KEY, JSON.stringify(sets));
  } catch {
    // no-op
  }
}
