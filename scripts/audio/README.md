# Shootris adaptive audio

Two adaptive soundtracks — **Arcade** and **Midnight Tea House** (codename
`zen`) — generated from code, rendered offline, and mixed live in the browser.

Nothing here plays a song. Each pack is eight stems that loop in perfect sync
forever; the game's state moves the eight gains. Music never switches, it
thickens and thins.

```
scripts/audio/
  metadata/schema.json         the contract both the engine and the tests read
  metadata/arcade.json         loop geometry, stems, scales, mixing matrix
  metadata/zen.json
  gen/pm_compat.py             pretty_midi, or a dependency-free stand-in
  gen/common.py                bar maths, scales, chords, voices, seeded RNG
  gen/arcade/stem_0N_*.py      one generator per stem (takes a bpm argument)
  gen/zen/stem_0N_*.py         one generator per stem (84 BPM, fixed)
  gen/generate_all.py          runs all sixteen
  gen/build_metadata.py        writes metadata/<pack>.json
  midi/<pack>/<bpm>/           STEM_0N_<NAME>.mid
  wav/<pack>/<bpm>/            masters — git-ignored, never served
  render/synth.py              the numpy synthesizer
  render/render.py             MIDI -> WAV -> encoded browser files
  tests/                       spec tests 1-9
src/lib/audio/
  stateMachine.ts              pure state machine + the mixing matrix
  stateMachine.test.ts         spec test 10
  engine.ts                    Web Audio playback
  useShootrisAudio.ts          game variables -> state machine -> engine
public/music/<pack>/<bpm>/     STEM_0N_<NAME>.ogg and .m4a
public/music/<pack>/meta.json  the pack metadata the engine fetches
```

## Regenerate

```bash
pnpm audio:generate      # MIDI for both packs, then the metadata
pnpm audio:render        # WAV masters, then the encoded browser files
pnpm test:audio          # all ten validation tests
```

Or in pieces:

```bash
python3 scripts/audio/gen/generate_all.py            # both packs
python3 scripts/audio/gen/generate_all.py zen        # one pack
python3 scripts/audio/gen/build_metadata.py
python3 scripts/audio/gen/arcade/stem_02_drums.py    # one stem, all six tiers
```

Generators are seeded from what they are making (`rng_for(pack, stem, bpm)`),
so a rerun with no source change writes byte-identical MIDI. Changing a
generator changes only its own stem.

### Requirements

* **Python 3.11+** and **numpy**. `pretty_midi` is used when it is installed;
  when it is not, `gen/pm_compat.py` provides the same classes over its own
  Standard MIDI File reader and writer, so generation needs no PyPI access.
* **ffmpeg** with `libopus` and `aac`, for the encode step.
* **FluidSynth** and a General MIDI SoundFont, optionally — see below.

## Render

```bash
python3 scripts/audio/render/render.py                          # everything
python3 scripts/audio/render/render.py --pack zen
python3 scripts/audio/render/render.py --bpm 125 --bpm 135
python3 scripts/audio/render/render.py --skip-wav               # re-encode only
python3 scripts/audio/render/render.py --formats opus           # drop the AAC set
python3 scripts/audio/render/render.py --engine fluidsynth --soundfont /path/gm.sf2
```

Two engines, and `--engine auto` (the default) picks between them:

* **`fluidsynth`** when `fluidsynth` is on PATH and a SoundFont is found (the
  usual locations, `$SHOOTRIS_SOUNDFONT`, or `--soundfont`).
* **`builtin`** otherwise: the numpy synthesizer in `render/synth.py`. It reads
  the voice id from each MIDI track name — `koto`, `sub_bass`, `boombap_kit`
  and the rest, all listed in `common.py` — and has a patch for each, so stems
  sound the same on any machine and there is no SoundFont to ship. Voices also
  carry their General MIDI equivalent in the MIDI program number, which is what
  FluidSynth plays instead.

A full render takes about seven minutes on four cores and writes ~355 MB of
WAV masters (git-ignored) and ~44 MB of encoded files (committed).

### Why the loops are seamless

Validation test 2 forbids a note whose tail crosses bar 16, so the MIDI stops
dead at the seam. The renderer then writes every voice into a **circular**
buffer and convolves the room impulse circularly too: a release tail that would
run past bar 16 reappears under bar 1. The waveform is genuinely periodic, so
the loop point is phase-continuous and the ends are deliberately *not* silent.
Test 7b checks exactly that, and test 7c proves the check has teeth by feeding
it a hard-cut tone.

### Encoding and loop points

Both formats are rendered at 48 kHz:

| id | file | codec | bitrate | why |
|---|---|---|---|---|
| `opus` | `.ogg` | libopus | 80 kbps | first choice: sample-exact and about half the size |
| `aac` | `.m4a` | aac | 96 kbps | fallback for Safari builds whose `decodeAudioData` still refuses Opus |

The engine takes the first format the browser can decode, confirming
`canPlayType` by actually decoding a stem before it builds a set.

`render.py` cross-correlates each encoded file against its master to measure
how many samples of codec priming a decoder prepends, and records it as
`decode_offset_samples`. Both codecs currently measure **0** — ffmpeg honours
the Ogg Opus pre-skip and the MP4 edit list — and AAC's frame padding lands
after the loop, where nothing reads it. The engine adds the offset to
`loopStart`/`loopEnd` regardless, so a codec that does prime stays in sync.

Loop points are kept in **seconds**, not samples: `decodeAudioData` may
resample to the AudioContext's rate, which preserves durations but not sample
counts.

## The packs

|  | Arcade | Midnight Tea House |
|---|---|---|
| key | A minor | A minor |
| tempo | 95 / 105 / 115 / 125 / 135 / 145 | 84, fixed |
| loop | 16 bars of 4/4 | 16 bars of 4/4 |
| harmony | `Am F C G` / `Am G F E` / `Am C G Em` / `Am F C G`, one chord a bar | seventh chords, two bars each |
| scales | A natural minor | A minor pentatonic, hirajoshi-inspired (A B C E F) |
| intensity from | layering **and** the BPM tier | layering only |

Arcade walks all three of its progressions inside one loop, and every tier
shares that harmony — which is what lets one tier crossfade into another
without a key clash.

The eight stems are the same in both packs: `BASS`, `DRUMS`, `ROOM`, `MOTION`,
`CHORDS`, `THEME`, `DANGER`, `RECOVERY`. Each one is written to stand up alone;
none depends on another to make musical sense.

Per-stem levels live in `STEM_PEAK_DBFS` in `render/render.py`. That table is
the mix — the engine's matrix scales these — so balance changes belong there
rather than in a generator.

## Integrate

The game needs one hook. `src/app/single-player/page.tsx` is the worked
example:

```tsx
const [musicOn, setMusicOn] = useMusicPreference(player?.musicOn, persistMusic);
const [musicPack, setMusicPack] = useMusicPack();

useShootrisAudio({
  enabled: musicOn,
  pack: musicPack,
  board: gameState.board,
  piecesPlaced: gameState.piecesPlaced,
  combo: gameState.combo,
  score: gameState.score,
  stage,
  paused: halted || gameState.gameOver || mode === null,
  idle: mode === null,
  dangerMode: journeyTimeLeft !== null && journeyTimeLeft <= 10,
  runKey: runNonce,
});
```

The hook fetches nothing until `enabled` is true, and creates no AudioContext
until the player's first click or keypress — so a muted player downloads no
audio and no error is reported before a gesture has happened.

### What the hook derives

Shootris tracks four of the eight variables the state machine wants. The rest
are derived, and the only gameplay change was exposing two counters
(`piecesPlaced`, `combo`) that `lockPiece` now keeps:

| variable | where it comes from |
|---|---|
| `board_fill_percent` | filled cells over total, from the board |
| `combo_count` | `GameState.combo` — consecutive locks that cleared a line |
| `pieces_per_minute` | rolling 60 s window of lock times, over at least 10 s |
| `score_rate` | rolling 60 s window of score samples, points per minute |
| `mistakes_last_60s` | locks that sealed in a new covered hole (`countCoveredHoles`) |
| `time_alive_seconds` | a clock that stops while the board is held |
| `danger_mode` | the caller's signal — Journey's level timer under 10 s |
| `pause_state` | `halted || gameOver || no mode chosen` |

Shootris is inverted — pieces spawn at row 0 and rise — so a column's *lowest*
filled cell is its surface and an empty cell above that is sealed in. That is
what `countCoveredHoles` counts, and a lock that increases it is a mistake.

### States and the mix

Evaluated in priority order, first match wins; if nothing matches the current
state is held (Calm at startup). `src/lib/audio/stateMachine.ts` is the whole
of it, and the mixing matrix lives there too.

1. **Danger** — fill > 80% or `danger_mode`
2. **Recovery** — after Danger, once fill < 60%; lasts 15 s
3. **Intense** — more than 30 pieces a minute (or `intenseScoreRate`, off by default)
4. **Focus** — combo ≥ 10 with at most one mistake in 60 s
5. **Flow** — combo ≥ 3 and fill < 50%
6. **Calm** — fill < 30% and combo < 3

State changes are quantised to the next bar and crossfade over one bar. A BPM
tier change preloads the next set, starts it at the next **loop** boundary at
gain 0, crossfades over a bar, then releases the old set. Pausing ducks the
master to 0.3 over half a second and keeps the position.

`INTENSE_SCORE_RATE` is exported as `0`, which means *disabled* — a literal
`score_rate > 0` would put every scoring run into Intense. Pass a positive
`thresholds.intenseScoreRate` once the game has a figure it believes in.

## Tests

```bash
pnpm test:audio                                     # all ten
python3 scripts/audio/tests/test_midi.py            # 1-6
python3 scripts/audio/tests/test_audio.py           # 7-9  (decodes 112 files, ~4 min)
python3 scripts/audio/tests/test_audio.py --quick   # 7-9, one tier per pack
node --experimental-strip-types --test src/lib/audio/stateMachine.test.ts   # 10
```

| # | what it holds to |
|---|---|
| 1 | every stem in a set is one 16-bar 4/4 loop of identical length, and non-empty |
| 2 | no note starts before bar 1 or ends after bar 16 |
| 3 | every pitched note is in a declared scale, or in the bar's chord |
| 4 | declared phrase rules — zen `THEME` is five notes max, one phrase per eight bars |
| 5 | zen is 84 BPM in every file |
| 6 | arcade has a full eight-stem set for each of the six tiers |
| 7 | masters match the metadata sample count, and the loop seam is continuous |
| 8 | every stem is non-silent rendered solo |
| 9 | encoded files decode to a length that puts `loopEnd` exactly in place |
| 10 | every state, the priority order, and Recovery's 15 s timeout |

Test 5 allows 0.001 BPM: a MIDI tempo is stored as whole microseconds per
beat, so 84 BPM round-trips as 83.99997 and no file can be more exact.

## Adding a stem or a tier

* **A new BPM tier**: add it to `ARCADE_BPM_TIERS` in `common.py`, rerun
  `audio:generate` and `audio:render`. Test 6 will tell you if a stem is
  missing.
* **A new voice**: add a `Voice` to `VOICES` in `render/synth.py` and its
  General MIDI equivalent to `VOICE_PROGRAMS` in `common.py`, then use
  `voice_instrument(...)` in a generator.
* **Changing the mixing matrix**: it is written twice on purpose — `MIX_MATRIX`
  in `common.py` feeds the metadata, `MIX_MATRIX` in `stateMachine.ts` feeds
  the engine. Change both; test 10 compares the TypeScript against the spec
  table and the metadata is regenerated from the Python.
