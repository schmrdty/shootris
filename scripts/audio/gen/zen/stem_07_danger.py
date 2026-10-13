"""Zen STEM_07 DANGER — danger by subtraction.

Never louder and never aggressive: a filtered drone, the bass root an octave
lower than the bass stem plays it, and percussion reduced to one soft kick
every two bars. Pitches are A and E only, so it adds weight without adding
harmony.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 7
NAME = "DANGER"
BPM = ZEN_BPM

A0, A1, E2, A2 = 21, 33, 40, 45


def build(bpm: float = BPM) -> PrettyMIDI:
    midi = new_midi(bpm)

    drone = voice_instrument(VOICE_DRONE)
    sub = voice_instrument(VOICE_SUB_BASS)
    perc = voice_instrument(VOICE_SPARSE_PERC)

    phrase = bar_seconds(bpm) * 4
    for group in range(BARS_PER_LOOP // 4):
        start = group * phrase
        add_note(drone, A1, start, phrase * 0.99, 58, bpm)
        # The fifth is the only movement in the stem, and it fades in and out
        # across the loop rather than switching.
        if group in (1, 2):
            add_note(drone, E2, start, phrase * 0.99, 40, bpm)
        # Lower bass octave: the subtraction the pack calls for.
        add_note(sub, A0, start, phrase * 0.96, 66, bpm)

    for bar in range(1, BARS_PER_LOOP + 1, 2):
        add_note(perc, KICK, beats(bar, 0, bpm), 0.2, 70, bpm, min_duration=0.02)
    for bar in range(4, BARS_PER_LOOP + 1, 8):
        add_note(perc, LOW_TOM, beats(bar, 2, bpm), 0.25, 54, bpm, min_duration=0.02)

    midi.instruments += [drone, sub, perc]
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
