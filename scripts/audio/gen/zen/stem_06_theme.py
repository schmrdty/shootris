"""Zen STEM_06 THEME — the Mitty melody.

Two phrases in sixteen bars: five notes at bar 1 in A minor pentatonic, five
notes at bar 9 in the hirajoshi-inspired scale. Eight bars apart, which is the
pack's limit, and the whole stem is otherwise silent — the theme is a reward,
not a bed.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 6
NAME = "THEME"
BPM = ZEN_BPM

# (pitch, beat offset from the phrase start, length in beats)
PHRASE_PENTATONIC = (
    (69, 0.0, 1.2),   # A4
    (72, 1.5, 0.8),   # C5
    (76, 2.5, 1.4),   # E5
    (74, 4.5, 0.9),   # D5
    (69, 6.0, 2.0),   # A4
)

PHRASE_HIRAJOSHI = (
    (76, 0.0, 1.0),   # E5
    (77, 1.25, 0.8),  # F5
    (76, 2.25, 1.0),  # E5
    (72, 4.0, 1.2),   # C5
    (69, 6.0, 2.0),   # A4
)

PHRASES = ((1, PHRASE_PENTATONIC), (9, PHRASE_HIRAJOSHI))


def build(bpm: float = BPM) -> PrettyMIDI:
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)
    koto = voice_instrument(VOICE_KOTO)

    beat = beat_seconds(bpm)
    for start_bar, phrase in PHRASES:
        for n, (pitch, offset, length) in enumerate(phrase):
            add_note(
                koto,
                pitch,
                beats(start_bar, offset, bpm) + humanize(rng, 0.01),
                length * beat,
                96 - 4 * n,
                bpm,
            )

    midi.instruments.append(koto)
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
