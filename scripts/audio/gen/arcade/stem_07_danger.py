"""Arcade STEM_07 DANGER — dark synth pulse, filtered distortion, fast hats.

Urgency without a key change: an eighth-note pulse on the tonic that walks
down A-G-F-E across each four-bar group, under a hat pattern twice the rate of
the main kit. All pitches are A natural minor, so it layers over any bar of
the progression.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 7
NAME = "DANGER"

SCALE = "a_natural_minor"
# A2 down to E2: the descent that makes the stem read as closing in.
DESCENT = (45, 43, 41, 40)


def build(bpm: float) -> PrettyMIDI:
    tier = ARCADE_BPM_TIERS.index(int(bpm))
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    pulse = voice_instrument(VOICE_DARK_PULSE)
    hats = voice_instrument(VOICE_FAST_HAT)

    eighth = beat_seconds(bpm) / 2
    sixteenth = beat_seconds(bpm) / 4
    thirtysecond = sixteenth / 2

    for bar in range(1, BARS_PER_LOOP + 1):
        root = DESCENT[(bar - 1) % 4]
        for slot in range(8):
            accent = slot % 2 == 0
            pitch = root if slot % 4 != 3 else root + 7
            add_note(
                pulse,
                pitch,
                beats(bar, slot / 2, bpm),
                eighth * (0.9 if accent else 0.55),
                104 if accent else 84,
                bpm,
            )
        # A low octave stab on the downbeat holds the bottom together.
        add_note(pulse, root - 12, beats(bar, 0, bpm), beat_seconds(bpm) * 0.9, 96, bpm)

        step = thirtysecond if tier >= 3 else sixteenth
        count = int(round(bar_seconds(bpm) / step))
        for n in range(count):
            velocity = 74 if n % 4 == 0 else 52 + rng.randrange(0, 10)
            add_note(
                hats,
                CLOSED_HAT,
                beats(bar, 0, bpm) + n * step,
                step * 0.5,
                velocity,
                bpm,
                min_duration=0.008,
            )
        # Open hat flags the halfway point of every bar.
        add_note(hats, OPEN_HAT, beats(bar, 2, bpm), sixteenth * 1.5, 78, bpm, min_duration=0.01)

    midi.instruments += [pulse, hats]
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
