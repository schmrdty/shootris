"""Arcade STEM_04 MOTION — arpeggiators and short plucks.

The movement layer. Chord tones only, so it is validated against the active
chord rather than against a scale. The arpeggiator's rate and the gate pattern
both open up with the tier, which is what makes a higher tier feel faster even
before the BPM registers.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 4
NAME = "MOTION"

LOW, HIGH = 60, 88  # C4..E6

# Which sixteenths of each bar the arpeggiator is gated open on.
TIER_GATE = {
    0: (0, 4, 8, 12),
    1: (0, 2, 4, 8, 10, 12),
    2: (0, 2, 4, 6, 8, 10, 12, 14),
    3: (0, 1, 2, 4, 6, 7, 8, 10, 12, 14),
    4: (0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14),
    5: tuple(s for s in range(16) if s not in (5, 13)),
}


def build(bpm: float) -> PrettyMIDI:
    tier = ARCADE_BPM_TIERS.index(int(bpm))
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    arp = voice_instrument(VOICE_ARP_SYNTH)
    pluck = voice_instrument(VOICE_PLUCK_SYNTH)

    sixteenth = beat_seconds(bpm) / 4
    gate = TIER_GATE[tier]

    for bar in range(1, BARS_PER_LOOP + 1):
        symbol = ARCADE_HARMONY[bar - 1]
        voicing = chord_voicing(symbol, LOW, HIGH, size=4)
        if not voicing:
            continue
        # Up-down over the voicing, so the figure turns around inside the bar
        # instead of sawing in one direction.
        shape = voicing + voicing[-2:0:-1]
        for position, slot in enumerate(gate):
            pitch = shape[(position + bar) % len(shape)]
            velocity = 92 if slot % 4 == 0 else 74 + rng.randrange(0, 12)
            add_note(arp, pitch, beats(bar, slot / 4, bpm), sixteenth * 0.85, velocity, bpm)

        # Plucks answer the arpeggio at the top of every other bar.
        if bar % 2 == 1:
            add_note(pluck, voicing[-1] + 12 if voicing[-1] + 12 <= HIGH + 12 else voicing[-1],
                     beats(bar, 2.5, bpm), sixteenth * 2.5, 88, bpm)
        if tier >= 3 and bar % 4 == 3:
            add_note(pluck, voicing[1], beats(bar, 3.5, bpm), sixteenth * 1.5, 80, bpm)

    midi.instruments += [arp, pluck]
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
