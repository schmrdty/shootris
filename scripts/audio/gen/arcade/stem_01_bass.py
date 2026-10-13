"""Arcade STEM_01 BASS — sub bass, synth bass, rhythmic pulse.

Two layers: a sustained sub holding the bar's chord root an octave below the
pulse, and a synth bass playing the tier's 16th-note pattern. Only roots,
fifths and octaves are used, so every note sits in A natural minor whichever
chord of the progression is underneath it.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 1
NAME = "BASS"

# Sixteenth-note slots the pulse lands on, per BPM tier. Density climbs, but
# every tier keeps rests: a wall of sixteenths stops being hypnotic.
TIER_SLOTS = {
    0: (0, 4, 8, 12, 14),
    1: (0, 3, 4, 8, 11, 12),
    2: (0, 3, 4, 7, 8, 11, 12, 14),
    3: (0, 2, 3, 4, 6, 8, 10, 11, 12, 14),
    4: (0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15),
    5: (0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15),
}

LOW, HIGH = 33, 48  # A1..C3 for the pulse layer


def _nearest_root(symbol: str, previous: int) -> int:
    """The chord root closest to where the line already is, so the bass walks
    rather than leaping a ninth every bar."""
    candidates = [chord_root(symbol, octave) for octave in (1, 2, 3)]
    candidates = [p for p in candidates if LOW <= p <= HIGH]
    return min(candidates, key=lambda p: (abs(p - previous), p))


def build(bpm: float) -> PrettyMIDI:
    tier = ARCADE_BPM_TIERS.index(int(bpm))
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    sub = voice_instrument(VOICE_SUB_BASS)
    pulse = voice_instrument(VOICE_SYNTH_BASS)

    sixteenth = beat_seconds(bpm) / 4
    slots = TIER_SLOTS[tier]
    previous = 45  # A2
    for bar in range(1, BARS_PER_LOOP + 1):
        symbol = ARCADE_HARMONY[bar - 1]
        root = _nearest_root(symbol, previous)
        previous = root

        # Sub: one long tone an octave under the pulse, ducked slightly on the
        # bars where the pulse is busiest so the low end never smears.
        add_note(
            sub,
            root - 12,
            beats(bar, 0, bpm),
            bar_seconds(bpm) * 0.92,
            100 - 4 * tier,
            bpm,
        )

        for slot in slots:
            start = beats(bar, slot / 4, bpm)
            if slot in (0, 8):
                pitch, velocity, length = root, 112, sixteenth * 1.9
            elif slot in (4, 12):
                pitch, velocity, length = root, 100, sixteenth * 1.6
            elif slot in (14, 15):
                pitch, velocity, length = root + 12, 94, sixteenth * 0.9
            else:
                # Offbeat sixteenths alternate the fifth and the octave: both
                # are in key over A, F, C, G and E alike.
                pitch = root + (7 if rng.random() < 0.6 else 12)
                velocity, length = 82 + rng.randrange(0, 10), sixteenth * 0.8
            add_note(pulse, min(pitch, HIGH + 12), start, length, velocity, bpm)

        # Bar-end lift into the next chord on the busier tiers.
        if tier >= 3 and bar % 4 == 0:
            add_note(pulse, root + 19, beats(bar, 3.75, bpm), sixteenth * 0.8, 96, bpm)

    midi.instruments += [sub, pulse]
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
