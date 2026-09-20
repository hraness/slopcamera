"""Write an original, deterministic 8-second 120 BPM soundtrack.

No samples, external assets, network or music model. Four bars: Cmaj7, Am7,
Fmaj7, G7. A small mallet phrase and restrained kick/hat keep beat zero clear.
Run from the repository root before rendering island-pulse.json.
"""
from pathlib import Path
import math
import struct
import wave

RATE = 48000
DURATION = 8
TAU = math.tau
output = Path("artifacts/showcase/html/island-pulse.wav")
output.parent.mkdir(parents=True, exist_ok=True)
chords = ((48, 55, 59, 64), (45, 52, 55, 60), (41, 48, 52, 57), (43, 50, 53, 59))
melody = (72, 76, 79, 76, 69, 72, 76, 72, 69, 72, 77, 76, 74, 71, 67, 72)
frequency = lambda note: 440 * 2 ** ((note - 69) / 12)
samples = bytearray()
peak = 0
for index in range(RATE * DURATION):
    t = index / RATE
    beat = int(t * 2)
    beat_time = t - beat * .5
    bar = min(3, beat // 4)
    chord_time = t - bar * 2
    # Equal attack/release edges avoid clicks while retaining distinct bars.
    pad_envelope = min(1, chord_time / .025) * min(1, (2 - chord_time) / .12)
    pad = sum(math.sin(TAU * frequency(n) * t) for n in chords[bar]) * .038 * pad_envelope
    note = frequency(melody[min(15, beat)])
    mallet = (math.sin(TAU * note * beat_time) + .22 * math.sin(TAU * note * 3 * beat_time))
    mallet *= .19 * math.exp(-beat_time * 12) * min(1, beat_time / .004)
    kick_phase = TAU * (46 * beat_time + 8 * (1 - math.exp(-beat_time * 35)))
    kick = math.sin(kick_phase) * .24 * math.exp(-beat_time * 26)
    # Deterministic oscillator-based hat; no mutable random generator.
    half = (t + .25) % .5
    hat = (math.sin(TAU * 6173 * t) + math.sin(TAU * 8231 * t)) * .015 * math.exp(-half * 75)
    end_fade = min(1, t / .008, (DURATION - t) / .12)
    left = (pad + mallet + kick + hat) * end_fade
    right = (pad + mallet * .96 + kick + hat * .75) * end_fade
    peak = max(peak, abs(left), abs(right))
    samples.extend(struct.pack('<hh', round(left * 32767), round(right * 32767)))
with wave.open(str(output), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(samples)
print(f"{output}: 8.000 s, stereo PCM16, 48000 Hz, peak {peak:.4f}, original procedural composition")
