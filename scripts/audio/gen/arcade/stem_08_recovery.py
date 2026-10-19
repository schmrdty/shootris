"""Arcade STEM_08 RECOVERY — warm pads, major-colour inversions, soft release.

Relief after danger. It follows the same progression as the chord stem, so the
two can sound together, but voices every chord as an inversion high in the
register with the brightest tone on top, and answers each phrase with a rising
bell figure. Chord tones only.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 8
NAME = "RECOVERY"


def build(bpm: float) -> PrettyMIDI:
    midi = new_midi(bpm)

    pad = voice_instrument(VOICE_WARM_PAD)
    bells = voice_instrument(VOICE_BELL)

    for bar in range(1, BARS_PER_LOOP + 1):
        symbol = ARCADE_HARMONY[bar - 1]
        # Second inversion on the major chords, first on the minor ones: the
        # third lands near the top either way, which is what reads as warmth.
        inversion = 2 if symbol in ("F", "C", "G", "E") else 1
        voicing = chord_voicing(symbol, 60, 84, size=4, inversion=inversion)
        for n, pitch in enumerate(voicing):
            add_note(pad, pitch, beats(bar, 0, bpm), bar_seconds(bpm) * 0.96, 74 - 4 * n, bpm)

        # Bells on the second half of each two-bar unit, rising through the
        # chord so the figure resolves upward.
        if bar % 2 == 0 and voicing:
            rise = chord_voicing(symbol, 72, 96, size=3)
            for n, pitch in enumerate(rise):
                add_note(
                    bells,
                    pitch,
                    beats(bar, 2 + n * 0.5, bpm),
                    beat_seconds(bpm) * 1.5,
                    68 - 6 * n,
                    bpm,
                )

    midi.instruments += [pad, bells]
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
