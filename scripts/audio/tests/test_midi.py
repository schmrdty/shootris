"""Validation tests 1-6: the MIDI must be loop-correct and in key before
anything is rendered.

    python3 scripts/audio/tests/test_midi.py
"""

from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "gen"))
sys.path.insert(0, HERE)

from common import (  # noqa: E402
    ARCADE_BPM_TIERS,
    BARS_PER_LOOP,
    BEATS_PER_BAR,
    METADATA_DIR,
    MIDI_DIR,
    PrettyMIDI,
    SAMPLE_RATE,
    STEMS,
    ZEN_BPM,
    bar_seconds,
    beat_seconds,
    chord_pitch_classes,
    loop_samples,
    loop_seconds,
    note_number_to_name,
    stem_filename,
)
from harness import check, main, near, test  # noqa: E402

PACKS = ("arcade", "zen")

# A humanised hit may land a few milliseconds before its bar line on purpose.
# Notes inside this window snap forward to the bar they were written for.
BAR_SNAP = 0.025
# Loop-end tolerance: one MIDI tick at the slowest tempo we ship.
TICK_TOLERANCE = (60.0 / ZEN_BPM) / 480 * 1.5
# Phrase spacing, in bars: generous against tick rounding, far under one bar.
BAR_EPSILON = 0.01


def _meta(pack: str) -> dict:
    with open(os.path.join(METADATA_DIR, f"{pack}.json")) as handle:
        return json.load(handle)


METADATA = {pack: _meta(pack) for pack in PACKS}


def _stem_path(pack: str, bpm: int, index: int, name: str) -> str:
    return os.path.join(MIDI_DIR, pack, str(bpm), stem_filename(index, name, "mid"))


def _sets() -> list[tuple[str, int]]:
    return [(pack, bpm) for pack in PACKS for bpm in METADATA[pack]["bpm_tiers"]]


_CACHE: dict[str, PrettyMIDI] = {}


def _load(path: str) -> PrettyMIDI:
    if path not in _CACHE:
        _CACHE[path] = PrettyMIDI(path)
    return _CACHE[path]


def _bar_of(start: float, bpm: float) -> int:
    """1-based bar a note was struck in, snapping a slightly early hit forward."""
    bar = int((start + BAR_SNAP) // bar_seconds(bpm)) + 1
    return min(max(bar, 1), BARS_PER_LOOP)


def _phrases(notes: list, bpm: float, gap_beats: float) -> list[list]:
    """Split one instrument's notes into phrases separated by a rest."""
    gap = gap_beats * beat_seconds(bpm)
    grouped: list[list] = []
    previous_end = None
    for note in sorted(notes, key=lambda n: n.start):
        if previous_end is None or note.start - previous_end < gap:
            if not grouped:
                grouped.append([])
            grouped[-1].append(note)
        else:
            grouped.append([note])
        previous_end = max(previous_end or 0.0, note.end)
    return grouped


# --- 1 -----------------------------------------------------------------------

@test("1. every stem in a set is one 16-bar loop of identical length")
def test_loop_length() -> str:
    for pack, bpm in _sets():
        expected_samples = METADATA[pack]["loops"][str(bpm)]["loop_samples"]
        check(
            expected_samples == loop_samples(bpm),
            f"{pack}/{bpm}: metadata loop_samples {expected_samples} != computed {loop_samples(bpm)}",
        )
        lengths = set()
        for index, name in STEMS:
            path = _stem_path(pack, bpm, index, name)
            check(os.path.exists(path), f"missing {path}")
            midi = _load(path)
            _times, tempi = midi.get_tempo_changes()
            check(len(tempi) == 1, f"{pack}/{bpm}/{name}: expected a single tempo, got {tempi}")
            near(tempi[0], bpm, 0.01, f"{pack}/{bpm}/{name}: tempo")
            signatures = midi.time_signature_changes
            check(
                len(signatures) == 1
                and (signatures[0].numerator, signatures[0].denominator) == (BEATS_PER_BAR, 4),
                f"{pack}/{bpm}/{name}: expected one 4/4 time signature, got {signatures}",
            )
            # The loop length a player of this file would use, from the file's
            # own tempo: identical for all eight stems by construction.
            lengths.add(round(BARS_PER_LOOP * BEATS_PER_BAR * 60.0 / tempi[0], 6))
            check(
                any(inst.notes for inst in midi.instruments),
                f"{pack}/{bpm}/{name}: stem has no notes",
            )
        check(
            len(lengths) == 1,
            f"{pack}/{bpm}: stems disagree on loop length: {sorted(lengths)}",
        )
        near(
            lengths.pop(),
            expected_samples / SAMPLE_RATE,
            TICK_TOLERANCE,
            f"{pack}/{bpm}: 16-bar length vs metadata",
        )
    return f"{len(_sets())} sets"


# --- 2 -----------------------------------------------------------------------

@test("2. no note starts before bar 1 or ends after bar 16")
def test_inside_loop() -> str:
    counted = 0
    for pack, bpm in _sets():
        end_of_loop = loop_seconds(bpm)
        for index, name in STEMS:
            midi = _load(_stem_path(pack, bpm, index, name))
            for inst in midi.instruments:
                for note in inst.notes:
                    check(
                        note.start >= -1e-9,
                        f"{pack}/{bpm}/{name}: note starts before bar 1 at {note.start:.4f}",
                    )
                    check(
                        note.end <= end_of_loop + TICK_TOLERANCE,
                        f"{pack}/{bpm}/{name}: {note} ends past bar 16 ({end_of_loop:.4f})",
                    )
                    check(note.end > note.start, f"{pack}/{bpm}/{name}: {note} has no length")
                    counted += 1
    return f"{counted} notes"


# --- 3 -----------------------------------------------------------------------

@test("3. every pitched note is in an allowed scale, or in the bar's chord")
def test_in_key() -> str:
    checked = 0
    for pack, bpm in _sets():
        meta = METADATA[pack]
        harmony = meta["harmony"]
        scales = meta["scales"]
        for stem in meta["stems"]:
            midi = _load(_stem_path(pack, bpm, stem["index"], stem["name"]))
            pitched = [inst for inst in midi.instruments if not inst.is_drum]

            if stem.get("follows_harmony"):
                for inst in pitched:
                    for note in inst.notes:
                        bar = _bar_of(note.start, bpm)
                        allowed = chord_pitch_classes(harmony[bar - 1])
                        check(
                            note.pitch % 12 in allowed,
                            f"{pack}/{bpm}/{stem['name']}: {note_number_to_name(note.pitch)} "
                            f"at bar {bar} is not in {harmony[bar - 1]}",
                        )
                        checked += 1
                continue

            names = stem.get("scales") or []
            if not names:
                check(
                    not pitched,
                    f"{pack}/{bpm}/{stem['name']}: pitched notes but no declared scale",
                )
                continue

            allowed_sets = [set(scales[n]["pitch_classes"]) for n in names]
            if len(allowed_sets) == 1:
                for inst in pitched:
                    for note in inst.notes:
                        check(
                            note.pitch % 12 in allowed_sets[0],
                            f"{pack}/{bpm}/{stem['name']}: {note_number_to_name(note.pitch)} "
                            f"is not in {names[0]}",
                        )
                        checked += 1
            else:
                # Several declared scales: each phrase must sit wholly inside
                # one of them, so a phrase cannot smuggle in a foreign note by
                # borrowing from the other scale.
                gap = (stem.get("phrase_rules") or {}).get("phrase_gap_beats", 2.0)
                for inst in pitched:
                    for phrase in _phrases(inst.notes, bpm, gap):
                        classes = {note.pitch % 12 for note in phrase}
                        check(
                            any(classes <= allowed for allowed in allowed_sets),
                            f"{pack}/{bpm}/{stem['name']}: phrase at "
                            f"{phrase[0].start:.3f}s fits none of {names} "
                            f"(classes {sorted(classes)})",
                        )
                        checked += len(phrase)
    return f"{checked} pitched notes"


# --- 4 -----------------------------------------------------------------------

@test("4. declared phrase rules hold (zen THEME: 5 notes max, one per 8 bars)")
def test_phrase_rules() -> str:
    checked = 0
    for pack, bpm in _sets():
        for stem in METADATA[pack]["stems"]:
            rules = stem.get("phrase_rules")
            if not rules:
                continue
            midi = _load(_stem_path(pack, bpm, stem["index"], stem["name"]))
            gap = rules.get("phrase_gap_beats", 2.0)
            limit = rules.get("max_phrase_notes")
            spacing = rules.get("min_bars_between_phrases")
            for inst in midi.instruments:
                if inst.is_drum:
                    continue
                phrases = _phrases(inst.notes, bpm, gap)
                for phrase in phrases:
                    if limit is not None:
                        check(
                            len(phrase) <= limit,
                            f"{pack}/{bpm}/{stem['name']}/{inst.name}: phrase at "
                            f"{phrase[0].start:.3f}s has {len(phrase)} notes, limit {limit}",
                        )
                    checked += 1
                if spacing is not None:
                    bars = bar_seconds(bpm)
                    for earlier, later in zip(phrases, phrases[1:]):
                        distance = (later[0].start - earlier[0].start) / bars
                        # A MIDI tempo is whole microseconds per beat, so an
                        # exactly-n-bar gap reads back a few microseconds
                        # short. Real violations are a bar or more out.
                        check(
                            distance >= spacing - BAR_EPSILON,
                            f"{pack}/{bpm}/{stem['name']}/{inst.name}: phrases "
                            f"{distance:.2f} bars apart, minimum {spacing}",
                        )
    return f"{checked} phrases"


# --- 5 -----------------------------------------------------------------------

@test("5. zen is 84 BPM in every file")
def test_zen_tempo() -> str:
    for index, name in STEMS:
        midi = _load(_stem_path("zen", ZEN_BPM, index, name))
        _times, tempi = midi.get_tempo_changes()
        check(len(tempi) == 1, f"zen/{name}: expected one tempo, got {tempi}")
        # A MIDI tempo is stored in whole microseconds per beat, so 84 BPM
        # round-trips as 83.99997; anything further out is a real mistake.
        near(tempi[0], float(ZEN_BPM), 0.001, f"zen/{name}: tempo")
    return "8 stems at 84 BPM"


# --- 6 -----------------------------------------------------------------------

@test("6. arcade has a full stem set for each of the six BPM tiers")
def test_arcade_tiers() -> str:
    check(
        tuple(METADATA["arcade"]["bpm_tiers"]) == ARCADE_BPM_TIERS,
        f"metadata tiers {METADATA['arcade']['bpm_tiers']} != {list(ARCADE_BPM_TIERS)}",
    )
    for bpm in ARCADE_BPM_TIERS:
        for index, name in STEMS:
            path = _stem_path("arcade", bpm, index, name)
            check(os.path.exists(path), f"missing {path}")
            check(os.path.getsize(path) > 0, f"empty {path}")
    return f"{len(ARCADE_BPM_TIERS)} tiers x 8 stems"


# --- metadata sanity --------------------------------------------------------

@test("metadata validates against scripts/audio/metadata/schema.json")
def test_schema() -> str:
    try:
        import jsonschema
    except ImportError:
        return "skipped — jsonschema not installed"
    with open(os.path.join(METADATA_DIR, "schema.json")) as handle:
        schema = json.load(handle)
    for pack in PACKS:
        jsonschema.validate(METADATA[pack], schema)
    return f"{len(PACKS)} packs"


if __name__ == "__main__":
    main("MIDI validation (spec tests 1-6)")
