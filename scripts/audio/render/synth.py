"""A small numpy synthesizer, used when FluidSynth and a SoundFont are absent.

Three choices shape everything here:

* Pitched voices are additive. Every partial is placed below Nyquist with a
  Butterworth-shaped tilt standing in for a filter, so the output is
  alias-free and needs no per-note filtering pass.
* Noise voices (drums, vinyl, sweeps) are shaped in the frequency domain: one
  real FFT per cached hit is cheaper than a biquad recurrence in Python and
  gives an exact Butterworth magnitude.
* Everything is written into a fixed-length circular buffer and convolved
  circularly with the room impulse. A tail that runs past bar 16 therefore
  reappears at bar 1, which is what makes the loop seamless while the MIDI
  itself keeps every note inside the loop.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

TWO_PI = 2.0 * math.pi
MAX_PARTIALS = 28


# --- primitives -------------------------------------------------------------

def midi_to_hz(pitch: float) -> float:
    return 440.0 * (2.0 ** ((pitch - 69) / 12.0))


def butterworth(freqs: np.ndarray, cutoff: float, order: float = 2.0, highpass: bool = False) -> np.ndarray:
    """Magnitude response of an order-`order` Butterworth, as a weight curve."""
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where(freqs > 0, freqs / max(cutoff, 1e-6), 0.0)
        if highpass:
            ratio = np.where(freqs > 0, max(cutoff, 1e-6) / np.maximum(freqs, 1e-6), np.inf)
    return 1.0 / np.sqrt(1.0 + np.power(ratio, 2.0 * order))


def shaped_noise(
    n: int,
    sample_rate: int,
    rng: np.random.Generator,
    *,
    lowpass: float | None = None,
    highpass: float | None = None,
    order: float = 2.0,
    tilt: float = 0.0,
) -> np.ndarray:
    """White noise filtered in the frequency domain. `tilt` of 1 gives pink."""
    if n <= 1:
        return np.zeros(max(n, 0))
    spectrum = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    weight = np.ones_like(freqs)
    if lowpass:
        weight *= butterworth(freqs, lowpass, order)
    if highpass:
        weight *= butterworth(freqs, highpass, order, highpass=True)
    if tilt:
        weight *= 1.0 / np.maximum(freqs, 20.0) ** (tilt * 0.5)
    shaped = np.fft.irfft(spectrum * weight, n)
    peak = np.max(np.abs(shaped))
    return shaped / peak if peak > 0 else shaped


def env_ad(n: int, sample_rate: int, attack: float, decay: float, curve: float = 2.5) -> np.ndarray:
    """Percussive attack-decay envelope; `decay` is the time to near silence."""
    if n <= 0:
        return np.zeros(0)
    t = np.arange(n, dtype=np.float64) / sample_rate
    attack = max(attack, 1.0 / sample_rate)
    rise = np.clip(t / attack, 0.0, 1.0)
    fall = np.exp(-curve * np.maximum(t - attack, 0.0) / max(decay, 1e-4))
    return rise * fall


def env_adsr(
    n: int,
    sample_rate: int,
    attack: float,
    decay: float,
    sustain: float,
    release: float,
    hold: float,
) -> np.ndarray:
    """Attack/decay/sustain over `hold` seconds, then a release tail."""
    if n <= 0:
        return np.zeros(0)
    t = np.arange(n, dtype=np.float64) / sample_rate
    attack = max(attack, 1.0 / sample_rate)
    out = np.zeros(n)

    rising = t < attack
    out[rising] = t[rising] / attack

    decaying = (t >= attack) & (t < attack + decay)
    if decay > 0:
        progress = (t[decaying] - attack) / decay
        out[decaying] = 1.0 + (sustain - 1.0) * progress
    else:
        out[decaying] = sustain

    holding = (t >= attack + decay) & (t < hold)
    out[holding] = sustain

    releasing = t >= hold
    if release > 0:
        out[releasing] = sustain * np.exp(-3.0 * (t[releasing] - hold) / release)
    return out


# --- voice description ------------------------------------------------------

@dataclass(frozen=True)
class Partial:
    ratio: float
    amplitude: float
    decay: float = 1.0        # relative decay rate; >1 decays faster
    detune_cents: float = 0.0


@dataclass(frozen=True)
class Voice:
    """One synth patch. `kind` picks the rendering routine."""

    kind: str = "additive"
    partials: tuple[Partial, ...] = ()
    cutoff: float = 6000.0
    cutoff_order: float = 2.0
    attack: float = 0.004
    decay: float = 0.08
    sustain: float = 0.8
    release: float = 0.25
    tail: float = 0.6             # extra seconds rendered past note-off
    drive: float = 0.0            # tanh saturation amount
    gain: float = 1.0
    pan: float = 0.0              # -1 left, +1 right
    wet: float = 0.18             # how much of the room impulse it gets
    vibrato_hz: float = 0.0
    vibrato_cents: float = 0.0
    tremolo_hz: float = 0.0
    tremolo_depth: float = 0.0
    pluck_decay: float = 1.2      # seconds for the first partial of a pluck
    pluck_brightness: float = 1.3  # higher partials decay this much faster
    noise_lowpass: float = 8000.0
    noise_highpass: float = 0.0
    noise_density: float = 1.0
    sub_amount: float = 0.0


def _harmonic_series(count: int, tilt: float, odd_only: bool = False) -> tuple[Partial, ...]:
    partials = []
    for k in range(1, count + 1):
        if odd_only and k % 2 == 0:
            continue
        partials.append(Partial(ratio=float(k), amplitude=1.0 / (k ** tilt)))
    return tuple(partials)


SAW = _harmonic_series(MAX_PARTIALS, 1.0)
SQUARE = _harmonic_series(MAX_PARTIALS, 1.0, odd_only=True)
TRIANGLE = _harmonic_series(MAX_PARTIALS, 2.0, odd_only=True)
SINE = (Partial(1.0, 1.0),)

# Inharmonic partials, roughly a struck bar: what makes a bell a bell.
BELL_PARTIALS = (
    Partial(1.0, 1.0, decay=0.7),
    Partial(2.76, 0.55, decay=1.1),
    Partial(5.40, 0.32, decay=1.7),
    Partial(8.93, 0.18, decay=2.4),
    Partial(13.34, 0.09, decay=3.2),
)


def _detuned(base: tuple[Partial, ...], voices: int, spread_cents: float) -> tuple[Partial, ...]:
    """Stack `voices` copies of a waveform, detuned symmetrically."""
    out: list[Partial] = []
    offsets = np.linspace(-spread_cents, spread_cents, voices) if voices > 1 else [0.0]
    for offset in offsets:
        for partial in base:
            out.append(
                Partial(
                    ratio=partial.ratio,
                    amplitude=partial.amplitude / math.sqrt(voices),
                    decay=partial.decay,
                    detune_cents=float(offset),
                )
            )
    return tuple(out)


VOICES: dict[str, Voice] = {
    # --- bass ---
    "sub_bass": Voice(
        partials=(Partial(1.0, 1.0), Partial(2.0, 0.22), Partial(3.0, 0.06)),
        cutoff=150.0, cutoff_order=1.5, attack=0.008, decay=0.12, sustain=0.85,
        release=0.22, tail=0.4, drive=0.25, gain=1.0, wet=0.04,
    ),
    "synth_bass": Voice(
        partials=_detuned(SAW, 2, 7.0) + (Partial(0.5, 0.45),),
        cutoff=900.0, cutoff_order=2.0, attack=0.003, decay=0.09, sustain=0.6,
        release=0.1, tail=0.3, drive=0.5, gain=0.9, wet=0.06,
    ),
    "tape_bass": Voice(
        partials=(Partial(1.0, 1.0), Partial(2.0, 0.3), Partial(3.0, 0.12), Partial(4.0, 0.05)),
        cutoff=420.0, cutoff_order=1.8, attack=0.012, decay=0.18, sustain=0.72,
        release=0.3, tail=0.6, drive=0.3, gain=0.95, wet=0.08,
    ),
    "finger_bass": Voice(
        partials=(Partial(1.0, 1.0), Partial(2.0, 0.34), Partial(3.0, 0.16), Partial(5.0, 0.05)),
        cutoff=600.0, attack=0.01, decay=0.2, sustain=0.65, release=0.26, tail=0.5,
        drive=0.22, wet=0.08,
    ),

    # --- pads and keys ---
    "saw_pad": Voice(
        partials=_detuned(SAW, 5, 14.0),
        cutoff=2400.0, attack=0.45, decay=0.5, sustain=0.78, release=1.2, tail=1.8,
        gain=0.5, wet=0.4, tremolo_hz=0.17, tremolo_depth=0.12,
    ),
    "warm_pad": Voice(
        partials=_detuned(TRIANGLE, 4, 10.0) + (Partial(1.0, 0.35), Partial(2.0, 0.12)),
        cutoff=1700.0, attack=0.7, decay=0.6, sustain=0.82, release=1.6, tail=2.4,
        gain=0.55, wet=0.45, tremolo_hz=0.11, tremolo_depth=0.1,
    ),
    "rhodes": Voice(
        kind="pluck",
        partials=(
            Partial(1.0, 1.0, decay=0.55),
            Partial(2.0, 0.42, decay=1.3),
            Partial(3.0, 0.14, decay=2.0),
            Partial(4.0, 0.3, decay=2.8),
            Partial(6.0, 0.08, decay=3.6),
        ),
        cutoff=3800.0, attack=0.004, pluck_decay=2.2, pluck_brightness=1.0,
        tail=1.6, gain=0.7, wet=0.3,
    ),

    # --- plucks and leads ---
    "pluck_synth": Voice(
        kind="pluck",
        partials=_harmonic_series(14, 1.15),
        cutoff=4200.0, attack=0.002, pluck_decay=0.55, pluck_brightness=1.6,
        tail=0.7, gain=0.6, wet=0.26,
    ),
    "arp_synth": Voice(
        partials=SQUARE[:10],
        cutoff=3200.0, attack=0.003, decay=0.05, sustain=0.5, release=0.1, tail=0.3,
        drive=0.2, gain=0.5, wet=0.22,
    ),
    "lead_synth": Voice(
        partials=_detuned(SAW, 2, 9.0),
        cutoff=3600.0, attack=0.02, decay=0.12, sustain=0.75, release=0.35, tail=0.7,
        drive=0.3, gain=0.6, wet=0.3, vibrato_hz=5.2, vibrato_cents=7.0,
    ),
    "dark_pulse": Voice(
        partials=SAW[:16] + SQUARE[:8],
        cutoff=520.0, cutoff_order=2.5, attack=0.002, decay=0.04, sustain=0.55,
        release=0.08, tail=0.25, drive=0.85, gain=0.75, wet=0.12,
    ),

    # --- plucked strings ---
    "koto": Voice(
        kind="pluck",
        partials=(
            Partial(1.0, 1.0, decay=0.8), Partial(2.0, 0.5, decay=1.2),
            Partial(3.0, 0.3, decay=1.6), Partial(4.0, 0.18, decay=2.1),
            Partial(5.0, 0.12, decay=2.6), Partial(6.0, 0.08, decay=3.1),
            Partial(8.0, 0.05, decay=3.8), Partial(11.0, 0.03, decay=4.6),
        ),
        cutoff=5200.0, attack=0.0015, pluck_decay=1.5, pluck_brightness=1.25,
        tail=1.4, gain=0.7, wet=0.34, pan=-0.12,
    ),
    "pipa": Voice(
        kind="pluck",
        partials=(
            Partial(1.0, 0.9, decay=1.0), Partial(2.0, 0.62, decay=1.3),
            Partial(3.0, 0.42, decay=1.7), Partial(4.0, 0.26, decay=2.2),
            Partial(5.0, 0.2, decay=2.7), Partial(7.0, 0.1, decay=3.4),
            Partial(9.0, 0.06, decay=4.2),
        ),
        cutoff=6200.0, attack=0.001, pluck_decay=0.95, pluck_brightness=1.5,
        tail=1.0, gain=0.62, wet=0.3, pan=0.16,
    ),
    "guzheng": Voice(
        kind="pluck",
        partials=(
            Partial(1.0, 1.0, decay=0.75), Partial(2.0, 0.46, decay=1.15),
            Partial(3.0, 0.26, decay=1.55), Partial(4.0, 0.16, decay=2.0),
            Partial(6.0, 0.08, decay=2.8), Partial(9.0, 0.04, decay=3.7),
        ),
        cutoff=5600.0, attack=0.0012, pluck_decay=1.9, pluck_brightness=1.15,
        tail=1.6, gain=0.66, wet=0.38, pan=0.1,
    ),

    # --- bells ---
    "bell": Voice(
        kind="pluck", partials=BELL_PARTIALS,
        cutoff=7000.0, attack=0.002, pluck_decay=2.6, pluck_brightness=1.0,
        tail=2.6, gain=0.55, wet=0.5,
    ),
    "wind_bell": Voice(
        kind="pluck", partials=BELL_PARTIALS,
        cutoff=9000.0, attack=0.0015, pluck_decay=1.9, pluck_brightness=1.1,
        tail=2.2, gain=0.45, wet=0.6, pan=0.22,
    ),

    # --- sustained texture ---
    "drone": Voice(
        partials=_detuned(SAW, 3, 18.0) + (Partial(0.5, 0.3),),
        cutoff=330.0, cutoff_order=2.5, attack=1.6, decay=1.0, sustain=0.85,
        release=2.2, tail=3.0, drive=0.35, gain=0.6, wet=0.5,
        tremolo_hz=0.09, tremolo_depth=0.2,
    ),
    "noise_sweep": Voice(
        kind="sweep", noise_lowpass=5200.0, noise_highpass=180.0,
        attack=0.5, release=1.0, tail=1.6, gain=0.5, wet=0.6,
    ),
    "vinyl": Voice(
        kind="crackle", noise_lowpass=9000.0, noise_highpass=900.0,
        noise_density=28.0, tail=0.1, gain=0.6, wet=0.12,
    ),
    "tape_hiss": Voice(
        kind="hiss", noise_lowpass=6500.0, noise_highpass=400.0,
        attack=1.2, release=1.4, tail=1.6, gain=0.5, wet=0.3,
    ),
}


# --- percussion -------------------------------------------------------------

@dataclass(frozen=True)
class Drum:
    kind: str                 # "membrane" | "noise" | "tone_noise" | "clap"
    frequency: float = 100.0
    sweep_to: float = 0.0     # membrane pitch sweep target
    decay: float = 0.2
    attack: float = 0.001
    lowpass: float = 9000.0
    highpass: float = 0.0
    noise_level: float = 0.0
    tone_level: float = 1.0
    drive: float = 0.2
    gain: float = 1.0
    pan: float = 0.0
    wet: float = 0.1
    click: float = 0.0


# General MIDI percussion, voiced per kit. Anything unmapped falls back to the
# kit's default so a stray note never renders silence.
EDM_KIT: dict[int, Drum] = {
    36: Drum("membrane", 125.0, 44.0, 0.34, 0.0005, 2200.0, drive=0.6, click=0.35, gain=1.0, wet=0.04),
    37: Drum("noise", 1600.0, decay=0.05, lowpass=7000.0, highpass=900.0, gain=0.5, wet=0.12),
    38: Drum("tone_noise", 205.0, decay=0.14, lowpass=7600.0, highpass=170.0,
             noise_level=0.85, tone_level=0.45, drive=0.35, gain=0.8, wet=0.16),
    39: Drum("clap", 1400.0, decay=0.13, lowpass=6200.0, highpass=700.0, gain=0.7, wet=0.22),
    40: Drum("tone_noise", 240.0, decay=0.1, lowpass=8200.0, highpass=200.0,
             noise_level=0.9, tone_level=0.3, gain=0.75, wet=0.16),
    42: Drum("noise", decay=0.045, lowpass=12000.0, highpass=6200.0, gain=0.45, wet=0.08, pan=0.1),
    44: Drum("noise", decay=0.035, lowpass=10000.0, highpass=5200.0, gain=0.35, wet=0.06, pan=0.1),
    45: Drum("membrane", 150.0, 95.0, 0.3, 0.001, 2600.0, gain=0.7, wet=0.16),
    46: Drum("noise", decay=0.3, lowpass=12500.0, highpass=5200.0, gain=0.42, wet=0.16, pan=0.14),
    47: Drum("membrane", 200.0, 130.0, 0.26, 0.001, 3000.0, gain=0.7, wet=0.16),
    49: Drum("noise", decay=1.5, lowpass=14000.0, highpass=2600.0, gain=0.4, wet=0.4, pan=-0.2),
    50: Drum("membrane", 270.0, 180.0, 0.22, 0.001, 3400.0, gain=0.68, wet=0.16),
    51: Drum("tone_noise", 520.0, decay=0.55, lowpass=13000.0, highpass=3600.0,
             noise_level=0.8, tone_level=0.2, gain=0.33, wet=0.24, pan=0.22),
    54: Drum("noise", decay=0.12, lowpass=11000.0, highpass=3200.0, gain=0.35, wet=0.18),
    55: Drum("noise", decay=0.8, lowpass=13500.0, highpass=4200.0, gain=0.34, wet=0.34),
    69: Drum("noise", decay=0.09, lowpass=11500.0, highpass=4200.0, gain=0.3, wet=0.14),
    70: Drum("noise", decay=0.07, lowpass=12000.0, highpass=5000.0, gain=0.3, wet=0.12),
    76: Drum("tone_noise", 800.0, decay=0.07, lowpass=6000.0, highpass=400.0,
             noise_level=0.4, tone_level=0.8, gain=0.45, wet=0.14),
    82: Drum("noise", decay=0.06, lowpass=13000.0, highpass=5600.0, gain=0.28, wet=0.12, pan=-0.16),
}

BOOMBAP_KIT: dict[int, Drum] = {
    36: Drum("membrane", 95.0, 52.0, 0.46, 0.002, 1300.0, drive=0.45, click=0.14, gain=0.95, wet=0.07),
    37: Drum("noise", 1200.0, decay=0.04, lowpass=5200.0, highpass=700.0, gain=0.4, wet=0.2),
    38: Drum("tone_noise", 185.0, decay=0.19, lowpass=5400.0, highpass=150.0,
             noise_level=0.8, tone_level=0.6, drive=0.5, gain=0.72, wet=0.26),
    39: Drum("clap", 1100.0, decay=0.16, lowpass=4800.0, highpass=600.0, gain=0.55, wet=0.3),
    40: Drum("tone_noise", 210.0, decay=0.15, lowpass=5600.0, highpass=170.0,
             noise_level=0.85, tone_level=0.4, gain=0.68, wet=0.26),
    42: Drum("noise", decay=0.055, lowpass=8200.0, highpass=4200.0, gain=0.34, wet=0.14, pan=0.12),
    44: Drum("noise", decay=0.04, lowpass=7000.0, highpass=3600.0, gain=0.26, wet=0.1, pan=0.12),
    45: Drum("membrane", 130.0, 86.0, 0.34, 0.002, 1800.0, gain=0.6, wet=0.24),
    46: Drum("noise", decay=0.26, lowpass=8600.0, highpass=3800.0, gain=0.3, wet=0.24, pan=0.16),
    47: Drum("membrane", 175.0, 118.0, 0.3, 0.002, 2000.0, gain=0.6, wet=0.24),
    49: Drum("noise", decay=1.1, lowpass=9500.0, highpass=2000.0, gain=0.3, wet=0.5, pan=-0.2),
    50: Drum("membrane", 235.0, 160.0, 0.26, 0.002, 2400.0, gain=0.58, wet=0.24),
    51: Drum("tone_noise", 460.0, decay=0.5, lowpass=9000.0, highpass=2600.0,
             noise_level=0.78, tone_level=0.22, gain=0.26, wet=0.32, pan=0.2),
    54: Drum("noise", decay=0.11, lowpass=8000.0, highpass=2600.0, gain=0.28, wet=0.26),
    69: Drum("noise", decay=0.08, lowpass=8200.0, highpass=3200.0, gain=0.24, wet=0.2),
    76: Drum("tone_noise", 720.0, decay=0.07, lowpass=4600.0, highpass=350.0,
             noise_level=0.35, tone_level=0.75, gain=0.36, wet=0.2),
    82: Drum("noise", decay=0.06, lowpass=9000.0, highpass=4200.0, gain=0.22, wet=0.18, pan=-0.14),
}

# The danger stem's hats are tighter and darker than the main kit's.
FAST_HAT_KIT: dict[int, Drum] = {
    42: Drum("noise", decay=0.028, lowpass=11000.0, highpass=6800.0, gain=0.34, wet=0.05),
    44: Drum("noise", decay=0.024, lowpass=9500.0, highpass=5600.0, gain=0.26, wet=0.05),
    46: Drum("noise", decay=0.18, lowpass=11500.0, highpass=5600.0, gain=0.3, wet=0.12),
}

# Zen's danger percussion: felt, not heard.
SPARSE_PERC_KIT: dict[int, Drum] = {
    36: Drum("membrane", 80.0, 46.0, 0.6, 0.004, 900.0, drive=0.2, gain=0.7, wet=0.12),
    45: Drum("membrane", 115.0, 74.0, 0.5, 0.004, 1200.0, gain=0.5, wet=0.3),
}

KITS: dict[str, tuple[dict[int, Drum], Drum]] = {
    "edm_kit": (EDM_KIT, EDM_KIT[42]),
    "boombap_kit": (BOOMBAP_KIT, BOOMBAP_KIT[42]),
    "fast_hat": (FAST_HAT_KIT, FAST_HAT_KIT[42]),
    "sparse_perc": (SPARSE_PERC_KIT, SPARSE_PERC_KIT[36]),
}


# --- rendering --------------------------------------------------------------

@dataclass
class Renderer:
    sample_rate: int
    seed: int = 0
    _cache: dict = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        self._rng = np.random.default_rng(self.seed)

    # -- pitched ---------------------------------------------------------
    def _additive(self, voice: Voice, pitch: int, hold: float, total: int) -> np.ndarray:
        base = midi_to_hz(pitch)
        t = np.arange(total, dtype=np.float64) / self.sample_rate
        out = np.zeros(total)
        nyquist = self.sample_rate * 0.5
        for partial in voice.partials:
            freq = base * partial.ratio * (2.0 ** (partial.detune_cents / 1200.0))
            if freq <= 0 or freq >= nyquist * 0.95:
                continue
            weight = partial.amplitude * butterworth(
                np.array([freq]), voice.cutoff, voice.cutoff_order
            )[0]
            if weight < 1e-4:
                continue
            phase = TWO_PI * freq * t + self._rng.uniform(0, TWO_PI)
            if voice.vibrato_hz and voice.vibrato_cents:
                depth = (voice.vibrato_cents / 1200.0) * math.log(2.0) * freq / voice.vibrato_hz
                phase += depth * np.sin(TWO_PI * voice.vibrato_hz * t)
            out += weight * np.sin(phase)
        envelope = env_adsr(
            total, self.sample_rate, voice.attack, voice.decay,
            voice.sustain, voice.release, hold,
        )
        return out * envelope

    def _pluck(self, voice: Voice, pitch: int, hold: float, total: int) -> np.ndarray:
        """Additive with per-partial exponential decay — a struck string."""
        base = midi_to_hz(pitch)
        t = np.arange(total, dtype=np.float64) / self.sample_rate
        out = np.zeros(total)
        nyquist = self.sample_rate * 0.5
        attack = max(voice.attack, 1.0 / self.sample_rate)
        rise = np.clip(t / attack, 0.0, 1.0)
        for index, partial in enumerate(voice.partials, start=1):
            freq = base * partial.ratio
            if freq <= 0 or freq >= nyquist * 0.95:
                continue
            weight = partial.amplitude * butterworth(
                np.array([freq]), voice.cutoff, voice.cutoff_order
            )[0]
            if weight < 1e-4:
                continue
            tau = voice.pluck_decay / (partial.decay * (index ** (voice.pluck_brightness - 1.0)))
            decay = np.exp(-t / max(tau, 1e-3))
            out += weight * np.sin(TWO_PI * freq * t + self._rng.uniform(0, TWO_PI)) * decay
        # A released key damps the string rather than letting it ring on.
        damp = np.ones(total)
        after = t > hold
        if after.any():
            damp[after] = np.exp(-(t[after] - hold) / max(voice.release or 0.4, 0.05))
        return out * rise * damp

    def _sweep(self, voice: Voice, pitch: int, hold: float, total: int) -> np.ndarray:
        """Filtered noise whose brightness rises across the note."""
        rng = np.random.default_rng(self._rng.integers(0, 2**32))
        low = shaped_noise(total, self.sample_rate, rng,
                           lowpass=voice.noise_lowpass * 0.18,
                           highpass=voice.noise_highpass)
        high = shaped_noise(total, self.sample_rate, rng,
                            lowpass=voice.noise_lowpass,
                            highpass=voice.noise_highpass * 2.5 or None)
        ramp = np.clip(np.arange(total) / max(int(hold * self.sample_rate), 1), 0.0, 1.0)
        body = low * (1.0 - ramp) + high * ramp
        envelope = env_adsr(total, self.sample_rate, max(voice.attack, hold * 0.6),
                            0.0, 1.0, voice.release, hold)
        # A pitch-tracked resonance so different notes read as different sweeps.
        tone = np.sin(TWO_PI * midi_to_hz(pitch) * np.arange(total) / self.sample_rate)
        return (body * 0.85 + tone * 0.15) * envelope

    def _crackle(self, voice: Voice, pitch: int, hold: float, total: int) -> np.ndarray:
        """Vinyl: sparse clicks over a whisper of surface noise."""
        rng = np.random.default_rng(self._rng.integers(0, 2**32))
        out = shaped_noise(total, self.sample_rate, rng,
                           lowpass=voice.noise_lowpass * 0.4,
                           highpass=voice.noise_highpass * 0.5) * 0.18
        # Brighter notes crackle harder: pitch chooses the texture.
        brightness = 0.5 + (pitch % 24) / 24.0
        count = int(voice.noise_density * hold * brightness)
        if count:
            width = max(int(0.0015 * self.sample_rate), 4)
            click = shaped_noise(width, self.sample_rate, rng,
                                 highpass=voice.noise_highpass,
                                 lowpass=voice.noise_lowpass)
            click *= np.exp(-np.arange(width) / (width * 0.25))
            for position in rng.integers(0, max(total - width, 1), size=count):
                out[position:position + width] += click * rng.uniform(0.25, 1.0)
        return out

    def _hiss(self, voice: Voice, pitch: int, hold: float, total: int) -> np.ndarray:
        rng = np.random.default_rng(self._rng.integers(0, 2**32))
        body = shaped_noise(total, self.sample_rate, rng,
                            lowpass=voice.noise_lowpass,
                            highpass=voice.noise_highpass, tilt=1.0)
        envelope = env_adsr(total, self.sample_rate, voice.attack, 0.0, 1.0, voice.release, hold)
        # A trace of the tonic keeps the hiss from being pure noise.
        tone = np.sin(TWO_PI * midi_to_hz(pitch) * np.arange(total) / self.sample_rate)
        return (body + tone * 0.06) * envelope

    def note(self, voice_name: str, pitch: int, hold: float, velocity: int) -> np.ndarray:
        voice = VOICES[voice_name]
        total = int(round((hold + voice.tail) * self.sample_rate))
        if total <= 1:
            return np.zeros(0)
        key = (voice_name, pitch, round(hold, 3), velocity // 12)
        cached = self._cache.get(key)
        if cached is None:
            if voice.kind == "pluck":
                body = self._pluck(voice, pitch, hold, total)
            elif voice.kind == "sweep":
                body = self._sweep(voice, pitch, hold, total)
            elif voice.kind == "crackle":
                body = self._crackle(voice, pitch, hold, total)
            elif voice.kind == "hiss":
                body = self._hiss(voice, pitch, hold, total)
            else:
                body = self._additive(voice, pitch, hold, total)
            if voice.tremolo_hz and voice.tremolo_depth:
                t = np.arange(total) / self.sample_rate
                body *= 1.0 - voice.tremolo_depth * (0.5 - 0.5 * np.cos(TWO_PI * voice.tremolo_hz * t))
            if voice.drive:
                body = np.tanh(body * (1.0 + 4.0 * voice.drive)) / (1.0 + voice.drive)
            peak = np.max(np.abs(body))
            if peak > 0:
                body = body / peak
            self._cache[key] = body
            cached = body
        # Velocity shapes level with a mild curve, as a real instrument does.
        return cached * voice.gain * (velocity / 127.0) ** 1.35

    # -- percussion -------------------------------------------------------
    def drum(self, kit_name: str, note: int, velocity: int) -> np.ndarray:
        table, fallback = KITS[kit_name]
        spec = table.get(note, fallback)
        key = ("drum", kit_name, note, velocity // 12)
        cached = self._cache.get(key)
        if cached is None:
            total = int(round((spec.decay * 2.2 + spec.attack + 0.02) * self.sample_rate))
            rng = np.random.default_rng(self._rng.integers(0, 2**32))
            t = np.arange(total, dtype=np.float64) / self.sample_rate
            envelope = env_ad(total, self.sample_rate, spec.attack, spec.decay)

            if spec.kind == "membrane":
                # Exponential pitch drop: the thump of a tuned head.
                target = spec.sweep_to or spec.frequency * 0.4
                freq = target + (spec.frequency - target) * np.exp(-t / (spec.decay * 0.45))
                phase = TWO_PI * np.cumsum(freq) / self.sample_rate
                body = np.sin(phase) * envelope
                if spec.click:
                    width = max(int(0.004 * self.sample_rate), 8)
                    click = shaped_noise(width, self.sample_rate, rng, highpass=2000.0)
                    click *= np.exp(-np.arange(width) / (width * 0.2))
                    body[:width] += click * spec.click
            elif spec.kind == "clap":
                body = np.zeros(total)
                burst = shaped_noise(total, self.sample_rate, rng,
                                     lowpass=spec.lowpass, highpass=spec.highpass or None)
                # Three early reflections then the body: a hand clap.
                for offset, level in ((0.0, 1.0), (0.011, 0.8), (0.022, 0.6), (0.034, 0.45)):
                    start = int(offset * self.sample_rate)
                    width = min(int(0.02 * self.sample_rate), total - start)
                    if width <= 0:
                        continue
                    tail = np.exp(-np.arange(width) / (width * 0.3))
                    body[start:start + width] += burst[:width] * tail * level
                body *= env_ad(total, self.sample_rate, 0.0008, spec.decay, curve=2.0)
            else:
                body = shaped_noise(total, self.sample_rate, rng,
                                    lowpass=spec.lowpass, highpass=spec.highpass or None)
                body = body * envelope * spec.noise_level if spec.noise_level else body * envelope
                if spec.kind == "tone_noise":
                    tone = np.sin(TWO_PI * spec.frequency * t) * envelope
                    body = body + tone * spec.tone_level

            if spec.drive:
                body = np.tanh(body * (1.0 + 4.0 * spec.drive)) / (1.0 + spec.drive)
            peak = np.max(np.abs(body))
            if peak > 0:
                body = body / peak
            self._cache[key] = body
            cached = body
        return cached * spec.gain * (velocity / 127.0) ** 1.2

    def drum_spec(self, kit_name: str, note: int) -> Drum:
        table, fallback = KITS[kit_name]
        return table.get(note, fallback)


# --- buffer maths -----------------------------------------------------------

def add_circular(buffer: np.ndarray, start: int, segment: np.ndarray) -> None:
    """Mix `segment` in at `start`, wrapping anything past the end to the top.

    This is what makes the loop seamless: a release tail that would run past
    bar 16 reappears under bar 1, so the waveform is genuinely periodic and
    any loopStart/loopEnd a browser lands on is phase-continuous.
    """
    n = buffer.shape[0]
    if n == 0 or segment.size == 0:
        return
    position = start % n
    remaining = segment
    while remaining.size:
        take = min(n - position, remaining.size)
        buffer[position:position + take] += remaining[:take]
        remaining = remaining[take:]
        position = 0


def room_impulse(
    sample_rate: int, seconds: float, decay: float, rng: np.random.Generator,
    predelay: float = 0.012, brightness: float = 4200.0,
) -> np.ndarray:
    """A stereo decaying-noise impulse response: cheap, and wide by nature
    because the two channels are independent."""
    n = int(seconds * sample_rate)
    out = np.zeros((2, n))
    t = np.arange(n) / sample_rate
    envelope = np.exp(-t / decay)
    gate = int(predelay * sample_rate)
    envelope[:gate] = 0.0
    for channel in range(2):
        noise = shaped_noise(n, sample_rate, rng, lowpass=brightness, highpass=120.0)
        out[channel] = noise * envelope
    peak = np.max(np.abs(out))
    return out / peak if peak > 0 else out


def fast_fft_len(target: int) -> int:
    """Smallest 5-smooth length at or above `target`.

    A loop length like 2,194,286 samples factors as 2 x a large prime, and
    numpy falls back to Bluestein for that: a single transform costs twelve
    times what the nearest 5-smooth length costs. Every spectral step pads up
    to this instead.
    """
    if target <= 1:
        return 1
    best = 1 << (target - 1).bit_length()
    power_five = 1
    while power_five < best:
        power_three = power_five
        while power_three < best:
            candidate = power_three
            while candidate < target:
                candidate *= 2
            best = min(best, candidate)
            power_three *= 3
        power_five *= 5
    return best


def convolve_circular(signal: np.ndarray, impulse: np.ndarray) -> np.ndarray:
    """Circular convolution over the loop length, so the reverb wraps too.

    Computed as a linear convolution at a fast FFT length with the overhang
    folded back onto the top of the loop, which is the same result as a
    length-N cyclic transform at a fraction of the cost.
    """
    n = signal.shape[0]
    m = impulse.shape[0]
    if n == 0 or m == 0:
        return signal
    size = fast_fft_len(n + m)
    product = np.fft.irfft(
        np.fft.rfft(signal, size) * np.fft.rfft(impulse, size), size
    )
    out = product[:n].copy()
    overhang = product[n : n + m - 1]
    if overhang.size:
        folded = min(overhang.size, n)
        out[:folded] += overhang[:folded]
    return out


def remove_dc(signal: np.ndarray) -> np.ndarray:
    """Subtract the mean.

    A cyclic infrasonic high-pass would need a length-N transform, and these
    stems have nothing below their lowest fundamental (27.5 Hz in the zen
    danger stem) to remove: every envelope starts and ends at zero, so the
    only offset to take out is the mean itself.
    """
    if signal.size == 0:
        return signal
    return signal - signal.mean()


def pan_to_stereo(mono: np.ndarray, pan: float) -> np.ndarray:
    """Constant-power pan; returns a (2, n) array."""
    angle = (np.clip(pan, -1.0, 1.0) + 1.0) * (math.pi / 4.0)
    return np.vstack((mono * math.cos(angle), mono * math.sin(angle)))
