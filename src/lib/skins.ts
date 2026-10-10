// Piece skin system — lets vibe.market card art replace the flat rendered
// pieces WITHOUT any change to the NFT contract. The game reads standard
// ERC-721 metadata (name/attributes) and maps each owned card to a
// (set, piece) skin. Only the ART and CARD NAMES matter on the mint side.

export type PieceKey = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const PIECE_KEYS: PieceKey[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// ── Set registry ──────────────────────────────────────────────────────
// Every skin set lives here and nowhere else. To launch a set: add its key
// to SkinSet, add one entry below, and drop seven tiles into
// public/skins/<key>/. Then run `npm run check:cards` against the planned
// card names BEFORE minting (see scripts/check-card-names.ts).

export type SkinSet = 'basic' | 'earthen' | 'neon' | 'collector' | 'gunmetal';

interface SetDefinition {
  label: string;
  /** Obtainable by holding cards. Unminted sets are free in-game choices. */
  minted: boolean;
  /**
   * The card's Set trait must equal one of these exactly (ignoring case,
   * spacing and punctuation). Exact on purpose: loose keyword matching once
   * filed a "Golden Boot" sports card under Collector.
   */
  names: string[];
  /** Piece nicknames printed on this set's cards. Never matched for another set. */
  nicknames?: Partial<Record<PieceKey, string[]>>;
}

const NEON_NICKNAMES = { I: ['lance'], O: ['core'], T: ['conductor'], S: ['serpent'], Z: ['fang'], J: ['hook'], L: ['crane'] };
const EARTHEN_NICKNAMES = { I: ['root'], O: ['cobble'], T: ['bloom'], S: ['fern'], Z: ['ember'], J: ['riverstone'], L: ['harvest'] };

const SET_DEFINITIONS: Record<SkinSet, SetDefinition> = {
  basic: { label: 'Basic', minted: true, names: ['Basic', 'Classic'] },
  earthen: { label: 'Earthen', minted: true, names: ['Earthen'], nicknames: EARTHEN_NICKNAMES },
  neon: { label: 'Neon', minted: true, names: ['Neon'], nicknames: NEON_NICKNAMES },
  // Alt-art takes on the other sets, so they may carry either set's names
  collector: {
    label: 'Collector (alt art)',
    minted: true,
    names: ['Collector', 'Alt Art', 'Variant'],
    nicknames: Object.fromEntries(
      (Object.keys(NEON_NICKNAMES) as PieceKey[]).map((k) => [k, [...NEON_NICKNAMES[k], ...EARTHEN_NICKNAMES[k]]])
    ),
  },
  // Never minted: a free in-game choice, and no card can ever map to it
  gunmetal: { label: 'Gunmetal', minted: false, names: [] },
};

export const SKIN_SETS = Object.keys(SET_DEFINITIONS) as SkinSet[];
export const MINTED_SETS = SKIN_SETS.filter((s) => SET_DEFINITIONS[s].minted);
export const FREE_SETS = SKIN_SETS.filter((s) => !SET_DEFINITIONS[s].minted);
export const SET_LABELS = Object.fromEntries(SKIN_SETS.map((s) => [s, SET_DEFINITIONS[s].label])) as Record<
  SkinSet,
  string
>;
/** Cards needed to unlock every minted set: seven per set. */
export const TOTAL_MINTED_CARDS = MINTED_SETS.length * PIECE_KEYS.length;

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

// Real cards carry exact `Set` and `Piece` traits (e.g. Set=Neon, Piece=Z).
// Other traits, such as Edition=First Edition or Foil=Prism, are never read.
const SET_TRAITS = ['set', 'series'];
const PIECE_TRAITS = ['piece', 'shape', 'block', 'tetromino'];

/** Lowercase, punctuation to spaces: "Alt-Art" and "alt art" are equal. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function trait(attrs: MetadataAttribute[] | undefined, names: string[]): string | null {
  if (!Array.isArray(attrs)) return null;
  for (const name of names) {
    for (const a of attrs) {
      if (typeof a?.trait_type === 'string' && a.trait_type.trim().toLowerCase() === name) {
        const value = String(a.value ?? '').trim();
        if (value) return value;
      }
    }
  }
  return null;
}

/** The set whose registered name equals `text` exactly, or null. */
function setNamed(text: string): SkinSet | null {
  const t = normalize(text);
  if (!t) return null;
  return SKIN_SETS.find((s) => SET_DEFINITIONS[s].names.some((n) => normalize(n) === t)) ?? null;
}

/**
 * A piece written as its letter ("I", "T piece") or as one of THIS set's
 * nicknames ("The Lance" counts for Neon, never for a sports set). The whole
 * text must be the piece: "Hook Shot" is not a J.
 */
function pieceNamed(text: string, set: SkinSet): PieceKey | null {
  const t = normalize(text).replace(/^the /, '');
  const letter = t.match(/^([iotszjl])( piece)?$/);
  if (letter) return letter[1].toUpperCase() as PieceKey;
  const nicknames = SET_DEFINITIONS[set].nicknames ?? {};
  return PIECE_KEYS.find((p) => nicknames[p]?.includes(t)) ?? null;
}

/** "Neon Lance" -> [neon, "lance"]: a name that starts with a registered set name. */
function splitSetPrefix(name: string): [SkinSet, string] | null {
  const n = normalize(name);
  for (const set of SKIN_SETS) {
    for (const alias of SET_DEFINITIONS[set].names) {
      const a = normalize(alias);
      if (a && n.startsWith(a + ' ')) return [set, n.slice(a.length + 1)];
    }
  }
  return null;
}

/**
 * Map one card's standard NFT metadata to a skin, or null if it can't be
 * identified with certainty. Unidentified cards unlock nothing; they are
 * never guessed at, because a wrong guess counts toward the wrong set.
 *
 * - A Set trait decides the set, and must match a registered name exactly.
 *   If it doesn't, the card is ignored: the name is NOT consulted, or a
 *   "Golden Boot" with Set=Sports would read as Collector.
 * - A Piece trait decides the piece, as a letter or this set's nickname.
 * - Only with no Set trait at all does the name decide, and only in the
 *   form "<Set> <piece>", e.g. "Neon I", "Earthen Cobble".
 */
export function parseCardToSkin(
  name: string,
  attributes?: MetadataAttribute[],
  rarityCode?: number
): { set: SkinSet; piece: PieceKey } | null {
  void rarityCode; // rarity never identifies a card
  const setTrait = trait(attributes, SET_TRAITS);
  const pieceTrait = trait(attributes, PIECE_TRAITS);

  let set: SkinSet | null;
  let nameRest: string | null = null;
  if (setTrait) {
    set = setNamed(setTrait);
    if (!set) return null;
    // A name that repeats the set ("Neon Lance") may still name the piece
    nameRest = splitSetPrefix(name)?.[0] === set ? splitSetPrefix(name)![1] : null;
  } else {
    const split = splitSetPrefix(name);
    if (!split) return null;
    [set, nameRest] = split;
  }
  if (!SET_DEFINITIONS[set].minted) return null;

  const piece = pieceTrait ? pieceNamed(pieceTrait, set) : nameRest ? pieceNamed(nameRest, set) : null;
  return piece ? { set, piece } : null;
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
