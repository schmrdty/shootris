"""Zen STEM_03 ROOM — vinyl crackle, tape noise, room texture.

Always active and deliberately almost inaudible. Each crackle note is a region
the renderer fills with texture rather than a single click, so a 16-bar loop
needs a handful of notes instead of hundreds. Pitched content is A and E only.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 3
NAME = "ROOM"
BPM = ZEN_BPM

A1, E2, A2, A3, A4 = 33, 40, 45, 57, 69


def build(bpm: float = BPM) -> PrettyMIDI:
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    hiss = voice_instrument(VOICE_TAPE_HISS)
    crackle = voice_instrument(VOICE_VINYL)

    phrase = bar_seconds(bpm) * 4
    for group in range(BARS_PER_LOOP // 4):
        start = group * phrase
        add_note(hiss, A1, start, phrase * 0.99, 26, bpm)
        if group % 2 == 0:
            add_note(hiss, E2, start, phrase * 0.6, 20, bpm)

    # Crackle: one region per bar, its pitch choosing how bright the texture is.
    for bar in range(1, BARS_PER_LOOP + 1):
        add_note(
            crackle,
            rng.choice((A2, A3, A4)),
            beats(bar, 0, bpm),
            bar_seconds(bpm) * 0.98,
            22 + rng.randrange(0, 8),
            bpm,
        )
    # A few louder pops, as a worn record would.
    for _ in range(6):
        bar = rng.randrange(1, BARS_PER_LOOP + 1)
        add_note(crackle, A4, beats(bar, rng.randrange(0, 8) / 2, bpm), 0.08, 40, bpm, min_duration=0.02)

    midi.instruments += [hiss, crackle]
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
