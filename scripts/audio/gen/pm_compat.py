"""pretty_midi, or a dependency-free stand-in for the subset we use.

Every generator and test imports its MIDI classes from here rather than from
``pretty_midi`` directly. When the real package is installed this module is a
thin re-export and nothing changes. When it is not — this repo's build
container has no PyPI access — the classes below provide the same API over a
small Standard MIDI File reader/writer written against the SMF spec.

The supported surface is exactly what the Shootris stems need: format 1 files,
one tempo, 4/4, note on/off, program change, control change, and a drum track
on channel 10. Note times are in seconds, as in pretty_midi.
"""

from __future__ import annotations

try:  # pragma: no cover - depends on the environment, not on our code
    from pretty_midi import (  # type: ignore
        PrettyMIDI,
        Instrument,
        Note,
        TimeSignature,
        ControlChange,
        instrument_name_to_program,
        note_name_to_number,
        note_number_to_name,
    )

    USING_REAL_PRETTY_MIDI = True

except ImportError:  # the stand-in
    USING_REAL_PRETTY_MIDI = False

    import struct

    DEFAULT_RESOLUTION = 480
    DRUM_CHANNEL = 9  # MIDI channel 10, one-indexed

    # General MIDI program names, index == program number.
    GM_INSTRUMENTS = [
        "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano",
        "Honky-tonk Piano", "Electric Piano 1", "Electric Piano 2", "Harpsichord",
        "Clavinet", "Celesta", "Glockenspiel", "Music Box", "Vibraphone",
        "Marimba", "Xylophone", "Tubular Bells", "Dulcimer", "Drawbar Organ",
        "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ",
        "Accordion", "Harmonica", "Tango Accordion", "Acoustic Guitar (nylon)",
        "Acoustic Guitar (steel)", "Electric Guitar (jazz)",
        "Electric Guitar (clean)", "Electric Guitar (muted)", "Overdriven Guitar",
        "Distortion Guitar", "Guitar Harmonics", "Acoustic Bass",
        "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
        "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2", "Violin",
        "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings",
        "Orchestral Harp", "Timpani", "String Ensemble 1", "String Ensemble 2",
        "Synth Strings 1", "Synth Strings 2", "Choir Aahs", "Voice Oohs",
        "Synth Choir", "Orchestra Hit", "Trumpet", "Trombone", "Tuba",
        "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1",
        "Synth Brass 2", "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax",
        "Oboe", "English Horn", "Bassoon", "Clarinet", "Piccolo", "Flute",
        "Recorder", "Pan Flute", "Blown bottle", "Shakuhachi", "Whistle",
        "Ocarina", "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)",
        "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)",
        "Lead 8 (bass + lead)", "Pad 1 (new age)", "Pad 2 (warm)",
        "Pad 3 (polysynth)", "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)",
        "Pad 7 (halo)", "Pad 8 (sweep)", "FX 1 (rain)", "FX 2 (soundtrack)",
        "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)",
        "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)", "Sitar", "Banjo",
        "Shamisen", "Koto", "Kalimba", "Bag pipe", "Fiddle", "Shanai",
        "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum",
        "Melodic Tom", "Synth Drum", "Reverse Cymbal", "Guitar Fret Noise",
        "Breath Noise", "Seashore", "Bird Tweet", "Telephone Ring", "Helicopter",
        "Applause", "Gunshot",
    ]

    _PROGRAM_BY_NAME = {n.lower(): i for i, n in enumerate(GM_INSTRUMENTS)}
    _PITCH_CLASS = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
    _CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    def instrument_name_to_program(name: str) -> int:
        """GM program number for a General MIDI instrument name."""
        try:
            return _PROGRAM_BY_NAME[name.lower()]
        except KeyError:
            raise ValueError(f"{name!r} is not a General MIDI instrument name")

    def note_name_to_number(note_name: str) -> int:
        """'A3' / 'C#4' / 'Eb2' -> MIDI note number (C-1 == 0, as in pretty_midi)."""
        text = note_name.strip()
        letter = text[0].lower()
        if letter not in _PITCH_CLASS:
            raise ValueError(f"{note_name!r} is not a note name")
        value = _PITCH_CLASS[letter]
        i = 1
        while i < len(text) and text[i] in "#b":
            value += 1 if text[i] == "#" else -1
            i += 1
        if i >= len(text):
            raise ValueError(f"{note_name!r} has no octave")
        octave = int(text[i:])
        return value + 12 * (octave + 1)

    def note_number_to_name(note_number: int) -> str:
        """MIDI note number -> name, e.g. 57 -> 'A3'."""
        n = int(note_number)
        return f"{_CLASS_NAMES[n % 12]}{n // 12 - 1}"

    class Note:
        """A note with start/end in seconds."""

        __slots__ = ("velocity", "pitch", "start", "end")

        def __init__(self, velocity: int, pitch: int, start: float, end: float):
            self.velocity = int(velocity)
            self.pitch = int(pitch)
            self.start = float(start)
            self.end = float(end)

        @property
        def duration(self) -> float:
            return self.end - self.start

        def __repr__(self) -> str:
            return (
                f"Note(start={self.start:.4f}, end={self.end:.4f}, "
                f"pitch={self.pitch}, velocity={self.velocity})"
            )

    class ControlChange:
        __slots__ = ("number", "value", "time")

        def __init__(self, number: int, value: int, time: float):
            self.number = int(number)
            self.value = int(value)
            self.time = float(time)

        def __repr__(self) -> str:
            return f"ControlChange(number={self.number}, value={self.value}, time={self.time:.4f})"

    class TimeSignature:
        __slots__ = ("numerator", "denominator", "time")

        def __init__(self, numerator: int, denominator: int, time: float):
            self.numerator = int(numerator)
            self.denominator = int(denominator)
            self.time = float(time)

        def __repr__(self) -> str:
            return f"TimeSignature({self.numerator}/{self.denominator} at {self.time:.4f})"

    class Instrument:
        """One voice: its notes, its GM program, and whether it is a drum kit."""

        def __init__(self, program: int = 0, is_drum: bool = False, name: str = ""):
            self.program = int(program)
            self.is_drum = bool(is_drum)
            self.name = name
            self.notes: list[Note] = []
            self.control_changes: list[ControlChange] = []
            self.pitch_bends: list = []

        def get_end_time(self) -> float:
            return max((n.end for n in self.notes), default=0.0)

        def __repr__(self) -> str:
            return (
                f"Instrument(name={self.name!r}, program={self.program}, "
                f"is_drum={self.is_drum}, notes={len(self.notes)})"
            )

    def _varint(value: int) -> bytes:
        if value < 0:
            raise ValueError("variable-length quantities cannot be negative")
        out = bytearray([value & 0x7F])
        value >>= 7
        while value:
            out.append((value & 0x7F) | 0x80)
            value >>= 7
        return bytes(reversed(out))

    def _read_varint(data: bytes, pos: int) -> tuple[int, int]:
        value = 0
        while True:
            byte = data[pos]
            pos += 1
            value = (value << 7) | (byte & 0x7F)
            if not byte & 0x80:
                return value, pos

    def _chunk(tag: bytes, body: bytes) -> bytes:
        return tag + struct.pack(">I", len(body)) + body

    class PrettyMIDI:
        """A MIDI file as instruments holding notes timed in seconds."""

        def __init__(
            self,
            midi_file: str | None = None,
            resolution: int = DEFAULT_RESOLUTION,
            initial_tempo: float = 120.0,
        ):
            self.resolution = int(resolution)
            self.instruments: list[Instrument] = []
            self.time_signature_changes: list[TimeSignature] = []
            self.key_signature_changes: list = []
            self.lyrics: list = []
            self.text_events: list = []
            self._tempo_changes: list[tuple[float, float]] = [(0.0, float(initial_tempo))]
            if midi_file is not None:
                self._load(midi_file)

        # --- tempo -------------------------------------------------------
        def get_tempo_changes(self) -> tuple[list[float], list[float]]:
            times = [t for t, _ in self._tempo_changes]
            tempi = [bpm for _, bpm in self._tempo_changes]
            return times, tempi

        @property
        def initial_tempo(self) -> float:
            return self._tempo_changes[0][1]

        def get_end_time(self) -> float:
            ends = [i.get_end_time() for i in self.instruments]
            ends += [c.time for i in self.instruments for c in i.control_changes]
            return max(ends, default=0.0)

        # --- writing -----------------------------------------------------
        def write(self, path: str) -> None:
            """Write a format 1 Standard MIDI File."""
            spb = 60.0 / self._tempo_changes[0][1]  # seconds per beat
            tick = spb / self.resolution

            def to_ticks(seconds: float) -> int:
                return int(round(seconds / tick))

            # Track 0: the conductor track (tempo + time signature).
            conductor: list[tuple[int, int, bytes]] = []
            micros = int(round(60_000_000.0 / self._tempo_changes[0][1]))
            conductor.append(
                (0, 0, b"\xff\x51\x03" + micros.to_bytes(3, "big"))
            )
            signatures = self.time_signature_changes or [TimeSignature(4, 4, 0.0)]
            for sig in signatures:
                denom_power = max(0, (sig.denominator).bit_length() - 1)
                conductor.append(
                    (
                        to_ticks(sig.time),
                        0,
                        bytes([0xFF, 0x58, 0x04, sig.numerator, denom_power, 24, 8]),
                    )
                )
            tracks = [self._encode_track(conductor)]

            channel_pool = [c for c in range(16) if c != DRUM_CHANNEL]
            next_channel = 0
            for inst in self.instruments:
                if inst.is_drum:
                    channel = DRUM_CHANNEL
                else:
                    channel = channel_pool[next_channel % len(channel_pool)]
                    next_channel += 1

                # (tick, priority, bytes) — priority keeps note-offs ahead of
                # note-ons at the same tick so a repeated pitch retriggers.
                events: list[tuple[int, int, bytes]] = []
                if inst.name:
                    events.append((0, 0, b"\xff\x03" + _varint(len(inst.name.encode())) + inst.name.encode()))
                events.append((0, 1, bytes([0xC0 | channel, inst.program & 0x7F])))
                for cc in inst.control_changes:
                    events.append(
                        (to_ticks(cc.time), 2, bytes([0xB0 | channel, cc.number & 0x7F, cc.value & 0x7F]))
                    )
                for note in inst.notes:
                    start = to_ticks(note.start)
                    end = max(start + 1, to_ticks(note.end))
                    events.append((end, 3, bytes([0x80 | channel, note.pitch & 0x7F, 0])))
                    events.append(
                        (start, 4, bytes([0x90 | channel, note.pitch & 0x7F, max(1, note.velocity) & 0x7F]))
                    )
                tracks.append(self._encode_track(events))

            header = _chunk(b"MThd", struct.pack(">HHH", 1, len(tracks), self.resolution))
            with open(path, "wb") as handle:
                handle.write(header)
                for track in tracks:
                    handle.write(track)

        @staticmethod
        def _encode_track(events: list[tuple[int, int, bytes]]) -> bytes:
            events = sorted(events, key=lambda e: (e[0], e[1]))
            body = bytearray()
            last = 0
            for tick, _priority, payload in events:
                body += _varint(tick - last)
                body += payload
                last = tick
            body += _varint(0) + b"\xff\x2f\x00"
            return _chunk(b"MTrk", bytes(body))

        # --- reading -----------------------------------------------------
        def _load(self, path: str) -> None:
            with open(path, "rb") as handle:
                data = handle.read()
            if data[:4] != b"MThd":
                raise ValueError(f"{path} is not a MIDI file")
            (_fmt, ntrks, division) = struct.unpack(">HHH", data[8:14])
            if division & 0x8000:
                raise ValueError("SMPTE time division is not supported")
            self.resolution = division
            pos = 8 + struct.unpack(">I", data[4:8])[0]

            raw_tracks: list[list[tuple[int, bytes]]] = []
            for _ in range(ntrks):
                if data[pos : pos + 4] != b"MTrk":
                    raise ValueError("expected an MTrk chunk")
                length = struct.unpack(">I", data[pos + 4 : pos + 8])[0]
                raw_tracks.append(self._parse_track(data[pos + 8 : pos + 8 + length]))
                pos += 8 + length

            # Tempo map first: every tick -> seconds conversion depends on it.
            tempo_ticks: list[tuple[int, float]] = []
            for track in raw_tracks:
                for tick, payload in track:
                    if payload[:2] == b"\xff\x51":
                        micros = int.from_bytes(payload[3:6], "big")
                        tempo_ticks.append((tick, 60_000_000.0 / micros))
            tempo_ticks.sort()
            if not tempo_ticks or tempo_ticks[0][0] != 0:
                tempo_ticks.insert(0, (0, 120.0))
            # Deduplicate, keeping the last tempo set at each tick.
            deduped: dict[int, float] = {}
            for tick, bpm in tempo_ticks:
                deduped[tick] = bpm
            tempo_ticks = sorted(deduped.items())

            anchors: list[tuple[int, float, float]] = []  # tick, seconds, sec/tick
            seconds = 0.0
            for index, (tick, bpm) in enumerate(tempo_ticks):
                if index:
                    prev_tick, _prev_sec, prev_rate = anchors[-1]
                    seconds += (tick - prev_tick) * prev_rate
                anchors.append((tick, seconds, (60.0 / bpm) / self.resolution))
            self._tempo_changes = [(sec, bpm) for (_t, sec, _r), (_tt, bpm) in zip(anchors, tempo_ticks)]

            def to_seconds(tick: int) -> float:
                anchor = anchors[0]
                for candidate in anchors:
                    if candidate[0] <= tick:
                        anchor = candidate
                    else:
                        break
                return anchor[1] + (tick - anchor[0]) * anchor[2]

            for track in raw_tracks:
                name = ""
                program_by_channel: dict[int, int] = {}
                open_notes: dict[tuple[int, int], list[tuple[int, int]]] = {}
                notes: list[tuple[int, Note]] = []
                controls: list[ControlChange] = []
                channels_used: set[int] = set()
                for tick, payload in track:
                    status = payload[0]
                    if status == 0xFF:
                        if payload[1] == 0x03:
                            _length, offset = _read_varint(payload, 2)
                            name = payload[offset:].decode("latin-1")
                        elif payload[1] == 0x58:
                            self.time_signature_changes.append(
                                TimeSignature(payload[3], 1 << payload[4], to_seconds(tick))
                            )
                        continue
                    kind = status & 0xF0
                    channel = status & 0x0F
                    if kind == 0xC0:
                        program_by_channel[channel] = payload[1]
                    elif kind == 0xB0:
                        controls.append(ControlChange(payload[1], payload[2], to_seconds(tick)))
                        channels_used.add(channel)
                    elif kind == 0x90 and payload[2] > 0:
                        open_notes.setdefault((channel, payload[1]), []).append((tick, payload[2]))
                        channels_used.add(channel)
                    elif kind == 0x80 or (kind == 0x90 and payload[2] == 0):
                        pending = open_notes.get((channel, payload[1]))
                        if pending:
                            start_tick, velocity = pending.pop(0)
                            notes.append(
                                (
                                    channel,
                                    Note(velocity, payload[1], to_seconds(start_tick), to_seconds(tick)),
                                )
                            )
                if not notes and not controls:
                    continue
                for channel in sorted(channels_used):
                    channel_notes = [n for ch, n in notes if ch == channel]
                    if not channel_notes and channel != min(channels_used):
                        continue
                    inst = Instrument(
                        program=program_by_channel.get(channel, 0),
                        is_drum=channel == DRUM_CHANNEL,
                        name=name,
                    )
                    inst.notes = sorted(channel_notes, key=lambda n: (n.start, n.pitch))
                    if channel == min(channels_used):
                        inst.control_changes = controls
                    self.instruments.append(inst)

        @staticmethod
        def _parse_track(body: bytes) -> list[tuple[int, bytes]]:
            events: list[tuple[int, bytes]] = []
            pos = 0
            tick = 0
            running_status = 0
            size = len(body)
            while pos < size:
                delta, pos = _read_varint(body, pos)
                tick += delta
                status = body[pos]
                if status < 0x80:
                    status = running_status  # running status: reuse the last one
                else:
                    pos += 1
                if status == 0xFF:
                    meta_type = body[pos]
                    length, after = _read_varint(body, pos + 1)
                    payload = bytes([0xFF, meta_type]) + _varint(length) + body[after : after + length]
                    pos = after + length
                    events.append((tick, payload))
                    if meta_type == 0x2F:
                        break
                elif status in (0xF0, 0xF7):
                    length, after = _read_varint(body, pos)
                    pos = after + length
                else:
                    running_status = status
                    kind = status & 0xF0
                    nbytes = 1 if kind in (0xC0, 0xD0) else 2
                    payload = bytes([status]) + body[pos : pos + nbytes]
                    pos += nbytes
                    events.append((tick, payload))
            return events


__all__ = [
    "PrettyMIDI",
    "Instrument",
    "Note",
    "TimeSignature",
    "ControlChange",
    "instrument_name_to_program",
    "note_name_to_number",
    "note_number_to_name",
    "USING_REAL_PRETTY_MIDI",
]
