# Piece skin tiles

Drop one **square PNG per piece** into the matching set folder. The game
picks them up automatically — no code changes, no rebuild needed in dev.

```
public/skins/
  basic/      i.png  o.png  t.png  s.png  z.png  j.png  l.png
  earthen/    i.png  o.png  t.png  s.png  z.png  j.png  l.png
  neon/       i.png  o.png  t.png  s.png  z.png  j.png  l.png
  collector/  i.png  o.png  t.png  s.png  z.png  j.png  l.png
```

**Filenames are lowercase single letters** matching the tetromino:
`i o t s z j l`. Anything else is ignored.

## What each file must be

- **256×256 PNG with transparency**
- **6–10 px of transparent inner padding**, so neighbouring cells read as
  separate blocks instead of merging into a slab
- One self-contained block face — **not** the whole tetromino shape
- Readable at 13 px (squint test)

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
