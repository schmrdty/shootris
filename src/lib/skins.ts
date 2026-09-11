// Piece skin system — lets vibe.market card art replace the flat rendered
// pieces WITHOUT any change to the NFT contract. The game reads standard
// ERC-721 metadata (name/attributes) and maps each owned card to a
// (set, piece) skin. Only the ART and CARD NAMES matter on the mint side.

export type PieceKey = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type SkinSet = 'basic' | 'earthen' | 'neon' | 'collector';

export const PIECE_KEYS: PieceKey[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const SKIN_SETS: SkinSet[] = ['basic', 'earthen', 'neon', 'collector'];

export const SET_LABELS: Record<SkinSet, string> = {
  basic: 'Basic',
  earthen: 'Earthen',
  neon: 'Neon',
  collector: 'Collector (alt art)',
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

  // vibe.market rarity codes: 0 unassigned, higher = rarer. Epic and above
  // counts as an alt-art collector pull even if the name doesn't say so.
  if (typeof rarityCode === 'number' && rarityCode >= 3) {
    return { set: 'collector', piece };
  }
  if (!set) return null;
  return { set, piece };
}

export type AppliedSkins = Partial<Record<PieceKey, SkinSet>>;

export const SKINS_STORAGE_KEY = 'shootris_applied_skins';
export const SKINS_SEEN_KEY = 'shootris_seen_cards';

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

export function loadSeenCards(): string[] {
  try {
    const raw = localStorage.getItem(SKINS_SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveSeenCards(ids: string[]): void {
  try {
    localStorage.setItem(SKINS_SEEN_KEY, JSON.stringify(ids));
  } catch {
    // no-op
  }
}
