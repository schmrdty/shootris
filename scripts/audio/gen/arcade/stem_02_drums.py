"""Arcade STEM_02 DRUMS — electronic kit whose complexity rises with the tier.

Tier 0 is a half-time-leaning four-bar groove; tier 5 is a driving sixteenth
pattern with offbeat open hats and a ride. Fills land at bars 8 and 16 and
finish inside their bar, so no tail crosses the loop point.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 2
NAME = "DRUMS"


def _kick_slots(tier: int) -> tuple[int, ...]:
    if tier == 0:
        return (0, 8, 14)
    if tier == 1:
        return (0, 6, 8, 14)
    slots = [0, 4, 8, 12]
    if tier >= 3:
        slots += [6, 14]
    if tier >= 5:
        slots += [3, 11]
    return tuple(sorted(slots))


def build(bpm: float) -> PrettyMIDI:
    tier = ARCADE_BPM_TIERS.index(int(bpm))
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)
    kit = voice_instrument(VOICE_EDM_KIT)

    sixteenth = beat_seconds(bpm) / 4
    hit = sixteenth * 0.5
    kicks = _kick_slots(tier)
    hat_step = 2 if tier <= 1 else 1

    for bar in range(1, BARS_PER_LOOP + 1):
        fill_bar = bar % 8 == 0
        for slot in kicks:
            if fill_bar and slot >= 12:
                continue
            add_note(kit, KICK, beats(bar, slot / 4, bpm), hit, 118, bpm, min_duration=0.01)

        for slot in (4, 12):
            if fill_bar and slot >= 12:
                continue
            add_note(kit, CLAP, beats(bar, slot / 4, bpm), hit, 104, bpm, min_duration=0.01)
            add_note(kit, SNARE, beats(bar, slot / 4, bpm), hit, 88, bpm, min_duration=0.01)

        for slot in range(0, 16, hat_step):
            if fill_bar and slot >= 12:
                continue
            open_hat = tier >= 2 and slot in (6, 14)
            if slot % 4 == 0:
                velocity = 96
            elif slot % 2 == 0:
                velocity = 78
            else:
                velocity = 60 + rng.randrange(0, 8)
            add_note(
                kit,
                OPEN_HAT if open_hat else CLOSED_HAT,
                beats(bar, slot / 4, bpm),
                sixteenth * (1.6 if open_hat else 0.5),
                velocity,
                bpm,
                min_duration=0.01,
            )

        if tier >= 4:
            for slot in (2, 6, 10, 14):
                if fill_bar and slot >= 12:
                    continue
                add_note(kit, RIDE, beats(bar, slot / 4, bpm), hit, 62, bpm, min_duration=0.01)

        if tier >= 3:
            for slot in range(1, 16, 4):
                if fill_bar and slot >= 12:
                    continue
                add_note(kit, SHAKER, beats(bar, slot / 4, bpm), hit, 48, bpm, min_duration=0.01)

        # Phrase-end fill: a tom run across the last beat only.
        if fill_bar:
            run = [HI_TOM, MID_TOM, MID_TOM, LOW_TOM] if tier >= 2 else [MID_TOM, LOW_TOM]
            step = 4 // len(run)
            for n, drum in enumerate(run):
                add_note(
                    kit,
                    drum,
                    beats(bar, (12 + n * step) / 4, bpm),
                    sixteenth * 0.8,
                    100 + 4 * n,
                    bpm,
                    min_duration=0.01,
                )
            add_note(kit, SNARE, beats(bar, 3.75, bpm), hit, 112, bpm, min_duration=0.01)

        # Crash marks the top of each eight-bar half.
        if bar in (1, 9):
            add_note(kit, CRASH, beats(bar, 0, bpm), beat_seconds(bpm) * 2, 108, bpm)

    midi.instruments.append(kit)
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
