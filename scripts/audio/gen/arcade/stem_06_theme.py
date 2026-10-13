"""Arcade STEM_06 THEME — the main Shootris melody.

Four two-bar phrases with two bars of silence after each, so the theme is
never continuous: statement, answer, restatement, close. Written as scale
degrees of A natural minor from A3, which is also how it is validated.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 6
NAME = "THEME"

SCALE = "a_natural_minor"
BASE = 57  # A3

# (beat offset within the phrase, scale degree from A3, length in beats)
# Phrases are two bars (eight beats) long and start on bars 1, 5, 9 and 13.
PHRASES = (
    (  # statement
        (0.0, 0, 0.75), (1.0, 2, 0.75), (2.0, 4, 1.5),
        (4.0, 3, 0.75), (5.0, 2, 0.75), (6.0, 0, 1.75),
    ),
    (  # answer, lifted a third and opened out
        (0.0, 4, 0.5), (0.5, 5, 0.5), (1.0, 7, 1.5),
        (3.0, 5, 0.5), (3.5, 4, 1.25), (6.0, 3, 1.75),
    ),
    (  # restatement with a turn
        (0.0, 0, 0.75), (1.0, 2, 0.75), (2.0, 4, 0.75),
        (3.0, 5, 0.75), (4.0, 4, 1.5), (6.0, 2, 1.75),
    ),
    (  # close, descending home
        (0.0, 7, 0.75), (1.0, 5, 0.75), (2.0, 4, 0.75),
        (3.0, 3, 0.75), (4.0, 2, 1.5), (6.0, 0, 1.75),
    ),
)

PHRASE_START_BARS = (1, 5, 9, 13)


def build(bpm: float) -> PrettyMIDI:
    tier = ARCADE_BPM_TIERS.index(int(bpm))
    midi = new_midi(bpm)
    lead = voice_instrument(VOICE_LEAD_SYNTH)

    for phrase, start_bar in zip(PHRASES, PHRASE_START_BARS):
        for offset, degree, length in phrase:
            pitch = scale_walk(SCALE, degree, BASE)
            velocity = 100 if offset == 0.0 else 86
            add_note(
                lead,
                pitch,
                beats(start_bar, offset, bpm),
                length * beat_seconds(bpm) * 0.95,
                velocity + tier,
                bpm,
            )

    midi.instruments.append(lead)
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
