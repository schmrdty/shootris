"""Validation tests 7-9: the rendered masters and the encoded browser files.

    python3 scripts/audio/tests/test_audio.py           # every pack and tier
    python3 scripts/audio/tests/test_audio.py --quick   # one tier per pack

Test 9 re-decodes the shipped files with ffmpeg rather than trusting what
render.py recorded, so a stale metadata figure fails here instead of in a
browser.
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "gen"))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "render"))
sys.path.insert(0, HERE)

from common import (  # noqa: E402
    METADATA_DIR,
    REVISION_LENGTH,
    PUBLIC_MUSIC_DIR,
    SAMPLE_RATE,
    STEMS,
    WAV_DIR,
    bar_seconds,
    revision_for,
    stem_filename,
)
from harness import check, main, test  # noqa: E402
from render import decode_to_pcm, measure_lag, read_wav  # noqa: E402

PACKS = ("arcade", "zen")
QUICK = "--quick" in sys.argv

# A stem rendered solo has to be audible: anything under these is a bug in a
# generator or a voice, not a quiet passage.
MIN_PEAK = 0.01        # -40 dBFS
MIN_RMS = 0.0005       # -66 dBFS
SEAM_WINDOW_MS = 10.0


def _meta(pack: str) -> dict:
    with open(os.path.join(METADATA_DIR, f"{pack}.json")) as handle:
        return json.load(handle)


METADATA = {pack: _meta(pack) for pack in PACKS}


def _tiers(pack: str) -> list[int]:
    tiers = METADATA[pack]["bpm_tiers"]
    return tiers[:1] if QUICK else tiers


def _sets() -> list[tuple[str, int]]:
    return [(pack, bpm) for pack in PACKS for bpm in _tiers(pack)]


def _published_dir(pack: str, bpm: int) -> str:
    """The revision directory a tier's encoded stems are published in."""
    rev = METADATA[pack]["loops"][str(bpm)].get("rev")
    check(bool(rev), f"{pack}/{bpm}: metadata has no revision — rerun render.py")
    return os.path.join(PUBLIC_MUSIC_DIR, pack, str(bpm), rev)


_WAV_CACHE: dict[str, np.ndarray] = {}


def _master(pack: str, bpm: int, index: int, name: str) -> np.ndarray:
    path = os.path.join(WAV_DIR, pack, str(bpm), stem_filename(index, name, "wav"))
    if path not in _WAV_CACHE:
        check(os.path.exists(path), f"missing master {path}")
        audio, rate = read_wav(path)
        check(rate == SAMPLE_RATE, f"{path}: {rate} Hz, expected {SAMPLE_RATE}")
        _WAV_CACHE[path] = audio
    return _WAV_CACHE[path]


# --- 7 -----------------------------------------------------------------------

@test("7a. every WAV master in a set has the same sample count as the metadata")
def test_master_lengths() -> str:
    for pack, bpm in _sets():
        expected = METADATA[pack]["loops"][str(bpm)]["loop_samples"]
        lengths = set()
        for index, name in STEMS:
            audio = _master(pack, bpm, index, name)
            check(audio.shape[0] == 2, f"{pack}/{bpm}/{name}: expected stereo")
            lengths.add(audio.shape[1])
        check(
            len(lengths) == 1,
            f"{pack}/{bpm}: masters have differing lengths {sorted(lengths)}",
        )
        check(
            lengths.pop() == expected,
            f"{pack}/{bpm}: master length != metadata loop_samples {expected}",
        )
    return f"{len(_sets())} sets"


SEAM_NEIGHBOURHOOD = 128


def seam_step_ratio(signal: np.ndarray) -> tuple[float, float, float]:
    """How the step across the loop point compares to the waveform's own steps.

    These stems are rendered circularly — a release tail that runs past bar 16
    is folded back under bar 1 — so the signal is periodic and its ends are
    not silent. A periodic signal's step across the seam is just another
    sample-to-sample step, so it is measured against the steps either side of
    the seam (which may be a drum transient, and steep) and against the
    waveform as a whole. A hard cut, by contrast, steps by something like the
    full amplitude while its neighbours are creeping along a decay.
    """
    step = abs(float(signal[0]) - float(signal[-1]))
    diffs = np.abs(np.diff(signal))
    if diffs.size == 0:
        return 0.0, 0.0, 1.0
    local = np.concatenate((diffs[-SEAM_NEIGHBOURHOOD:], diffs[:SEAM_NEIGHBOURHOOD]))
    allowed = max(
        float(local.max()) * 2.0,
        float(np.percentile(diffs, 99.9)),
        4.0 / 32768.0,  # a few LSBs, for a stem that really does end in silence
    )
    return step, allowed, step / allowed


@test("7b. the loop seam is continuous (circular render) or ends near zero")
def test_loop_seam() -> str:
    worst = (0.0, "")
    window = int(SEAM_WINDOW_MS * SAMPLE_RATE / 1000)
    for pack, bpm in _sets():
        for index, name in STEMS:
            audio = _master(pack, bpm, index, name)
            for channel in range(2):
                signal = audio[channel]
                quiet = (
                    max(
                        float(np.max(np.abs(signal[:window]))),
                        float(np.max(np.abs(signal[-window:]))),
                    )
                    < 0.01
                )
                step, allowed, ratio = seam_step_ratio(signal)
                if ratio > worst[0]:
                    worst = (ratio, f"{pack}/{bpm}/{name} ch{channel}")
                check(
                    quiet or ratio <= 1.0,
                    f"{pack}/{bpm}/{name} ch{channel}: seam step {step:.6f} is "
                    f"{ratio:.2f}x what the waveform's own steps allow ({allowed:.6f})",
                )
    return f"worst {worst[1]} at {worst[0]:.2f}x the allowance"


@test("7c. the seam check rejects a loop that was cut instead of wrapped")
def test_seam_check_has_teeth() -> str:
    """A control, so a passing 7b cannot just mean the check never fires."""
    # A tone cut mid-cycle: exactly the discontinuity a non-circular render
    # leaves at the loop point. 220.37 Hz does not complete a whole number of
    # cycles in a second, so the last sample and the first do not meet.
    length = SAMPLE_RATE
    t = np.arange(length) / SAMPLE_RATE
    cut = 0.5 * np.sin(2 * np.pi * 220.37 * t + 0.9)
    _step, _allowed, ratio = seam_step_ratio(cut)
    check(ratio > 1.0, f"a hard-cut tone scored only {ratio:.2f}x — 7b would not catch it")

    # And the same tone at a whole number of cycles passes, so the check is not
    # simply rejecting everything.
    cycles = 220.0
    seamless = 0.5 * np.sin(2 * np.pi * cycles * np.arange(length) / length)
    _s, _a, clean = seam_step_ratio(seamless)
    check(clean <= 1.0, f"a seamless tone scored {clean:.2f}x and would fail 7b")
    return f"hard cut {ratio:.1f}x, seamless {clean:.2f}x"


# --- 8 -----------------------------------------------------------------------

@test("8. every stem is non-silent rendered solo")
def test_non_silent() -> str:
    quietest = (1.0, "")
    for pack, bpm in _sets():
        for index, name in STEMS:
            audio = _master(pack, bpm, index, name)
            peak = float(np.max(np.abs(audio)))
            rms = float(np.sqrt(np.mean(audio**2)))
            check(peak >= MIN_PEAK, f"{pack}/{bpm}/{name}: peak {peak:.5f} below {MIN_PEAK}")
            check(rms >= MIN_RMS, f"{pack}/{bpm}/{name}: rms {rms:.6f} below {MIN_RMS}")
            if rms < quietest[0]:
                quietest = (rms, f"{pack}/{bpm}/{name}")
    return f"quietest {quietest[1]} at rms {quietest[0]:.5f}"


# --- 9 -----------------------------------------------------------------------

@test("9. encoded files decode to a length that puts loopEnd exactly in place")
def test_encoded_lengths() -> str:
    decoded_files = 0
    for pack, bpm in _sets():
        meta = METADATA[pack]
        loop = meta["loops"][str(bpm)]["loop_samples"]
        bar = int(bar_seconds(bpm) * SAMPLE_RATE)
        for spec in meta["formats"]:
            recorded = spec.get("decoded_length_samples", {}).get(str(bpm))
            check(
                recorded is not None,
                f"{pack}/{bpm}: metadata has no decoded length for {spec['id']} — rerun render.py",
            )
            offset = spec.get("decode_offset_samples", 0)
            for index, name in STEMS:
                path = os.path.join(
                    _published_dir(pack, bpm), stem_filename(index, name, spec["ext"])
                )
                check(os.path.exists(path), f"missing {path}")
                decoded = decode_to_pcm(path)
                decoded_files += 1
                length = decoded.shape[1]

                # loopEnd = (offset + loop) / sample_rate must land inside the
                # decoded buffer, and the slack after it must be under a bar.
                check(
                    length >= offset + loop,
                    f"{path}: decoded {length} samples, loopEnd needs {offset + loop}",
                )
                slack = length - offset - loop
                check(
                    slack < bar,
                    f"{path}: {slack} samples past loopEnd, more than one bar ({bar})",
                )
                # And the priming really is what the metadata claims.
                lag = measure_lag(
                    _master(pack, bpm, index, name).mean(axis=0), decoded.mean(axis=0)
                )
                check(
                    lag == offset,
                    f"{path}: decoder prepends {lag} samples, metadata says {offset}",
                )
    return f"{decoded_files} files decoded"


@test("every URL the engine builds from the metadata resolves to a real file")
def test_urls_resolve() -> str:
    """The end-to-end check: templates in, files on disk out.

    The engine never hardcodes a path — it substitutes {bpm}, {rev} and {ext}
    into url_template — so this is what proves a player will not get a 404.
    """
    checked = 0
    for pack, bpm in _sets():
        meta = METADATA[pack]
        rev = meta["loops"][str(bpm)].get("rev")
        check(bool(rev), f"{pack}/{bpm}: metadata has no revision — rerun render.py")
        for stem in meta["stems"]:
            for spec in meta["formats"]:
                url = (
                    stem["url_template"]
                    .replace("{bpm}", str(bpm))
                    .replace("{rev}", rev)
                    .replace("{ext}", spec["ext"])
                )
                check(url.startswith("/music/"), f"{url} is not under /music/")
                # An empty placeholder would leave "//" in the URL, which the
                # filesystem quietly collapses — so the check below would pass
                # against the pre-revision layout. The browser would not.
                check("//" not in url, f"{url} has an empty path segment")
                check(
                    "{" not in url and "}" not in url,
                    f"{url} still has an unsubstituted placeholder",
                )
                path = os.path.join(PUBLIC_MUSIC_DIR, url[len("/music/"):])
                check(os.path.exists(path), f"{url} resolves to nothing ({path})")
                checked += 1
    return f"{checked} URLs"


@test("each revision is the hash of the bytes it names")
def test_revision_matches_contents() -> str:
    """A stale revision in the metadata, or a file edited in place, would serve
    changed audio from a URL promised to be immutable. This is the check that
    makes that impossible to do quietly."""
    for pack, bpm in _sets():
        published = _published_dir(pack, bpm)
        files = {
            name: os.path.join(published, name)
            for name in os.listdir(published)
            if os.path.isfile(os.path.join(published, name))
        }
        check(bool(files), f"{published} is empty")
        expected = os.path.basename(published)
        actual = revision_for(files)
        check(
            actual == expected,
            f"{pack}/{bpm}: directory says revision {expected} but its "
            f"{len(files)} files hash to {actual} — rerun render.py",
        )
    return f"{len(_sets())} revisions verified"


@test("nothing is published outside a revision directory, so the cache policy covers it")
def test_layout_matches_cache_headers() -> str:
    """next.config.mjs serves /music/:pack/:bpm/:rev/:file* as immutable and
    /music/:pack/meta.json as always-revalidate. Anything at another depth
    would fall through to the framework default, which has changed between
    Next versions."""
    stray: list[str] = []
    for pack in PACKS:
        pack_root = os.path.join(PUBLIC_MUSIC_DIR, pack)
        for root, _dirs, files in os.walk(pack_root):
            for name in files:
                full = os.path.join(root, name)
                parts = os.path.relpath(full, PUBLIC_MUSIC_DIR).split(os.sep)
                if parts == [pack, "meta.json"]:
                    continue
                # pack / bpm / rev / file
                if len(parts) == 4 and len(parts[2]) == REVISION_LENGTH:
                    continue
                stray.append(os.path.relpath(full, PUBLIC_MUSIC_DIR))
    check(not stray, f"files at an uncovered path: {stray[:5]}")
    return "every file is meta.json or inside a revision directory"


@test("metadata is mirrored into public/music/<pack>/meta.json")
def test_public_metadata() -> str:
    for pack in PACKS:
        public = os.path.join(PUBLIC_MUSIC_DIR, pack, "meta.json")
        check(os.path.exists(public), f"missing {public}")
        with open(public) as handle:
            shipped = json.load(handle)
        check(
            shipped == METADATA[pack],
            f"{public} differs from scripts/audio/metadata/{pack}.json — rerun render.py",
        )
    return f"{len(PACKS)} packs"


@test("no WAV master is inside public/")
def test_no_masters_shipped() -> str:
    found = [
        os.path.join(root, name)
        for root, _dirs, files in os.walk(PUBLIC_MUSIC_DIR)
        for name in files
        if name.lower().endswith(".wav")
    ]
    check(not found, f"WAV masters must not be served: {found[:3]}")
    return "public/music is encoded only"


if __name__ == "__main__":
    main("Rendered audio validation (spec tests 7-9)")
