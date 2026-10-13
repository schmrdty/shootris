"""Write the per-pack metadata JSON that both the engine and the tests read.

    python3 scripts/audio/gen/build_metadata.py

Loop geometry, the mixing matrix, the allowed scales and the per-stem validation
rules all come from common.py, so the MIDI, the metadata and the TypeScript mix
cannot drift apart. The encoded-format measurements are filled in later by
render.py, which is the only step that can know them.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F403

# Browser formats in preference order. Ogg Opus is sample-exact (its pre-skip
# is in the header and decoders are required to drop it) and roughly half the
# size; AAC in MP4 is the fallback for Safari builds whose decodeAudioData
# still refuses Opus.
FORMATS = [
    {
        "id": "opus",
        "ext": "ogg",
        "mime": "audio/ogg; codecs=opus",
        "codec": "opus",
        "bitrate_kbps": 80,
        "decode_offset_samples": 0,
        "decoded_length_samples": {},
    },
    {
        "id": "aac",
        "ext": "m4a",
        "mime": 'audio/mp4; codecs="mp4a.40.2"',
        "codec": "aac",
        "bitrate_kbps": 96,
        "decode_offset_samples": 0,
        "decoded_length_samples": {},
    },
]

ARCADE_STEM_META = {
    1: {
        "role": "sub bass, synth bass, rhythmic pulse",
        "scales": ["a_natural_minor"],
    },
    2: {
        "role": "electronic drums; complexity rises with the BPM tier",
        "scales": [],
    },
    3: {
        "role": "electronic ambience, filtered space effects",
        "scales": ["a_natural_minor"],
    },
    4: {
        "role": "arpeggiators and short synth plucks — movement",
        "scales": [],
        "follows_harmony": True,
    },
    5: {
        "role": "pads and atmospheric synths — harmonic continuity",
        "scales": [],
        "follows_harmony": True,
    },
    6: {
        "role": "the main Shootris melody, sparse and never continuous",
        "scales": ["a_natural_minor"],
        "phrase_rules": {
            "max_phrase_notes": 6,
            "min_bars_between_phrases": 4,
            "phrase_gap_beats": 1.5,
        },
    },
    7: {
        "role": "dark synth pulse, filtered distortion, fast hats — urgency",
        "scales": ["a_natural_minor"],
    },
    8: {
        "role": "warm pads, major-colour inversions, soft release — relief",
        "scales": [],
        "follows_harmony": True,
    },
}

ZEN_STEM_META = {
    1: {
        "role": "warm sub, tape bass, finger bass at 50-150 Hz — the anchor",
        "scales": ["a_natural_minor"],
    },
    2: {
        "role": "boom-bap kick, dusty snare, soft hats",
        "scales": [],
    },
    3: {
        "role": "vinyl crackle, tape noise, room textures at very low volume",
        "scales": ["a_natural_minor"],
    },
    4: {
        "role": "koto, pipa and guzheng-inspired plucks",
        "scales": ["a_minor_pentatonic"],
        "phrase_rules": {"max_phrase_notes": 5, "phrase_gap_beats": 1.0},
    },
    5: {
        "role": "Rhodes, electric piano, tape-warm keys",
        "scales": [],
        "follows_harmony": True,
    },
    6: {
        "role": "the Mitty melody — sparse, rare, a reward",
        "scales": ["a_minor_pentatonic", "a_hirajoshi"],
        "phrase_rules": {
            "max_phrase_notes": 5,
            "min_bars_between_phrases": 8,
            "phrase_gap_beats": 2.0,
        },
    },
    7: {
        "role": "danger by subtraction: lower bass octave, filtered drone, sparse percussion",
        "scales": ["a_natural_minor"],
    },
    8: {
        "role": "wind bells, soft inversion chord, short plucked flourish",
        "scales": ["a_minor_pentatonic"],
    },
}

PACK_CONFIG = {
    "arcade": {
        "display_name": "Arcade",
        "key": "A minor",
        "bpm_tiers": list(ARCADE_BPM_TIERS),
        "harmony": list(ARCADE_HARMONY),
        "scales": ["a_natural_minor"],
        "stem_meta": ARCADE_STEM_META,
    },
    "zen": {
        "display_name": "Midnight Tea House",
        "codename": "mitty",
        "key": "A minor",
        "bpm_tiers": [ZEN_BPM],
        "harmony": list(ZEN_HARMONY),
        "scales": ["a_natural_minor", "a_minor_pentatonic", "a_hirajoshi"],
        "stem_meta": ZEN_STEM_META,
    },
}


def build(pack: str) -> dict:
    config = PACK_CONFIG[pack]
    tiers = config["bpm_tiers"]

    loops = {}
    for bpm in tiers:
        samples = loop_samples(bpm)
        loops[str(bpm)] = {
            "bpm": bpm,
            "bar_seconds": bar_seconds(bpm),
            "loop_seconds": samples / SAMPLE_RATE,
            "loop_samples": samples,
            "url_dir": f"/music/{pack}/{bpm}",
        }

    stems = []
    for index, name in STEMS:
        meta = config["stem_meta"][index]
        entry = {
            "id": stem_id(index),
            "name": name,
            "index": index,
            "role": meta["role"],
            "always_active": always_active(index),
            "audible_in_calm": audible_in_calm(index),
            "url_template": f"/music/{pack}/{{bpm}}/{stem_filename(index, name, '{ext}')}",
            "scales": meta.get("scales", []),
        }
        if meta.get("follows_harmony"):
            entry["follows_harmony"] = True
        if meta.get("phrase_rules"):
            entry["phrase_rules"] = meta["phrase_rules"]
        stems.append(entry)

    return {
        "schema_version": 1,
        "pack": pack,
        "display_name": config["display_name"],
        **({"codename": config["codename"]} if "codename" in config else {}),
        "key": config["key"],
        "scales": {name: SCALES[name] for name in config["scales"]},
        "bpm_tiers": tiers,
        "bars_per_loop": BARS_PER_LOOP,
        "time_signature": list(TIME_SIGNATURE),
        "sample_rate": SAMPLE_RATE,
        "harmony": config["harmony"],
        "loops": loops,
        "formats": [dict(f) for f in FORMATS],
        "stems": stems,
        "states": list(STATES),
        "mix_matrix": {
            state: {stem_id(index): MIX_MATRIX[state][index - 1] for index, _ in STEMS}
            for state in STATES
        },
    }


def main() -> None:
    os.makedirs(METADATA_DIR, exist_ok=True)
    for pack in PACK_CONFIG:
        path = os.path.join(METADATA_DIR, f"{pack}.json")
        # Keep any format measurements render.py has already written.
        existing_formats = {}
        if os.path.exists(path):
            with open(path) as handle:
                for entry in json.load(handle).get("formats", []):
                    existing_formats[entry["id"]] = entry
        document = build(pack)
        for entry in document["formats"]:
            previous = existing_formats.get(entry["id"])
            if previous:
                entry["decode_offset_samples"] = previous.get("decode_offset_samples", 0)
                entry["decoded_length_samples"] = previous.get("decoded_length_samples", {})
        with open(path, "w") as handle:
            json.dump(document, handle, indent=2)
            handle.write("\n")
        print(path)


if __name__ == "__main__":
    main()
