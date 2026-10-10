# Piece skin tiles

Drop one **square PNG per piece** into the matching set folder. The game
picks them up automatically — no code changes, no rebuild needed in dev.

```
public/skins/
  basic/      i.png  o.png  t.png  s.png  z.png  j.png  l.png
  earthen/    i.png  o.png  t.png  s.png  z.png  j.png  l.png
  neon/       i.png  o.png  t.png  s.png  z.png  j.png  l.png
  collector/  i.png  o.png  t.png  s.png  z.png  j.png  l.png
  gunmetal/   i.png  o.png  t.png  s.png  z.png  j.png  l.png
```

`basic`, `earthen`, `neon` and `collector` unlock by holding the matching
vibe.market card. `gunmetal` is never minted — it is a free choice for every
player in Settings → Card Art.

**Filenames are lowercase single letters** matching the Shootris piece:
`i o t s z j l`. Anything else is ignored.

## What each file must be

- **256×256 PNG**
- **Visible separation between neighbouring cells**: either transparent
  inner padding, or edge definition drawn into the tile itself (a bevel or a
  dark border). The shipped sets use the second approach.
- One self-contained block face, **not** the whole Shootris piece shape
- Readable at 13 px (squint test)

## Round art (balls, coins, faces…)

Collision always happens on the **square** cell, so players must be able to
see every cell's square edge. The game draws each tile over a square of its
piece's colour, so round art works well **as long as the corners are
transparent**: the colour fills them and the piece still reads as square
blocks.

**The Sports set is built this way: balls with transparent corners.**

Never paint the corners the board's background colour (black for Neon,
cream for Earthen). The colour square is then covered and the balls float
with no visible edges, so players misjudge what fits. Corners in the
piece's own material are fine. `/skins-preview` flags any tile whose
corners blend into a board.

## Adding a new set

1. Add the set to `SkinSet` and to `SET_DEFINITIONS` in `src/lib/skins.ts`
   (one entry: label, the exact `Set` trait value, any piece nicknames).
2. Put its seven tiles in `public/skins/<set>/`.
3. **Before minting**, list every planned card in
   `scripts/planned-cards.json` (copy the `.example.json`) and run
   `npm run check:cards`. It fails if any card would land in the wrong set or
   piece, two cards claim one piece, or a piece has no card.

Cards are identified by their `Set` and `Piece` traits, matched exactly.
Avoid set names that resemble an existing one ("Golden…", "Classic…",
"Earth…"): the parser no longer guesses, but players will.

## Why only 7 per set

The game builds every piece from repeated single cells, so the tile never
rotates — only which cells are filled changes. One tile covers all four
rotations. 7 tiles per set, not 28.

## Check your work

Run the dev server and open **/skins-preview**. It draws every piece in all
four rotations at real game sizes, in both themes, and flags any tile that
is missing, non-square, or under 128 px.

Missing files are not an error: that piece simply falls back to its flat
colour, so you can ship tiles a set at a time.

Full brief: [../../design/nft-asset-spec.md](../../design/nft-asset-spec.md)
