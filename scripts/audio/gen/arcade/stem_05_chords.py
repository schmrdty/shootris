"""Arcade STEM_05 CHORDS — pads and atmospheric synths.

Harmonic continuity: one voicing per bar of the progression, held almost the
full bar, with a brighter upper pad entering on the second half of each
four-bar phrase. Chord tones only.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 5
NAME = "CHORDS"


def build(bpm: float) -> PrettyMIDI:
    tier = ARCADE_BPM_TIERS.index(int(bpm))
    midi = new_midi(bpm)

    pad = voice_instrument(VOICE_SAW_PAD)
    upper = voice_instrument(VOICE_WARM_PAD)

    for bar in range(1, BARS_PER_LOOP + 1):
        symbol = ARCADE_HARMONY[bar - 1]
        # Mid-register body, voiced from the chord root upward.
        for n, pitch in enumerate(chord_voicing(symbol, 55, 79, size=4)):
            add_note(
                pad,
                pitch,
                beats(bar, 0, bpm),
                bar_seconds(bpm) * 0.94,
                78 - 3 * n + tier,
                bpm,
            )
        # The upper pad is an inversion, and only on the back half of each
        # phrase: the loop opens up rather than sitting at one density.
        if (bar - 1) % 4 >= 2:
            for n, pitch in enumerate(chord_voicing(symbol, 72, 96, size=3, inversion=1)):
                add_note(
                    upper,
                    pitch,
                    beats(bar, 0, bpm),
                    bar_seconds(bpm) * 0.9,
                    52 - 4 * n,
                    bpm,
                )

    midi.instruments += [pad, upper]
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
