import argparse
import array
import math
import subprocess
import tempfile
import wave
from pathlib import Path


RATE = 48000
BEAT = 60 / 106
BAR = BEAT * 4
CHORDS = [
    (73.42, [146.83, 185.00, 220.00, 293.66]),
    (61.74, [123.47, 146.83, 185.00, 246.94]),
    (49.00, [98.00, 196.00, 246.94, 293.66]),
    (55.00, [110.00, 164.81, 220.00, 277.18]),
]


def write_mp3(path, duration, sample_at, bitrate):
    with tempfile.NamedTemporaryFile(suffix=".wav", dir=path.parent) as temp:
        with wave.open(temp.name, "wb") as out:
            out.setnchannels(2)
            out.setsampwidth(2)
            out.setframerate(RATE)
            block = array.array("h")
            for start in range(0, int(duration * RATE), 4096):
                del block[:]
                stop = min(start + 4096, int(duration * RATE))
                for i in range(start, stop):
                    t = i / RATE
                    left, right = sample_at(t)
                    block.append(max(-32767, min(32767, round(left * 32767))))
                    block.append(max(-32767, min(32767, round(right * 32767))))
                out.writeframesraw(block.tobytes())
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", temp.name, "-c:a", "libmp3lame", "-b:a", bitrate, str(path)],
            check=True,
        )


def music_sample(t, duration):
    bar_index = int(t / BAR)
    root, notes = CHORDS[bar_index % len(CHORDS)]
    local = t % BAR
    attack = min(1.0, local / 0.34)
    envelope = 0.68 + 0.32 * attack
    pad = sum(math.sin(2 * math.pi * hz * t) + 0.16 * math.sin(4 * math.pi * hz * t) for hz in notes) / len(notes)
    beat_phase = t % BEAT
    bass = math.sin(2 * math.pi * root * t) * math.exp(-beat_phase * 10)
    pluck_note = notes[int((t / BEAT) % 4)] * 2
    pluck = math.sin(2 * math.pi * pluck_note * t) * math.exp(-beat_phase * 16)
    fade = min(1.0, max(0.0, (duration - t) / 2.0))
    fade = fade * fade * (3 - 2 * fade)
    left = (0.16 * pad * envelope + 0.075 * bass + 0.035 * pluck) * fade
    right = (0.15 * pad * envelope + 0.068 * bass + 0.042 * pluck) * fade
    return left, right


def cue_sample(kind, duration):
    def sample(t):
        if t >= duration:
            return 0.0, 0.0
        if kind == "tap":
            decay = math.exp(-t * 85)
            value = (math.sin(2 * math.pi * 1850 * t) * 0.12 + math.sin(2 * math.pi * 620 * t) * 0.055) * decay
        elif kind == "card-lock":
            decay = math.exp(-t * 32)
            value = (math.sin(2 * math.pi * 510 * t) * 0.10 + math.sin(2 * math.pi * 920 * t) * 0.04) * decay
        else:
            decay = math.exp(-t * 20)
            value = (math.sin(2 * math.pi * 880 * t) * 0.085 + math.sin(2 * math.pi * 1320 * t) * 0.035) * decay
        return value, value * 0.94
    return sample


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=74.25)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "assets/audio")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    write_mp3(args.output / "quiet-synth.mp3", args.duration, lambda t: music_sample(t, args.duration), "128k")
    write_mp3(args.output / "voiceover-placeholder.mp3", args.duration, lambda t: (0.0, 0.0), "24k")
    for name, duration in [("tap", 0.12), ("card-lock", 0.20), ("coin", 0.26)]:
        write_mp3(args.output / f"{name}.mp3", duration, cue_sample(name, duration), "96k")


if __name__ == "__main__":
    main()
