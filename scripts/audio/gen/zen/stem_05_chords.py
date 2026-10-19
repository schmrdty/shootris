"""Zen STEM_05 CHORDS — Rhodes and tape-warm keys.

Seventh chords, two bars each, rolled by a few milliseconds per voice so the
keys sound struck rather than quantised, with a quieter re-strike late in the
second bar of each pair. Chord tones only.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 5
NAME = "CHORDS"
BPM = ZEN_BPM

LOW, HIGH = 52, 79  # E3..G5


def build(bpm: float = BPM) -> PrettyMIDI:
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)
    keys = voice_instrument(VOICE_RHODES)

    beat = beat_seconds(bpm)
    for bar in range(1, BARS_PER_LOOP + 1):
        symbol = ZEN_HARMONY[bar - 1]
        first_of_pair = (bar - 1) % 2 == 0
        # Alternate root position and first inversion across pairs so the top
        # voice moves instead of sitting on one note for the whole loop.
        inversion = 0 if ((bar - 1) // 2) % 2 == 0 else 1
        voicing = chord_voicing(symbol, LOW, HIGH, size=4, inversion=inversion)

        if first_of_pair:
            for n, pitch in enumerate(voicing):
                add_note(
                    keys,
                    pitch,
                    beats(bar, 0, bpm) + n * 0.022 + humanize(rng, 0.008),
                    beat * 3.4,
                    80 - 4 * n + rng.randrange(-3, 4),
                    bpm,
                )
        else:
            for n, pitch in enumerate(voicing):
                add_note(
                    keys,
                    pitch,
                    beats(bar, 2.5, bpm) + n * 0.018 + humanize(rng, 0.008),
                    beat * 1.4,
                    58 - 3 * n,
                    bpm,
                )

    midi.instruments.append(keys)
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
