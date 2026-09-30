"""Original twelve-second scores. Requires Python 3 and NumPy; no samples or models.

Writes a fresh stereo 48 kHz PCM WAV and score/signal facts. This is composition
source, not an audio renderer provided by Slopcamera. Slopcamera retains and
mixes its output with the authored scene. Use --film to choose the score.
"""
import argparse
import json
from pathlib import Path
import wave

import numpy as np

RATE = 48000
DURATION = 12.0
N = int(RATE * DURATION)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--film", choices=["last-tram", "paper-ocean", "laundromat"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix(".json").exists():
        raise SystemExit("Choose a fresh output; existing audio and receipts are never overwritten.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20260930)
    signal = np.zeros((N, 2), dtype=np.float64)
    cues = []

    def add(samples, start, gain=1, pan=0, label=None):
        offset = round(start * RATE)
        if offset < 0 or offset >= N:
            raise ValueError("Score event outside film")
        length = min(len(samples), N - offset)
        stereo = np.array([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)])
        signal[offset:offset + length] += samples[:length, None] * stereo * gain
        if label:
            cues.append({"time": start, "event": label, "pan": pan})

    def note(midi, start, duration, gain, pan=0, timbre="felt"):
        t = np.arange(round(duration * RATE)) / RATE
        frequency = 440 * 2 ** ((midi - 69) / 12)
        attack = 1 - np.exp(-t / (.025 if timbre == "felt" else .006))
        if timbre == "pad":
            env = np.sin(np.pi * np.clip(t / duration, 0, 1)) ** 1.6
            s = (np.sin(2 * np.pi * frequency * t) + .17 * np.sin(2 * np.pi * frequency * 2.003 * t)
                 + .11 * np.sin(2 * np.pi * frequency * .998 * t)) * env
        elif timbre == "glass":
            s = sum(np.sin(2 * np.pi * frequency * ratio * t) * a * np.exp(-t / decay)
                    for ratio, a, decay in [(1, 1, 1.1), (2.01, .24, .55), (3.97, .065, .24)]) * attack
        elif timbre == "marimba":
            s = (np.sin(2 * np.pi * frequency * t) * np.exp(-t / .33)
                 + .22 * np.sin(2 * np.pi * frequency * 4 * t) * np.exp(-t / .05)) * attack
        elif timbre == "bass":
            s = (np.sin(2 * np.pi * frequency * t) + .14 * np.sin(2 * np.pi * frequency * 2 * t)) * attack * np.exp(-t / .26)
        else:
            s = sum(np.sin(2 * np.pi * frequency * harmonic * t) * amplitude * np.exp(-t / decay)
                    for harmonic, amplitude, decay in [(1, 1, 1.05), (2.002, .3, .58), (3.006, .12, .28), (4.008, .035, .12)]) * attack
        s *= np.minimum(1, np.maximum(0, (duration - t) / .08))
        add(s, start, gain, pan, f"{timbre} MIDI {midi}")

    def noise(start, duration, gain, pan=0, tone=31, label=None, envelope="hump"):
        t = np.arange(round(duration * RATE)) / RATE
        s = rng.standard_normal(len(t))
        s = np.convolve(s, np.ones(tone) / tone, mode="same")
        if envelope == "decay":
            env = (1 - np.exp(-t / .002)) * np.exp(-t / (duration / 4))
        else:
            env = np.sin(np.pi * t / duration) ** 2
        add(s * env, start, gain, pan, label)

    if args.film == "last-tram":
        # Slow D-minor ninths: quiet rain, destination bell, warm electric-piano
        # phrase, low mechanical departure, then a high suspended arrival.
        for start, chord in [(0, [38, 57, 60, 64]), (3, [41, 57, 60, 64]), (6, [34, 53, 57, 60]), (9, [38, 57, 62, 64])]:
            for index, midi in enumerate(chord):
                note(midi, start, min(3.5, 12 - start), .095 if index else .13, (index - 1.5) * .2, "pad")
        for start, midi, gain in [(1.5, 74, .22), (2.25, 69, .13), (3.75, 65, .19), (4.5, 64, .14), (5.25, 62, .17),
                                  (6.75, 69, .20), (7.5, 72, .16), (8.25, 74, .2), (9.75, 76, .12)]:
            note(midi, start, min(2.5, 12 - start), gain, -.16)
        for i in range(3):
            noise(0, 11.8, .20, [-.85, .8, 0][i], [19, 41, 97][i], "rain bed" if i == 0 else None)
        note(86, 1.55, 1.6, .13, .3, "glass")
        note(81, 1.79, 1.4, .07, .18, "glass")
        for i in range(20):
            noise(3.2 + i * .27, .07, .025 * (1 - i / 24), 0, 17, "wheel joint" if i == 0 else None, "decay")
        noise(3.1, 3.5, .15, -.1, 331, "traction swell")
        for j, midi in enumerate([74, 81, 86]):
            note(midi, 9.55 + j * .11, min(2.2, 12 - 9.55 - j * .11), .075, (j - 1) * .4, "glass")
        bpm = 80
    elif args.film == "paper-ocean":
        for start, chord in [(0, [48, 64, 67, 74]), (3, [45, 64, 67, 72]), (6, [41, 60, 64, 69]), (9, [48, 64, 67, 74])]:
            for i, midi in enumerate(chord):
                note(midi, start, min(3.5, 12 - start), .07, (i - 1.5) * .35, "pad")
        melody = [76, 79, 74, 72, 76, 74, 69, 72, 76, 79, 81, 79, 76, 74, 72]
        for i, midi in enumerate(melody):
            note(midi, 1.8 + i * .6, min(1.4, 10.2 - i * .6), .16 if i % 3 == 0 else .105, np.sin(i) * .4, "marimba")
        for start, pan in [(.72, -.4), (1.32, .4), (2.0, -.2), (2.6, .3)]:
            noise(start, .32, .27, pan, 11, "paper fold")
        for start, pan in [(3.2, -.7), (5.2, .7), (7.2, -.5), (9.2, .5)]:
            noise(start, 2.2, .13, pan, 101, "sea wash")
        noise(4.13, .55, .32, .35, 29, "whale leaves water")
        noise(7.53, .8, .36, -.25, 39, "whale returns")
        for j, midi in enumerate([79, 84, 88]):
            note(midi, 8.15 + j * .15, 2, .065, (j - 1) * .4, "glass")
        bpm = 100
    else:
        # A 120 BPM miniature with a swung offbeat and six bars of choreography.
        chords = [[53, 57, 60, 64], [50, 57, 60, 65], [55, 59, 62, 65]] * 2
        for bar, chord in enumerate(chords):
            start = bar * 2
            for beat in range(4):
                note(chord[0] - 12 + (7 if beat == 2 else 0), start + beat * .5, .44, .28, 0, "bass")
                for midi in chord[1:]:
                    note(midi + 12, start + beat * .5 + .30, min(.44, 12 - start - beat * .5 - .3), .07, -.2, "marimba")
                noise(start + beat * .5, .095, .14, .2, 9, "brush" if beat == 0 else None, "decay")
                if beat % 2:
                    noise(start + beat * .5, .14, .21, -.2, 3, "clap", "decay")
            for j, midi in enumerate([chord[1]+24, chord[2]+24, chord[3]+24]):
                at = start + [.0, .83, 1.5][j]
                note(midi, at, min(.46, 12 - at), .12, .2, "felt")
        bpm = 120

    # Sparse room reflections; no feedback loop, unbounded tail or random state.
    dry = signal.copy()
    for delay, amplitude in [(.073, .11), (.137, .075), (.241, .055), (.377, .035)]:
        samples = round(delay * RATE)
        signal[samples:] += dry[:-samples, ::-1] * amplitude
    fade_in = np.minimum(1, np.arange(N) / (RATE * .06))
    fade_out = np.minimum(1, (N - 1 - np.arange(N)) / (RATE * .7))
    signal *= (fade_in * fade_out)[:, None]
    peak = float(np.max(np.abs(signal)))
    signal *= 10 ** (-3 / 20) / peak
    pcm = np.rint(signal * 32767).astype("<i2")
    with args.output.open("xb") as raw:
        with wave.open(raw, "wb") as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes(pcm.tobytes())
    facts = {"film": args.film, "durationSeconds": DURATION, "sampleRate": RATE, "channels": 2,
             "bpm": bpm, "peakDbfs": float(20 * np.log10(np.max(np.abs(signal)))),
             "rmsDbfs": float(20 * np.log10(np.sqrt(np.mean(signal ** 2)))),
             "channelCorrelation": float(np.corrcoef(signal.T)[0, 1]), "firstSample": pcm[0].tolist(),
             "lastSample": pcm[-1].tolist(), "listened": False, "cues": cues,
             "provenance": "Original deterministic additive synthesis and seeded filtered noise. No samples, provider calls, or third-party music."}
    args.output.with_suffix(".json").write_text(json.dumps(facts, indent=2) + "\n")
    print(json.dumps({key: value for key, value in facts.items() if key != "cues"}))


if __name__ == "__main__":
    main()
