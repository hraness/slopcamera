"""Write the original, deterministic 8-second 90 BPM soundtrack for many-heads.

No samples, network, or music model. Twelve beats (three 4/4 bars): a low drum
on every beat, a bronze gong on each downbeat, a drone in D, and small bells on
the off-beats that feed the treble band. Run from the repository root.
"""
from pathlib import Path
import math
import struct
import wave

RATE = 48000
DURATION = 8
BPM = 90
BEAT = 60 / BPM
TAU = math.tau
output = Path("artifacts/mythology-portfolio/audio/many-heads.wav")
output.parent.mkdir(parents=True, exist_ok=True)
bells = (74, 77, 81, 79, 74, 81, 77, 86, 81, 79, 77, 74)
freq = lambda note: 440 * 2 ** ((note - 69) / 12)
samples = bytearray()
peak = 0
for index in range(RATE * DURATION):
    t = index / RATE
    beat = int(t / BEAT)
    bt = t - beat * BEAT
    drone = (math.sin(TAU * 73.42 * t) + .5 * math.sin(TAU * 110.0 * t + .3) + .3 * math.sin(TAU * 146.83 * t)) * .05
    drone *= .75 + .25 * math.sin(TAU * t / (BEAT * 4))
    kick = math.sin(TAU * (48 * bt + 9 * (1 - math.exp(-bt * 30)))) * .32 * math.exp(-bt * 9)
    gong = 0.0
    if beat % 4 == 0:
        gong = sum(math.sin(TAU * f * bt) * a for f, a in ((196.0, .5), (293.7, .3), (415.3, .2), (587.3, .12))) * .16 * math.exp(-bt * 1.6)
    ht = bt - BEAT / 2
    bell = 0.0
    if ht >= 0:
        f = freq(bells[min(beat, 11)])
        bell = (math.sin(TAU * f * ht) + .3 * math.sin(TAU * f * 2.76 * ht)) * .085 * math.exp(-ht * 7) * min(1, ht / .003)
    fade = min(1, t / .01, (DURATION - t) / .25)
    left = (drone + kick + gong + bell) * fade
    right = (drone * .95 + kick + gong * .9 + bell * 1.1) * fade
    peak = max(peak, abs(left), abs(right))
    samples.extend(struct.pack('<hh', round(left * 32767), round(right * 32767)))
with wave.open(str(output), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(samples)
print(f"{output}: 8.000 s, stereo PCM16, {RATE} Hz, {BPM} BPM, peak {peak:.4f}, original procedural composition")
