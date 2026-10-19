"""Run every stem generator for both packs.

    python3 scripts/audio/gen/generate_all.py [arcade|zen]

Output goes to scripts/audio/midi/<pack>/<bpm>/STEM_0N_<NAME>.mid. Generators
are deterministic, so a rerun with no source change rewrites identical files.
"""

from __future__ import annotations

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

PACKS = ("arcade", "zen")


def _load(path: str):
    name = f"gen_{os.path.basename(os.path.dirname(path))}_{os.path.basename(path)[:-3]}"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def run(packs: tuple[str, ...] = PACKS) -> int:
    written = 0
    for pack in packs:
        pack_dir = os.path.join(HERE, pack)
        for filename in sorted(os.listdir(pack_dir)):
            if not filename.startswith("stem_") or not filename.endswith(".py"):
                continue
            module = _load(os.path.join(pack_dir, filename))
            print(f"{pack}/{filename}")
            module.main()
            written += 1
    return written


if __name__ == "__main__":
    requested = tuple(sys.argv[1:]) or PACKS
    unknown = [p for p in requested if p not in PACKS]
    if unknown:
        raise SystemExit(f"unknown pack(s): {', '.join(unknown)}")
    count = run(requested)
    print(f"\n{count} generators run")
