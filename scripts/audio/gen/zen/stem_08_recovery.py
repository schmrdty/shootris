"""Zen STEM_08 RECOVERY — wind bells, soft inversion chord, plucked flourish.

The emotional reset. Everything is drawn from A minor pentatonic, which sits
consonantly over every chord in the pack's progression, so the stem can fade
in at full gain without waiting for a chord change.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 8
NAME = "RECOVERY"
BPM = ZEN_BPM

SCALE = "a_minor_pentatonic"
BELLS = (81, 84, 86, 88, 91)          # A5 C6 D6 E6 G6
# Pentatonic inversions: A minor over C, then a suspended colour over D.
INVERSIONS = ((60, 64, 69), (62, 67, 72))


def build(bpm: float = BPM) -> PrettyMIDI:
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    bells = voice_instrument(VOICE_WIND_BELL)
    keys = voice_instrument(VOICE_RHODES)
    koto = voice_instrument(VOICE_KOTO)

    beat = beat_seconds(bpm)
    phrase_bars = 4
    for group in range(BARS_PER_LOOP // phrase_bars):
        first_bar = group * phrase_bars + 1

        # Soft inversion chord, one per four bars, entering gently.
        chord = INVERSIONS[group % len(INVERSIONS)]
        for n, pitch in enumerate(chord):
            add_note(
                keys,
                pitch,
                beats(first_bar, 0, bpm) + n * 0.03,
                beat * phrase_bars * 3.2,
                62 - 5 * n,
                bpm,
            )

        # Wind bells: four or five sparkles scattered over the phrase, never
        # on a grid, always decaying away before the next phrase.
        for _ in range(rng.randrange(4, 6)):
            bar = first_bar + rng.randrange(0, phrase_bars)
            add_note(
                bells,
                rng.choice(BELLS),
                beats(bar, rng.randrange(0, 8) / 2, bpm) + humanize(rng, 0.04),
                beat * 2.0,
                46 + rng.randrange(0, 14),
                bpm,
            )

        # A short plucked flourish closes every second phrase.
        if group % 2 == 1:
            for n in range(4):
                add_note(
                    koto,
                    scale_walk(SCALE, n, 69),
                    beats(first_bar + phrase_bars - 1, 2.0 + n * 0.25, bpm),
                    beat * 0.8,
                    72 - 4 * n,
                    bpm,
                )

    midi.instruments += [keys, bells, koto]
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
