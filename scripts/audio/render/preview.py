"""Bounce what a state actually sounds like to a single file.

A stem on its own is not the soundtrack: the game plays all eight at once at
the mixing matrix's gains. This mixes the WAV masters at those gains so a state
can be listened to the way a player would hear it.

    python3 scripts/audio/render/preview.py                         # every state, both packs
    python3 scripts/audio/render/preview.py --pack zen --state calm
    python3 scripts/audio/render/preview.py --pack arcade --bpm 145 --state danger
    python3 scripts/audio/render/preview.py --solo DRUMS --pack zen  # one stem, alone

Output goes to scripts/audio/preview/ (git-ignored) as .ogg by default.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "gen"))

from common import (  # noqa: E402
    AUDIO_ROOT,
    METADATA_DIR,
    STATES,
    STEMS,
    WAV_DIR,
    stem_filename,
    stem_id,
)

PACKS = ("arcade", "zen")
PREVIEW_DIR = os.path.join(AUDIO_ROOT, "preview")
# Headroom: the engine's own default master gain, so a preview is as loud as
# the game is rather than hotter.
MASTER = 0.55


def load(pack: str) -> dict:
    with open(os.path.join(METADATA_DIR, f"{pack}.json")) as handle:
        return json.load(handle)


def mix(pack: str, bpm: int, gains: dict[str, float], out: str, master: float = MASTER) -> str | None:
    """ffmpeg-mix the masters at `gains`. Returns the path, or None if silent."""
    inputs: list[str] = []
    chains: list[str] = []
    labels: list[str] = []
    for index, name in STEMS:
        gain = gains.get(name, 0.0)
        if gain <= 0:
            continue
        path = os.path.join(WAV_DIR, pack, str(bpm), stem_filename(index, name, "wav"))
        if not os.path.exists(path):
            raise SystemExit(f"missing master {path} — run render.py first")
        # Count inputs, not list entries: each input adds two items to argv.
        slot = len(labels)
        inputs += ["-i", path]
        chains.append(f"[{slot}:a]volume={gain:.3f}[s{slot}]")
        labels.append(f"[s{slot}]")
    if not labels:
        return None

    # normalize=0 keeps the matrix's gains literal instead of averaging them.
    graph = ";".join(chains)
    graph += f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0[sum]"
    graph += f";[sum]volume={master:.3f}[out]"

    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", *inputs,
            "-filter_complex", graph, "-map", "[out]",
            "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-application", "audio",
            out,
        ],
        check=True,
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pack", choices=(*PACKS, "all"), default="all")
    parser.add_argument("--bpm", type=int, action="append", help="limit to these tiers")
    parser.add_argument("--state", choices=(*STATES, "all"), default="all")
    parser.add_argument("--solo", help="one stem name, at full gain, nothing else")
    parser.add_argument("--out-dir", default=PREVIEW_DIR)
    parser.add_argument(
        "--master",
        type=float,
        default=MASTER,
        help=f"master gain (default {MASTER}, the engine's own). Raise it for"
        " comfortable listening; the mix between stems does not change.",
    )
    args = parser.parse_args()

    packs = PACKS if args.pack == "all" else (args.pack,)
    written: list[str] = []

    for pack in packs:
        meta = load(pack)
        tiers = [b for b in meta["bpm_tiers"] if not args.bpm or b in args.bpm]
        for bpm in tiers:
            if args.solo:
                name = args.solo.upper()
                if name not in {n for _i, n in STEMS}:
                    raise SystemExit(f"unknown stem {args.solo!r}")
                out = os.path.join(args.out_dir, f"{pack}-{bpm}-solo-{name.lower()}.ogg")
                if mix(pack, bpm, {name: 1.0}, out, args.master):
                    written.append(out)
                continue

            states = STATES if args.state == "all" else (args.state,)
            for state in states:
                gains = {
                    name: meta["mix_matrix"][state][stem_id(index)] for index, name in STEMS
                }
                out = os.path.join(args.out_dir, f"{pack}-{bpm}-{state}.ogg")
                if mix(pack, bpm, gains, out, args.master):
                    written.append(out)

    for path in written:
        print(f"{os.path.getsize(path) // 1024:>5} KiB  {path}")
    print(f"\n{len(written)} previews in {args.out_dir}")


if __name__ == "__main__":
    main()
