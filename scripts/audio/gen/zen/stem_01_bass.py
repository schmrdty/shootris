"""Zen (Midnight Tea House) STEM_01 BASS — warm sub, tape bass, finger bass.

Always active, and the pack's anchor: every root sits between 55 Hz and
110 Hz, which is the 50-150 Hz focus the pack asks for. The line stays on each
chord for two bars and walks into the next one, with the whole part nudged off
the grid so it reads as played rather than programmed.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import *  # noqa: F403

PACK = "zen"
INDEX = 1
NAME = "BASS"
BPM = ZEN_BPM

LOW, HIGH = 33, 45  # A1..A2 — 55 Hz to 110 Hz
HUMANIZE = 0.018


def _root(symbol: str, previous: int) -> int:
    candidates = [chord_root(symbol, octave) for octave in (1, 2, 3)]
    candidates = [p for p in candidates if LOW <= p <= HIGH]
    return min(candidates, key=lambda p: (abs(p - previous), p))


def build(bpm: float = BPM) -> PrettyMIDI:
    rng = rng_for(PACK, NAME, bpm)
    midi = new_midi(bpm)

    body = voice_instrument(VOICE_TAPE_BASS)
    sub = voice_instrument(VOICE_SUB_BASS)

    beat = beat_seconds(bpm)
    previous = 33
    for bar in range(1, BARS_PER_LOOP + 1):
        symbol = ZEN_HARMONY[bar - 1]
        root = _root(symbol, previous)
        previous = root
        first_of_pair = (bar - 1) % 2 == 0

        if first_of_pair:
            # Statement: root held, then a short answer and the fifth.
            figure = ((0.0, root, 1.6, 104), (2.5, root, 0.7, 88), (3.0, root + 7, 0.9, 94))
            # The sub layers the same root rather than dropping an octave:
            # below A1 the fundamental leaves the 50-150 Hz band the pack
            # anchors on, and two timbres on one note is what gives the warmth.
            add_note(sub, root, beats(bar, 0, bpm), beat * 3.6, 84, bpm)
        else:
            next_symbol = ZEN_HARMONY[bar % BARS_PER_LOOP]
            target = _root(next_symbol, root)
            # Walk in: one scale step toward the next root.
            approach = scale_step_toward(root, target, "a_natural_minor")
            # Pop up an octave where that stays under 130 Hz, otherwise take
            # the fifth: the line lifts without leaving the pack's register.
            lift = root + 12 if root + 12 <= 48 else root + 7
            figure = (
                (0.0, root, 1.4, 100),
                (2.0, lift, 0.8, 82),
                (3.5, approach, 0.45, 90),
            )

        for offset, pitch, length, velocity in figure:
            add_note(
                body,
                pitch,
                max(0.0, beats(bar, offset, bpm) + humanize(rng, HUMANIZE)),
                length * beat,
                velocity + rng.randrange(-4, 5),
                bpm,
            )

    midi.instruments += [sub, body]
    return midi


def main() -> None:
    print(save_stem(build(BPM), PACK, BPM, INDEX, NAME))


if __name__ == "__main__":
    main()
