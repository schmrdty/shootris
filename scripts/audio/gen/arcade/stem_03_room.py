"""Arcade STEM_03 ROOM — electronic ambience and filtered space.

This stem is at gain 1.0 in every state, so it is written to be felt rather
than heard: a low A/E drone pair plus one filtered noise swell per four-bar
phrase. Pitched content is limited to A and E so the stem never implies a
chord that fights the progression.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "arcade"
INDEX = 3
NAME = "ROOM"

A2, E3, A3 = 45, 52, 57


def build(bpm: float) -> PrettyMIDI:
    tier = ARCADE_BPM_TIERS.index(int(bpm))
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    drone = voice_instrument(VOICE_DRONE)
    sweep = voice_instrument(VOICE_NOISE_SWEEP)

    phrase = bar_seconds(bpm) * 4
    for group in range(BARS_PER_LOOP // 4):
        start = group * phrase
        # The drone breathes across each four-bar phrase; the fifth above sits
        # under it at half the level and drops out of the third phrase so the
        # loop does not feel completely static.
        add_note(drone, A2, start, phrase * 0.99, 46 + 2 * tier, bpm)
        if group != 2:
            add_note(drone, E3, start + phrase * 0.25, phrase * 0.7, 34, bpm)
        if group % 2 == 1:
            add_note(drone, A3, start + phrase * 0.5, phrase * 0.45, 28, bpm)

        # One swell per phrase, rising into the next phrase boundary. The note
        # data stops at the loop end; the renderer wraps the audio tail.
        swell_len = phrase * 0.45
        add_note(
            sweep,
            A3 + rng.choice((0, 7, 12)),
            start + phrase - swell_len,
            swell_len,
            54 + 3 * tier,
            bpm,
        )
        # A short reverse-sounding tick at the top of the phrase.
        add_note(sweep, A2, start, beat_seconds(bpm) * 1.5, 40, bpm)

    midi.instruments += [drone, sweep]
    return midi


def main() -> None:
    for bpm in ARCADE_BPM_TIERS:
        print(save_stem(build(bpm), PACK, bpm, INDEX, NAME))


if __name__ == "__main__":
    main()
