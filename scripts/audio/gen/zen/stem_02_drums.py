"""Zen STEM_02 DRUMS — boom-bap kick, dusty snare, soft hats.

Always active. Kick on one and the and-of-three, snare on two and four with
ghosts, eighth hats swung to 58%, and every hit nudged and re-levelled so no
two bars are identical. No EDM pattern, no trap rolls.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 2
NAME = "DRUMS"
BPM = ZEN_BPM

SWING = 0.58       # where the second eighth of each beat lands
HUMANIZE = 0.018


def build(bpm: float = BPM) -> PrettyMIDI:
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)
    kit = voice_instrument(VOICE_BOOMBAP_KIT)

    beat = beat_seconds(bpm)
    sixteenth = beat / 4
    hit = sixteenth * 0.6

    def place(drum: int, slot: float, velocity: int, length: float = hit, swing: bool = False) -> None:
        offset = slot / 4
        if swing:
            offset += (SWING - 0.5) * 0.5  # push the off-eighth late
        add_note(
            kit,
            drum,
            max(0.0, beats(bar, offset, bpm) + humanize(rng, HUMANIZE)),
            length,
            velocity + rng.randrange(-6, 7),
            bpm,
            min_duration=0.01,
        )

    for bar in range(1, BARS_PER_LOOP + 1):
        place(KICK, 0, 102)
        place(KICK, 10, 96)
        if bar % 4 == 0:
            place(KICK, 14, 72)       # a late pickup every four bars
        if bar % 8 == 5:
            place(KICK, 6, 78)

        place(SNARE, 4, 94)
        place(SNARE, 12, 92)
        if bar % 2 == 0:
            place(SNARE, 15, 44)      # ghost
        if bar % 4 == 3:
            place(SIDE_STICK, 7, 52)

        for slot in range(0, 16, 2):
            off_eighth = (slot // 2) % 2 == 1
            velocity = 62 if slot % 4 == 0 else 48
            place(CLOSED_HAT, slot, velocity, sixteenth * 0.5, swing=off_eighth)
        if bar % 4 == 2:
            place(OPEN_HAT, 14, 58, sixteenth * 1.6, swing=True)
        if bar % 8 == 1:
            place(RIDE, 8, 46, sixteenth)

    midi.instruments.append(kit)
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
