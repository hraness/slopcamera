"""Write the film's original stereo score and sound design with Python stdlib.

No sampled recordings or provider calls. Rain is filtered seeded noise, metal
clicks and droplets are decaying resonators, and the score is a restrained Fmaj9
to Dm9 texture. Output is a 48 kHz PCM16 WAV with a measured peak report.
"""
from array import array
from pathlib import Path
import argparse
import json
import math
import random
import sys
import wave

RATE = 48000
DURATION = 14
TAU = math.tau


def smooth(x):
    x = min(1, max(0, x))
    return x * x * (3 - 2 * x)


def bell(t, start, frequency, duration, amplitude):
    u = t - start
    if u < 0 or u > duration:
        return 0
    attack = min(1, u / .003)
    return amplitude * attack * (math.sin(TAU * frequency * u) * math.exp(-u * 3.8)
        + .21 * math.sin(TAU * frequency * 2.76 * u) * math.exp(-u * 7)
        + .045 * math.sin(TAU * frequency * 5.12 * u) * math.exp(-u * 15))


def compose(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise ValueError("Choose a fresh soundtrack output; prior takes are preserved")
    rng = random.Random(719)
    frames = array("h")
    peak, energy = 0, 0
    low_l = low_r = rain_l = rain_r = 0
    bells = [(2.54, 698.46, .09, -.25), (6.02, 880, .065, .25),
             (10.25, 523.25, .09, -.1), (10.42, 783.99, .07, .2), (12.70, 1046.5, .035, 0)]
    for index in range(RATE * DURATION):
        t = index / RATE
        left_noise, right_noise = rng.uniform(-1, 1), rng.uniform(-1, 1)
        low_l += .006 * (left_noise - low_l)
        low_r += .006 * (right_noise - low_r)
        rain_l += .10 * (left_noise - rain_l)
        rain_r += .10 * (right_noise - rain_r)
        rain_envelope = smooth((t - 3.2) / 1.2) * (1 - smooth((t - 10) / 2.5))
        rain = .11 * rain_envelope
        rumble_envelope = max(0, min(1, (t - 7.27) / .12)) * math.exp(-max(0, t - 7.4) * 1.4)
        rumble = .32 * rumble_envelope
        drone_envelope = smooth(t / 1.7) * (1 - smooth((t - 11.7) / 2.3))
        chord = [174.614, 261.626, 329.628, 391.995] if t < 6 else [146.832, 220, 261.626, 329.628]
        # Distinct soft attacks avoid a hard harmonic jump at the camera cut.
        transition = 1 if t < 5.5 or t > 6.4 else (smooth((6 - t) / .5) if t < 6 else smooth((t - 6) / .4))
        pad_l = pad_r = 0
        for n, frequency in enumerate(chord):
            breath = .8 + .2 * math.sin(TAU * .17 * t + n)
            pad_l += .018 * breath * math.sin(TAU * frequency * t + .1 * math.sin(TAU * .28 * t))
            pad_r += .018 * breath * math.sin(TAU * frequency * 1.0003 * t + .1 * math.sin(TAU * .23 * t))
        left = pad_l * drone_envelope * transition + rain * rain_l + rumble * low_l
        right = pad_r * drone_envelope * transition + rain * rain_r + rumble * low_r
        for start, frequency, amplitude, pan in bells:
            note = bell(t, start, frequency, 2.7, amplitude)
            # A quiet fixed echo adds space without smearing the cut.
            note += .16 * bell(t, start + .14, frequency, 2.7, amplitude)
            left += note * (1 - pan)
            right += note * (1 + pan)
        for start in (1.12, 1.22):
            u = t - start
            if 0 <= u < .10:
                click = .06 * (math.sin(TAU * 2400 * u) + .40 * left_noise) * math.exp(-u * 120) * min(1, u / .001)
                left += click
                right += click * .87
        # A sub-bass pitch fall carries the enclosed thunder without clipping.
        u = t - 7.31
        if 0 < u < 2.3:
            thunder = .075 * math.sin(TAU * (52 * u + 4 * (1 - math.exp(-u * 8)))) * math.exp(-u * 2) * smooth(u / .08)
            left += thunder
            right += thunder
        fade = smooth(t / .035) * (1 - smooth((t - 13.75) / .25))
        left, right = left * fade, right * fade
        peak = max(peak, abs(left), abs(right))
        energy += left * left + right * right
        frames.extend((round(left * 32767), round(right * 32767)))
    if sys.byteorder != "little":
        frames.byteswap()
    with wave.open(str(output), "wb") as stream:
        stream.setnchannels(2)
        stream.setsampwidth(2)
        stream.setframerate(RATE)
        stream.writeframes(frames.tobytes())
    report = {"durationSeconds": DURATION, "sampleRate": RATE, "channels": 2,
              "peakDbFS": round(20 * math.log10(peak), 3),
              "rmsDbFS": round(10 * math.log10(energy / (RATE * DURATION * 2)), 3),
              "source": "original deterministic procedural composition", "listening": "pending"}
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(output), **report}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    compose(parser.parse_args().output)
