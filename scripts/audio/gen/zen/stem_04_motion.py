"""Zen STEM_04 MOTION — koto, pipa and guzheng-inspired plucks.

Pentatonic throughout. Every figure is at most five notes and is followed by
silence, which is the pack's melody rule applied to the movement layer as well
as to the theme.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 4
NAME = "MOTION"
BPM = ZEN_BPM

SCALE = "a_minor_pentatonic"
BASE = 69  # A4

# (start bar, start beat, [(degree, beat offset, length)]) — five notes at most.
KOTO_FIGURES = (
    (1, 0.0, ((0, 0.0, 0.9), (2, 1.0, 0.6), (3, 1.5, 1.2))),
    (3, 2.0, ((4, 0.0, 0.7), (3, 0.5, 0.7), (2, 1.0, 1.4))),
    (6, 0.0, ((2, 0.0, 0.6), (4, 0.5, 0.6), (5, 1.0, 0.6), (4, 1.5, 1.3))),
    (9, 1.0, ((0, 0.0, 0.8), (1, 0.75, 0.6), (2, 1.5, 1.3))),
    (11, 2.0, ((5, 0.0, 0.6), (4, 0.5, 0.6), (2, 1.0, 1.5))),
    (14, 0.0, ((3, 0.0, 0.7), (2, 0.75, 0.7), (0, 1.5, 1.8))),
)

# Guzheng-style ascending runs: five notes, then out of the way.
GUZHENG_RUNS = ((5, 2.0), (13, 2.0))

PIPA_ANSWERS = ((4, 1.5, 7), (12, 1.5, 5), (16, 1.0, 2))


def build(bpm: float = BPM) -> PrettyMIDI:
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    koto = voice_instrument(VOICE_KOTO)
    guzheng = voice_instrument(VOICE_GUZHENG)
    pipa = voice_instrument(VOICE_PIPA)

    beat = beat_seconds(bpm)
    for bar, origin, figure in KOTO_FIGURES:
        for n, (degree, offset, length) in enumerate(figure):
            add_note(
                koto,
                scale_walk(SCALE, degree, BASE),
                beats(bar, origin + offset, bpm) + humanize(rng, 0.012),
                length * beat,
                92 - 5 * n + rng.randrange(-4, 5),
                bpm,
            )

    for bar, origin in GUZHENG_RUNS:
        for n in range(5):
            add_note(
                guzheng,
                scale_walk(SCALE, n, BASE - 12),
                beats(bar, origin + n * 0.25, bpm),
                beat * 0.9,
                78 + 3 * n,
                bpm,
            )

    for bar, origin, degree in PIPA_ANSWERS:
        add_note(
            pipa,
            scale_walk(SCALE, degree, BASE),
            beats(bar, origin, bpm) + humanize(rng, 0.012),
            beat * 1.2,
            70,
            bpm,
        )

    midi.instruments += [koto, guzheng, pipa]
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
