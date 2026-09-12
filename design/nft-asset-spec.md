# Shootris NFT → in-game asset spec

**Purpose:** make "hold a card, use its art in the game" work against
vibe.market's *unmodified* contract. Nothing here requires custom contract
work — the game identifies cards from standard NFT metadata. What it does
require is that the art and the card names follow this spec exactly.

---

## 1. The shape problem (read this first)

A tetromino is **not** a single picture in play. It rotates, and when a line
clears the piece gets **cut apart** — the cleared row vanishes and the rest
of the piece stays on the board. So a beautiful whole-piece illustration
cannot be pasted onto the board; it would tear, stretch, and rotate wrong.

Every card therefore needs **two** exports:

| Export | Used for | Shape |
|---|---|---|
| **Card art** | the vibe.market NFT itself | whole piece, illustrated freely |
| **Cell tile** | the actual in-game asset | ONE square block face |

The game builds every piece out of repeated **cell tiles**: an I-piece is the
same tile drawn 4×, an O-piece 2×2, and so on. That is what makes the art
survive rotation and line clears — and it's why "the right shapes" matter.

The card art should *look like* the tile it ships with (same material,
palette, and personality) so a collector sees the connection instantly.

### Shape reference (cells per piece)

```
I  ████        O  ██        T  █        S   ██      Z   ██
                 ██           ███          ██            ██
L  █           J    █
   ███            ███
```

---

## 2. Cell tile specs (the in-game asset)

- **Format:** PNG with transparency
- **Size:** 256×256 px (renders at 10–24 px, so this stays crisp on retina)
- **Content:** one self-contained block face — the material of that piece,
  readable as a single square unit
- **Keep 6–10 px of inner padding** so adjacent cells read as separate blocks
  rather than merging into a slab
- **No text, no piece outline, no drop shadow** outside the square (the game
  adds its own lighting per theme)
- **Must read at 13 px.** Squint test: if it turns to mush at thumbnail size,
  simplify it. One strong shape + one accent beats fine detail.

**File naming** (drop straight into the repo, no code changes needed):

```
public/skins/basic/i.png       public/skins/neon/i.png
public/skins/earthen/i.png     public/skins/collector/i.png
```

…one per piece: `i o t s z j l` (lowercase) × the four sets.

---

## 3. Card art specs (the NFT)

- **Format:** PNG or JPG, 1024×1024
- **Content:** the whole tetromino in its canonical shape above — the shape
  must be unmistakable at a glance
- **Leave ~10% margin** on all sides: vibe.market composites foil and wear
  effects over the art
- **Do not draw rarity** on the card (rarity is vibe.market's mechanic and is
  applied on their side)

---

## 4. Card naming — REQUIRED for detection

This is how the game knows what a player holds without any contract change.
Each card's **name** (or its metadata attributes) must identify **set** and
**piece**. The parser accepts either.

**Preferred — attributes:**

```json
"attributes": [
  { "trait_type": "Set",   "value": "Neon" },
  { "trait_type": "Piece", "value": "I" }
]
```

**Or — a name containing both:** `"Neon I"`, `"Earthen T-piece"`,
`"Collector — The Lance"`.

Accepted set words: `Basic` / `Classic` · `Earthen` · `Neon` ·
`Collector` / `Alt Art` / `Variant`.

Accepted piece identifiers: the letters `I O T S Z J L`, or these nicknames:

| Piece | Neon nickname | Earthen nickname |
|---|---|---|
| I | The Lance | The Root |
| O | The Core | The Cobble |
| T | The Conductor | The Bloom |
| S | The Serpent | The Fern |
| Z | The Fang | The Ember |
| J | The Hook | The Riverstone |
| L | The Crane | The Harvest |

A card the parser can't identify is **ignored**, not guessed at — so a typo
in a card name means that card silently unlocks nothing. Names matter.

---

## 5. The four sets (28 cards)

| Set | Cards | Direction |
|---|---|---|
| **Basic** | 7 | Clean, flat, arcade-classic. Solid colour, subtle bevel, no texture. The "default" look. |
| **Earthen** | 7 | **Cartoonish**, not photoreal — chunky stylised nature: bold outlines, flat-ish shading, playful. Think modern mobile-puzzle art, not a photographed diorama. |
| **Neon** | 7 | Glowing arcade blocks on black, Tron energy, bright edge-light. |
| **Collector** | 7 | One alt-art variant per piece — the chase cards. Same shape, elevated execution: animated-feeling energy, precious materials, a distinct twist per piece. |

Rarity tiers (rare / ultra rare / god rare) are assigned **on vibe.market**
and are not part of the artwork.

---

## 6. How it plays out in game

1. Player pulls a card on vibe.market.
2. Next sign-in, the game reads their wallet on the collection chain,
   fetches each card's metadata, and maps it to a (set, piece) skin.
3. A prompt appears: *"You're holding N Shootris cards. Use this art for your
   pieces in game?"* → **Use my card art** / **Not now**.
4. Accepting swaps in the cell tiles per piece. Settings → Card Art shows
   what's applied and can reset to default.

Missing tile files fall back to the current flat colours, so cards can be
minted before the tiles ship — the art just appears once the files land.
