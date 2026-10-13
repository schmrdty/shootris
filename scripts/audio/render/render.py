"""Render the stem MIDI to WAV masters and encode the browser files.

    python3 scripts/audio/render/render.py                  # everything
    python3 scripts/audio/render/render.py --pack zen
    python3 scripts/audio/render/render.py --engine fluidsynth --soundfont gm.sf2

Two engines:

* ``fluidsynth`` — the default when ``fluidsynth`` is on PATH and a General
  MIDI SoundFont can be found. Each stem is rendered, then whatever runs past
  bar 16 is wrapped back under bar 1 so the loop stays seamless.
* ``builtin`` — the numpy synthesizer in synth.py, chosen automatically when
  FluidSynth is unavailable. It reads the voice id from each MIDI track name,
  so stems sound the same on every machine with no SoundFont to ship.

WAV masters stay in scripts/audio/wav (git-ignored, never served). The encoded
files go to public/music/<pack>/<bpm>/, and the pack metadata — including the
decoder offset measured from the encoded files — to public/music/<pack>/meta.json.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "gen"))

import synth  # noqa: E402
from common import (  # noqa: E402
    DRUM_VOICES,
    METADATA_DIR,
    MIDI_DIR,
    PUBLIC_MUSIC_DIR,
    SAMPLE_RATE,
    STEMS,
    WAV_DIR,
    PrettyMIDI,
    loop_samples,
    stem_filename,
)

PACKS = ("arcade", "zen")

# Peak level each stem is normalised to, in dBFS. This is the mix: the engine's
# matrix scales these, so the balance between stems lives here.
STEM_PEAK_DBFS = {
    "arcade": {
        "BASS": -6.0, "DRUMS": -5.0, "ROOM": -22.0, "MOTION": -11.0,
        "CHORDS": -12.0, "THEME": -9.0, "DANGER": -7.0, "RECOVERY": -12.0,
    },
    "zen": {
        "BASS": -6.0, "DRUMS": -7.0, "ROOM": -28.0, "MOTION": -12.0,
        "CHORDS": -11.0, "THEME": -10.0, "DANGER": -13.0, "RECOVERY": -14.0,
    },
}

# The space each pack sits in: arcade is a bright short plate, zen a darker room.
ROOM = {
    "arcade": {"seconds": 1.8, "decay": 0.42, "brightness": 5200.0, "predelay": 0.010},
    "zen": {"seconds": 2.6, "decay": 0.62, "brightness": 3000.0, "predelay": 0.016},
}

SOUNDFONT_CANDIDATES = (
    "/usr/share/sounds/sf2/FluidR3_GM.sf2",
    "/usr/share/sounds/sf2/default-GM.sf2",
    "/usr/share/soundfonts/FluidR3_GM.sf2",
    "/usr/share/soundfonts/default.sf2",
    "/usr/local/share/soundfonts/FluidR3_GM.sf2",
)


def db_to_linear(db: float) -> float:
    return 10.0 ** (db / 20.0)


# --- engine selection -------------------------------------------------------

def find_soundfont(explicit: str | None) -> str | None:
    if explicit:
        return explicit if os.path.exists(explicit) else None
    env = os.environ.get("SHOOTRIS_SOUNDFONT")
    if env and os.path.exists(env):
        return env
    for candidate in SOUNDFONT_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
    return None


def resolve_engine(requested: str, soundfont: str | None) -> tuple[str, str | None]:
    have_fluidsynth = shutil.which("fluidsynth") is not None
    found = find_soundfont(soundfont)
    if requested == "fluidsynth":
        if not have_fluidsynth:
            raise SystemExit("fluidsynth is not on PATH")
        if not found:
            raise SystemExit("no General MIDI SoundFont found — pass --soundfont")
        return "fluidsynth", found
    if requested == "builtin":
        return "builtin", None
    if have_fluidsynth and found:
        return "fluidsynth", found
    reason = "fluidsynth not installed" if not have_fluidsynth else "no SoundFont found"
    print(f"  engine: builtin ({reason})")
    return "builtin", None


# --- WAV ---------------------------------------------------------------------

def write_wav(path: str, audio: np.ndarray, sample_rate: int) -> None:
    """Write a (2, n) float array as 16-bit stereo PCM."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    clipped = np.clip(audio, -1.0, 1.0)
    interleaved = (clipped.T.reshape(-1) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(interleaved.tobytes())


def read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    if width != 2:
        raise ValueError(f"{path}: expected 16-bit PCM, got {width * 8}-bit")
    data = np.frombuffer(frames, dtype="<i2").astype(np.float64) / 32768.0
    return data.reshape(-1, channels).T, rate


# --- builtin rendering -------------------------------------------------------

def render_builtin(midi: PrettyMIDI, pack: str, total_samples: int, seed: int) -> np.ndarray:
    renderer = synth.Renderer(SAMPLE_RATE, seed=seed)
    rng = np.random.default_rng(seed ^ 0x5EED)

    dry = np.zeros((2, total_samples))
    wet_bus = np.zeros(total_samples)

    for instrument in midi.instruments:
        voice = instrument.name or ("edm_kit" if instrument.is_drum else "saw_pad")
        mono = np.zeros(total_samples)
        if instrument.is_drum or voice in DRUM_VOICES:
            kit = voice if voice in synth.KITS else "edm_kit"
            send = 0.0
            for note in instrument.notes:
                segment = renderer.drum(kit, note.pitch, note.velocity)
                if segment.size:
                    synth.add_circular(mono, int(round(note.start * SAMPLE_RATE)), segment)
                    send = max(send, renderer.drum_spec(kit, note.pitch).wet)
            pan = renderer.drum_spec(kit, instrument.notes[0].pitch).pan if instrument.notes else 0.0
        else:
            patch = synth.VOICES.get(voice)
            if patch is None:
                patch = synth.VOICES["saw_pad"]
                voice = "saw_pad"
            send = patch.wet
            pan = patch.pan
            for note in instrument.notes:
                segment = renderer.note(voice, note.pitch, max(note.duration, 0.01), note.velocity)
                if segment.size:
                    synth.add_circular(mono, int(round(note.start * SAMPLE_RATE)), segment)

        peak = np.max(np.abs(mono))
        if peak > 0:
            # Per-instrument headroom so one busy part cannot swamp the stem.
            mono = mono / max(peak, 1.0)
        dry += synth.pan_to_stereo(mono, pan)
        wet_bus += mono * send

    settings = ROOM[pack]
    impulse = synth.room_impulse(
        SAMPLE_RATE, settings["seconds"], settings["decay"], rng,
        predelay=settings["predelay"], brightness=settings["brightness"],
    )
    out = dry
    if np.any(wet_bus):
        for channel in range(2):
            energy = np.sqrt(np.sum(impulse[channel] ** 2))
            if energy > 0:
                out[channel] += synth.convolve_circular(wet_bus, impulse[channel] / energy)
    return out


# --- fluidsynth rendering ----------------------------------------------------

def render_fluidsynth(
    midi_path: str, soundfont: str, total_samples: int, scratch: str
) -> np.ndarray:
    os.makedirs(scratch, exist_ok=True)
    raw = os.path.join(scratch, "fluidsynth.wav")
    subprocess.run(
        [
            "fluidsynth", "-ni", "-g", "0.8", "-r", str(SAMPLE_RATE),
            "-O", "s16", "-T", "wav", "-F", raw, soundfont, midi_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    audio, rate = read_wav(raw)
    if rate != SAMPLE_RATE:
        raise RuntimeError(f"fluidsynth produced {rate} Hz, expected {SAMPLE_RATE}")
    out = np.zeros((2, total_samples))
    for channel in range(2):
        # Fold the release tail back under the top of the loop, exactly as the
        # builtin engine does, so the result is periodic.
        synth.add_circular(out[channel], 0, audio[channel])
    os.remove(raw)
    return out


# --- stem pipeline -----------------------------------------------------------

def normalise(audio: np.ndarray, target_dbfs: float) -> tuple[np.ndarray, float]:
    peak = float(np.max(np.abs(audio)))
    if peak <= 0:
        return audio, 0.0
    gain = db_to_linear(target_dbfs) / peak
    return audio * gain, gain


def render_stem(
    pack: str, bpm: int, index: int, name: str, engine: str, soundfont: str | None, scratch: str
) -> str:
    total = loop_samples(bpm)
    midi_path = os.path.join(MIDI_DIR, pack, str(bpm), stem_filename(index, name, "mid"))
    midi = PrettyMIDI(midi_path)

    if engine == "fluidsynth":
        assert soundfont
        audio = render_fluidsynth(midi_path, soundfont, total, scratch)
    else:
        audio = render_builtin(midi, pack, total, seed=hash((pack, bpm, index)) & 0xFFFFFFFF)

    for channel in range(2):
        audio[channel] = synth.remove_dc(audio[channel])
    audio, _gain = normalise(audio, STEM_PEAK_DBFS[pack][name])

    out = os.path.join(WAV_DIR, pack, str(bpm), stem_filename(index, name, "wav"))
    write_wav(out, audio, SAMPLE_RATE)
    return out


# --- encoding ----------------------------------------------------------------

def encode(master: str, destination: str, spec: dict) -> None:
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    if spec["codec"] == "opus":
        codec_args = [
            "-c:a", "libopus",
            "-b:a", f"{spec['bitrate_kbps']}k",
            "-vbr", "on",
            "-compression_level", "10",
            "-application", "audio",
        ]
    elif spec["codec"] == "aac":
        codec_args = [
            "-c:a", "aac",
            "-b:a", f"{spec['bitrate_kbps']}k",
            "-movflags", "+faststart",
        ]
    else:
        raise SystemExit(f"unsupported codec {spec['codec']!r}")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", master, *codec_args, destination],
        check=True,
    )


def decode_to_pcm(path: str) -> np.ndarray:
    """Decode an encoded file back to (2, n) floats at the master sample rate."""
    result = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", path,
            "-f", "s16le", "-acodec", "pcm_s16le",
            "-ar", str(SAMPLE_RATE), "-ac", "2", "-",
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    data = np.frombuffer(result.stdout, dtype="<i2").astype(np.float64) / 32768.0
    return data.reshape(-1, 2).T


def measure_lag(master_mono: np.ndarray, decoded_mono: np.ndarray, max_lag: int = 8192) -> int:
    """How many samples of codec priming a decoder prepends.

    Cross-correlates the decoded file against the master so the engine can
    offset loopStart/loopEnd by the exact amount rather than guessing at a
    codec's documented delay.
    """
    window = min(len(master_mono), 262_144)
    if window < 1024:
        return 0
    reference = master_mono[:window]
    probe = decoded_mono[: window + max_lag]
    size = 1 << (len(probe) + len(reference)).bit_length()
    correlation = np.fft.irfft(
        np.fft.rfft(probe, size) * np.conj(np.fft.rfft(reference, size)), size
    )
    return int(np.argmax(correlation[: max_lag + 1]))


# --- driver ------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pack", choices=(*PACKS, "all"), default="all")
    parser.add_argument("--bpm", type=int, action="append", help="limit to these BPM tiers")
    parser.add_argument("--engine", choices=("auto", "fluidsynth", "builtin"), default="auto")
    parser.add_argument("--soundfont", help="path to a General MIDI SoundFont")
    parser.add_argument(
        "--formats",
        help="comma-separated format ids to encode (default: every format in the metadata)",
    )
    parser.add_argument("--skip-wav", action="store_true", help="reuse existing WAV masters")
    parser.add_argument("--skip-encode", action="store_true", help="render masters only")
    args = parser.parse_args()

    packs = PACKS if args.pack == "all" else (args.pack,)
    engine, soundfont = resolve_engine(args.engine, args.soundfont)
    print(f"engine: {engine}" + (f" ({soundfont})" if soundfont else ""))

    scratch = os.path.join(WAV_DIR, ".scratch")
    started = time.time()

    for pack in packs:
        meta_path = os.path.join(METADATA_DIR, f"{pack}.json")
        with open(meta_path) as handle:
            meta = json.load(handle)
        tiers = [b for b in meta["bpm_tiers"] if not args.bpm or b in args.bpm]

        wanted = {f.strip() for f in args.formats.split(",")} if args.formats else None
        if wanted:
            unknown = wanted - {f["id"] for f in meta["formats"]}
            if unknown:
                raise SystemExit(f"unknown format id(s): {', '.join(sorted(unknown))}")
        formats = [f for f in meta["formats"] if not wanted or f["id"] in wanted]
        for format_spec in formats:
            format_spec.setdefault("decoded_length_samples", {})

        for bpm in tiers:
            expected = meta["loops"][str(bpm)]["loop_samples"]
            print(f"\n{pack} @ {bpm} BPM  ({expected} samples)")
            lags: dict[str, list[int]] = {f["id"]: [] for f in formats}
            decoded: dict[str, list[int]] = {f["id"]: [] for f in formats}

            for index, name in STEMS:
                tick = time.time()
                master = os.path.join(WAV_DIR, pack, str(bpm), stem_filename(index, name, "wav"))
                if not (args.skip_wav and os.path.exists(master)):
                    master = render_stem(pack, bpm, index, name, engine, soundfont, scratch)
                audio, _rate = read_wav(master)
                if audio.shape[1] != expected:
                    raise SystemExit(
                        f"{master}: {audio.shape[1]} samples, expected {expected}"
                    )
                line = f"  {stem_filename(index, name, 'wav'):24s} peak {np.max(np.abs(audio)):.3f}"

                if not args.skip_encode:
                    reference = audio.mean(axis=0)
                    for format_spec in formats:
                        target = os.path.join(
                            PUBLIC_MUSIC_DIR, pack, str(bpm),
                            stem_filename(index, name, format_spec["ext"]),
                        )
                        encode(master, target, format_spec)
                        back = decode_to_pcm(target)
                        decoded[format_spec["id"]].append(back.shape[1])
                        lags[format_spec["id"]].append(
                            measure_lag(reference, back.mean(axis=0))
                        )
                        line += (
                            f"  {format_spec['ext']} {os.path.getsize(target) // 1024}KiB"
                            f" lag {lags[format_spec['id']][-1]}"
                        )
                print(f"{line}  [{time.time() - tick:.1f}s]")

            for format_spec in formats:
                measured = decoded[format_spec["id"]]
                if not measured:
                    continue
                if len(set(measured)) != 1:
                    print(
                        f"  ! {format_spec['id']}: decoded lengths differ within the set: "
                        f"{sorted(set(measured))}"
                    )
                format_spec["decoded_length_samples"][str(bpm)] = max(measured)
                offset = max(lags[format_spec["id"]])
                previous = format_spec.get("decode_offset_samples", 0)
                format_spec["decode_offset_samples"] = max(previous, offset)

        with open(meta_path, "w") as handle:
            json.dump(meta, handle, indent=2)
            handle.write("\n")
        public_meta = os.path.join(PUBLIC_MUSIC_DIR, pack, "meta.json")
        os.makedirs(os.path.dirname(public_meta), exist_ok=True)
        shutil.copyfile(meta_path, public_meta)
        print(f"\n{meta_path}\n{public_meta}")

    if os.path.isdir(scratch):
        shutil.rmtree(scratch, ignore_errors=True)
    print(f"\ndone in {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
