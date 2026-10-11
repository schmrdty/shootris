// Pre-mint check for Shootris card names.  Run:  npm run check:cards
//
// A card the game misreads either unlocks nothing (a typo) or, worse, counts
// toward the wrong set, so a cheap card could complete a chase set. Run
// this against a planned set BEFORE minting, while names are still cheap
// to change.
//
// 1. Real cards (scripts/card-fixtures.json) must map exactly as their Set
//    and Piece traits say, so no parser change can strip a holder's unlock.
// 2. Trap names that look like an existing set must never land in it,
//    including cards from one collection that name another's set.
// 3. Planned cards (scripts/planned-cards.json, or a path given as the first
//    argument) must each land on their intended set and piece, cover all
//    seven pieces, and never put two cards on the same piece.

import { readFileSync, existsSync } from 'node:fs';
import {
  parseCardToSkin,
  collectionOf,
  PIECE_KEYS,
  SKIN_SETS,
  type CollectionKey,
  type PieceKey,
  type SkinSet,
} from '../src/lib/skins.ts';

type Traits = Record<string, string>;
interface Card {
  name: string;
  attributes?: Traits;
  /** The contract it is minted in. Omitted: the original Shootris cards. */
  collection?: CollectionKey;
  /** What it should unlock, e.g. "sportris-ballgame I". Omit for "must unlock nothing". */
  intended?: string;
}

const asAttributes = (t: Traits = {}) => Object.entries(t).map(([trait_type, value]) => ({ trait_type, value }));
const parse = (c: Card) => parseCardToSkin(c.name, asAttributes(c.attributes), undefined, c.collection ?? 'shootris');
const show = (r: ReturnType<typeof parseCardToSkin>) => (r ? `${r.set} ${r.piece}` : 'nothing');
const describe = (c: Card) => {
  const t = Object.entries(c.attributes ?? {})
    .filter(([k]) => ['set', 'piece', 'series', 'shape'].includes(k.toLowerCase()))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const from = c.collection && c.collection !== 'shootris' ? `${c.collection} ` : '';
  return `${from}"${c.name}"${t ? ` [${t}]` : ''}`;
};

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg: string) => console.log(`  ok    ${msg}`);

// ── 1. Real cards ─────────────────────────────────────────────────────
console.log('\n1. Real cards from the chain must keep mapping exactly as their traits say');
const fixtures = JSON.parse(readFileSync(new URL('./card-fixtures.json', import.meta.url), 'utf8')) as { cards: Card[] };
for (const card of fixtures.cards) {
  const want = `${card.attributes!.Set.toLowerCase()} ${card.attributes!.Piece.toUpperCase()}`;
  const got = show(parse(card));
  if (got === want) pass(`${describe(card)} -> ${got}`);
  else fail(`${describe(card)} -> ${got}, expected ${want}`);
}

// ── 2. Traps ──────────────────────────────────────────────────────────
// Each name resembles an existing set. It may belong to a set of its own
// (Set=Sports is a Sports card once Sports is registered), but it must never
// land in the set it merely looks like.
console.log('\n2. Names that resemble an existing set must never land in it');
const traps: [Card, SkinSet][] = [
  [{ name: 'Golden Boot', attributes: { Set: 'Sports', Piece: 'I' } }, 'collector'],
  [{ name: 'Sports I', attributes: { Set: 'Golden Era', Piece: 'I' } }, 'collector'],
  [{ name: 'Sports T', attributes: { Set: 'Classic Ballers', Piece: 'T' } }, 'basic'],
  [{ name: 'Sports O', attributes: { Set: 'Earth Kickers', Piece: 'O' } }, 'earthen'],
  [{ name: 'Prism Pitch', attributes: { Set: 'Prismatic', Piece: 'S' } }, 'collector'],
  [{ name: 'T-Ball Classic' }, 'basic'],
  [{ name: 'Hook Shot' }, 'neon'],
  [{ name: 'Golden Glove' }, 'collector'],
  [{ name: 'Classic Hook Shot' }, 'basic'],
  [{ name: 'Neon Hook Shot' }, 'neon'],
  [{ name: 'Gunmetal I', attributes: { Set: 'Gunmetal', Piece: 'I' } }, 'gunmetal'],
  // Another collection's cards, labelled exactly like Shootris cards. Only the
  // contract a card was read from decides which sets it can unlock.
  [{ name: 'Neon I', attributes: { Set: 'Neon', Piece: 'I' }, collection: 'smasherdasher' }, 'neon'],
  [{ name: 'Neon Lance', collection: 'smasherdasher' }, 'neon'],
  [{ name: 'Basic T', attributes: { Set: 'Basic', Piece: 'T' }, collection: 'sportris' }, 'basic'],
  [{ name: 'Earthen O', collection: 'sportris' }, 'earthen'],
  [{ name: 'Collector Z', attributes: { Set: 'Collector', Piece: 'Z' }, collection: 'sportris' }, 'collector'],
];
for (const [card, lookalike] of traps) {
  const got = parse(card);
  if (got?.set === lookalike) fail(`${describe(card)} -> ${show(got)}: it only looks like ${lookalike}`);
  else pass(`${describe(card)} -> ${show(got)}, not ${lookalike}`);
}

// ── 3. Planned cards ──────────────────────────────────────────────────
const plannedPath = process.argv[2] ?? new URL('./planned-cards.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (!existsSync(plannedPath)) {
  console.log(`\n3. Planned cards: none (${plannedPath} not found, see planned-cards.example.json)`);
} else {
  console.log(`\n3. Planned cards from ${plannedPath}`);
  const planned = JSON.parse(readFileSync(plannedPath, 'utf8')) as { cards: Card[] };
  const piecesBySet = new Map<string, Map<PieceKey, string[]>>();
  for (const card of planned.cards) {
    const got = parse(card);
    const want = card.intended?.trim().replace(/\s+/g, ' ');
    if (!want) {
      if (!got) pass(`${describe(card)} -> nothing, as intended`);
      else fail(`${describe(card)} -> ${show(got)}, but it was meant to unlock nothing`);
      continue;
    }
    const wantSet = want.toLowerCase().split(' ')[0] as SkinSet;
    if (!SKIN_SETS.includes(wantSet)) {
      fail(`${describe(card)}: intended set "${wantSet}" is not registered in src/lib/skins.ts`);
      continue;
    }
    const mintedIn = card.collection ?? 'shootris';
    if (collectionOf(wantSet) !== mintedIn) {
      fail(
        `${describe(card)}: set "${wantSet}" belongs to ${collectionOf(wantSet) ?? 'no collection'}, but the card is minted in ${mintedIn}`
      );
      continue;
    }
    if (show(got).toLowerCase() === want.toLowerCase()) pass(`${describe(card)} -> ${show(got)}`);
    else fail(`${describe(card)} -> ${show(got)}, intended ${want}`);
    if (got) {
      const pieces = piecesBySet.get(got.set) ?? new Map<PieceKey, string[]>();
      pieces.set(got.piece, [...(pieces.get(got.piece) ?? []), card.name]);
      piecesBySet.set(got.set, pieces);
    }
  }
  for (const [set, pieces] of piecesBySet) {
    for (const [piece, names] of pieces) {
      if (names.length > 1) fail(`${set}: ${names.length} different cards claim piece ${piece} (${names.join(', ')})`);
    }
    const missing = PIECE_KEYS.filter((p) => !pieces.has(p));
    if (missing.length) fail(`${set}: no card for piece ${missing.join(', ')}, so the set could never be completed`);
    else pass(`${set}: all seven pieces covered, one card each`);
  }
}

console.log(failures ? `\n${failures} problem(s). Fix these before minting.\n` : '\nAll clear.\n');
process.exit(failures ? 1 : 0);
