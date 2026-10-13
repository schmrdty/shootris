"""Shared musical plumbing for every Shootris stem generator.

Bar maths, the pitch-class tables both packs are allowed to draw from, the
chord-per-bar harmony each pack loops over, drum note numbers, the voice
vocabulary the renderer maps to synth patches, the state/stem mixing matrix,
and a seeded RNG so a regenerated stem is byte-identical to the shipped one.
"""

from __future__ import annotations

import hashlib
import os
import random

from pm_compat import (  # re-exported so generators import MIDI from one place
    ControlChange,
    Instrument,
    Note,
    PrettyMIDI,
    TimeSignature,
    USING_REAL_PRETTY_MIDI,
    instrument_name_to_program,
    note_name_to_number,
    note_number_to_name,
)

# --- geometry ---------------------------------------------------------------

SAMPLE_RATE = 48_000        # Opus' native rate, so nothing resamples on encode
BARS_PER_LOOP = 16
BEATS_PER_BAR = 4
TIME_SIGNATURE = (4, 4)
TICKS_PER_BEAT = 480

ARCADE_BPM_TIERS = (95, 105, 115, 125, 135, 145)
ZEN_BPM = 84

AUDIO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIDI_DIR = os.path.join(AUDIO_ROOT, "midi")
WAV_DIR = os.path.join(AUDIO_ROOT, "wav")
METADATA_DIR = os.path.join(AUDIO_ROOT, "metadata")
REPO_ROOT = os.path.dirname(os.path.dirname(AUDIO_ROOT))
PUBLIC_MUSIC_DIR = os.path.join(REPO_ROOT, "public", "music")


def beat_seconds(bpm: float) -> float:
    return 60.0 / bpm


def bar_seconds(bpm: float) -> float:
    return BEATS_PER_BAR * beat_seconds(bpm)


def loop_seconds(bpm: float) -> float:
    """Exact musical length of the 16-bar loop."""
    return BARS_PER_LOOP * bar_seconds(bpm)


def loop_samples(bpm: float, sample_rate: int = SAMPLE_RATE) -> int:
    """Rendered length in whole samples.

    Rounding to a sample puts loopEnd exactly on a sample boundary, which is
    what keeps eight independently decoded stems phase-locked; the sub-sample
    tempo error it introduces is under 0.0000003% of the loop.
    """
    return int(round(sample_rate * loop_seconds(bpm)))


def quantized_loop_seconds(bpm: float, sample_rate: int = SAMPLE_RATE) -> float:
    return loop_samples(bpm, sample_rate) / sample_rate


def beats(bar: int, beat: float, bpm: float) -> float:
    """Seconds at `beat` (0-based, may be fractional) of 1-based `bar`."""
    return (bar - 1) * bar_seconds(bpm) + beat * beat_seconds(bpm)


# --- pitch material ---------------------------------------------------------

PITCH_CLASSES = {
    "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5,
    "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11,
}

SCALES = {
    "a_natural_minor": {
        "display_name": "A natural minor",
        "pitch_classes": [9, 11, 0, 2, 4, 5, 7],      # A B C D E F G
    },
    "a_minor_pentatonic": {
        "display_name": "A minor pentatonic",
        "pitch_classes": [9, 0, 2, 4, 7],              # A C D E G
    },
    "a_hirajoshi": {
        "display_name": "A hirajoshi-inspired",
        "pitch_classes": [9, 11, 0, 4, 5],             # A B C E F
    },
}

# Degrees in ascending order from A, as MIDI offsets, for scale-walking.
SCALE_STEPS = {
    "a_natural_minor": [0, 2, 3, 5, 7, 8, 10],
    "a_minor_pentatonic": [0, 3, 5, 7, 10],
    "a_hirajoshi": [0, 2, 3, 7, 8],
}

A_ROOT = note_name_to_number("A1")  # 33 — the bass anchor for both packs

CHORDS = {
    "Am":    ("A", [0, 3, 7]),
    "Am7":   ("A", [0, 3, 7, 10]),
    "Am9":   ("A", [0, 3, 7, 10, 14]),
    "Dm7":   ("D", [0, 3, 7, 10]),
    "Dm9":   ("D", [0, 3, 7, 10, 14]),
    "Em":    ("E", [0, 3, 7]),
    "Em7":   ("E", [0, 3, 7, 10]),
    "E":     ("E", [0, 4, 7]),
    "F":     ("F", [0, 4, 7]),
    "Fmaj7": ("F", [0, 4, 7, 11]),
    "C":     ("C", [0, 4, 7]),
    "Cmaj7": ("C", [0, 4, 7, 11]),
    "G":     ("G", [0, 4, 7]),
    "G6":    ("G", [0, 4, 7, 9]),
}

# One chord per bar. Arcade walks the spec's three progressions so a single
# loop has harmonic movement and every tier shares the same harmony, which is
# what lets one tier crossfade into another without a key clash.
ARCADE_HARMONY = (
    "Am", "F", "C", "G",        # Am F C G
    "Am", "G", "F", "E",        # Am G F E
    "Am", "C", "G", "Em",       # Am C G Em
    "Am", "F", "C", "G",        # Am F C G
)

# Zen sits on each chord for two bars: slower harmonic motion reads as calm.
ZEN_HARMONY = (
    "Am7", "Am7", "Dm7", "Dm7",
    "Fmaj7", "Fmaj7", "Em7", "Em7",
    "Am7", "Am7", "Dm9", "Dm9",
    "Cmaj7", "Cmaj7", "Em7", "Em7",
)


def chord_pitch_classes(symbol: str) -> set[int]:
    root, intervals = CHORDS[symbol]
    base = PITCH_CLASSES[root]
    return {(base + i) % 12 for i in intervals}


def chord_root(symbol: str, octave: int = 1) -> int:
    """MIDI number of the chord root in the given octave (A1 == 33)."""
    root, _ = CHORDS[symbol]
    return PITCH_CLASSES[root] + 12 * (octave + 1)


def chord_voicing(symbol: str, low: int, high: int, size: int = 4, inversion: int = 0) -> list[int]:
    """`size` chord tones stacked upward from the lowest root at or above `low`.

    Deterministic, so a chord always voices the same way. `inversion` rotates
    the interval stack, which is how the recovery stems get their major-colour
    inversions without leaving the chord.
    """
    root_name, intervals = CHORDS[symbol]
    if inversion:
        inversion %= len(intervals)
        intervals = intervals[inversion:] + [i + 12 for i in intervals[:inversion]]
    root = PITCH_CLASSES[root_name]
    while root < low:
        root += 12
    while root - 12 >= low:
        root -= 12
    pitches: list[int] = []
    step = 0
    while len(pitches) < size:
        interval = intervals[step % len(intervals)]
        pitch = root + interval + 12 * (step // len(intervals))
        if pitch > high:
            break
        pitches.append(pitch)
        step += 1
        if step > 32:
            break
    return pitches


def scale_walk(scale: str, degree: int, base: int = A_ROOT) -> int:
    """MIDI pitch `degree` steps up (or down, if negative) a scale from `base`."""
    steps = SCALE_STEPS[scale]
    size = len(steps)
    octave, index = divmod(degree, size)
    return base + steps[index] + 12 * octave


def scale_step_toward(pitch: int, target: int, scale: str) -> int:
    """One step of `scale` from `pitch` in the direction of `target`.

    Used for approach notes: stepping by a fixed two semitones would leave the
    key whenever the interval happens to be a semitone (F down to E, A down to
    G), so the step is taken through the scale instead.
    """
    allowed = set(SCALES[scale]["pitch_classes"])
    direction = 1 if target >= pitch else -1
    candidate = pitch + direction
    while candidate % 12 not in allowed:
        candidate += direction
    return candidate


def in_scale(pitch: int, scale: str) -> bool:
    return pitch % 12 in set(SCALES[scale]["pitch_classes"])


# --- drums ------------------------------------------------------------------

KICK = 36
SIDE_STICK = 37
SNARE = 38
CLAP = 39
E_SNARE = 40
LOW_TOM = 45
CLOSED_HAT = 42
PEDAL_HAT = 44
OPEN_HAT = 46
MID_TOM = 47
HI_TOM = 50
CRASH = 49
RIDE = 51
SPLASH = 55
TAMBOURINE = 54
COWBELL = 56
VIBRASLAP = 58
CABASA = 69
MARACAS = 70
SHAKER = 82
WOODBLOCK = 76


# --- renderer voice vocabulary ---------------------------------------------
# Instrument.name carries one of these ids. FluidSynth ignores it and plays the
# GM program; the builtin numpy synth uses it to pick a patch.

VOICE_SUB_BASS = "sub_bass"
VOICE_SYNTH_BASS = "synth_bass"
VOICE_TAPE_BASS = "tape_bass"
VOICE_FINGER_BASS = "finger_bass"
VOICE_SAW_PAD = "saw_pad"
VOICE_WARM_PAD = "warm_pad"
VOICE_RHODES = "rhodes"
VOICE_PLUCK_SYNTH = "pluck_synth"
VOICE_ARP_SYNTH = "arp_synth"
VOICE_KOTO = "koto"
VOICE_PIPA = "pipa"
VOICE_GUZHENG = "guzheng"
VOICE_LEAD_SYNTH = "lead_synth"
VOICE_BELL = "bell"
VOICE_WIND_BELL = "wind_bell"
VOICE_DARK_PULSE = "dark_pulse"
VOICE_DRONE = "drone"
VOICE_NOISE_SWEEP = "noise_sweep"
VOICE_VINYL = "vinyl"
VOICE_TAPE_HISS = "tape_hiss"
VOICE_EDM_KIT = "edm_kit"
VOICE_BOOMBAP_KIT = "boombap_kit"
VOICE_FAST_HAT = "fast_hat"
VOICE_SPARSE_PERC = "sparse_perc"


# What each voice plays as when the renderer is FluidSynth (which knows nothing
# about our voice ids) — the builtin synth uses the id instead.
VOICE_PROGRAMS = {
    VOICE_SUB_BASS: "Synth Bass 1",
    VOICE_SYNTH_BASS: "Synth Bass 2",
    VOICE_TAPE_BASS: "Electric Bass (finger)",
    VOICE_FINGER_BASS: "Electric Bass (finger)",
    VOICE_SAW_PAD: "Pad 3 (polysynth)",
    VOICE_WARM_PAD: "Pad 2 (warm)",
    VOICE_RHODES: "Electric Piano 1",
    VOICE_PLUCK_SYNTH: "Lead 4 (chiff)",
    VOICE_ARP_SYNTH: "Lead 1 (square)",
    VOICE_KOTO: "Koto",
    VOICE_PIPA: "Shamisen",
    VOICE_GUZHENG: "Koto",
    VOICE_LEAD_SYNTH: "Lead 2 (sawtooth)",
    VOICE_BELL: "Tubular Bells",
    VOICE_WIND_BELL: "Tinkle Bell",
    VOICE_DARK_PULSE: "Lead 7 (fifths)",
    VOICE_DRONE: "Pad 5 (bowed)",
    VOICE_NOISE_SWEEP: "FX 4 (atmosphere)",
    VOICE_VINYL: "FX 1 (rain)",
    VOICE_TAPE_HISS: "Pad 7 (halo)",
}

DRUM_VOICES = (VOICE_EDM_KIT, VOICE_BOOMBAP_KIT, VOICE_FAST_HAT, VOICE_SPARSE_PERC)


def voice_instrument(voice: str) -> Instrument:
    """A named Instrument wired for both renderers: the voice id in `name`,
    its General MIDI equivalent in `program`."""
    if voice in DRUM_VOICES:
        return Instrument(program=0, is_drum=True, name=voice)
    return Instrument(program=instrument_name_to_program(VOICE_PROGRAMS[voice]), is_drum=False, name=voice)


# --- stems, states, mix ----------------------------------------------------

STEMS = (
    (1, "BASS"),
    (2, "DRUMS"),
    (3, "ROOM"),
    (4, "MOTION"),
    (5, "CHORDS"),
    (6, "THEME"),
    (7, "DANGER"),
    (8, "RECOVERY"),
)

STATES = ("danger", "recovery", "intense", "focus", "flow", "calm")

# Target gain per state per stem, straight from the spec's mixing matrix.
MIX_MATRIX = {
    #            BASS DRUMS ROOM MOTION CHORDS THEME DANGER RECOVERY
    "calm":     (1.0, 0.8, 1.0, 0.2, 0.7, 0.0, 0.0, 0.0),
    "flow":     (1.0, 1.0, 1.0, 0.5, 0.8, 0.2, 0.0, 0.0),
    "focus":    (1.0, 1.0, 1.0, 0.7, 1.0, 0.5, 0.0, 0.0),
    "intense":  (1.0, 1.0, 1.0, 0.9, 1.0, 0.6, 0.3, 0.0),
    "danger":   (1.0, 0.6, 1.0, 0.0, 0.3, 0.0, 1.0, 0.0),
    "recovery": (1.0, 0.8, 1.0, 0.3, 0.8, 0.1, 0.0, 1.0),
}


def stem_id(index: int) -> str:
    return f"STEM_{index:02d}"


def stem_filename(index: int, name: str, ext: str) -> str:
    return f"{stem_id(index)}_{name}.{ext}"


def mix_row(stem_index: int) -> dict[str, float]:
    """Every state's target gain for one stem."""
    return {state: MIX_MATRIX[state][stem_index - 1] for state in MIX_MATRIX}


def always_active(stem_index: int) -> bool:
    return all(gain > 0 for gain in mix_row(stem_index).values())


def audible_in_calm(stem_index: int) -> bool:
    return MIX_MATRIX["calm"][stem_index - 1] > 0


# --- determinism ------------------------------------------------------------

def rng_for(pack: str, stem: str, bpm: float) -> random.Random:
    """A generator seeded only by what it is making, so output never drifts."""
    digest = hashlib.sha256(f"shootris/{pack}/{stem}/{int(bpm)}".encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def humanize(rng: random.Random, amount_seconds: float) -> float:
    """A small symmetric timing nudge — never enough to cross a beat."""
    return rng.uniform(-amount_seconds, amount_seconds)


# --- building a stem --------------------------------------------------------

def new_midi(bpm: float) -> PrettyMIDI:
    midi = PrettyMIDI(resolution=TICKS_PER_BEAT, initial_tempo=float(bpm))
    midi.time_signature_changes.append(TimeSignature(*TIME_SIGNATURE, 0.0))
    return midi


def add_note(
    instrument: Instrument,
    pitch: int,
    start: float,
    duration: float,
    velocity: int,
    bpm: float,
    *,
    min_duration: float = 0.02,
) -> Note | None:
    """Append a note, trimmed so nothing starts before bar 1 or ends past bar 16.

    Validation test 2 forbids tails that cross the loop point: the note data
    stops at the seam, and the renderer wraps the voice's release tail around
    to the top of the loop instead, which is what keeps the loop seamless
    without any note straddling it.
    """
    end_of_loop = loop_seconds(bpm)
    if start >= end_of_loop:
        return None
    if start < 0:
        # A humanised downbeat can be nudged just past the top of the loop.
        # Snap it back to the bar line rather than dropping the note, which is
        # how the Mitty theme once lost its first note entirely.
        if start < -0.05:
            return None
        start = 0.0
    end = min(start + duration, end_of_loop)
    if end - start < min_duration:
        return None
    note = Note(velocity=max(1, min(127, int(round(velocity)))), pitch=int(pitch), start=start, end=end)
    instrument.notes.append(note)
    return note


def save_stem(midi: PrettyMIDI, pack: str, bpm: float, index: int, name: str) -> str:
    out_dir = os.path.join(MIDI_DIR, pack, str(int(bpm)))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, stem_filename(index, name, "mid"))
    for instrument in midi.instruments:
        instrument.notes.sort(key=lambda n: (n.start, n.pitch))
    midi.write(path)
    return path


import types as _types

__all__ = [
    _name
    for _name, _value in list(globals().items())
    if not _name.startswith("_") and not isinstance(_value, _types.ModuleType)
]
