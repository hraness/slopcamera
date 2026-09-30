"""Original 12-second swung miniature; deterministic synthesis, no recordings/models.
The lead uses exactly the same odd-partial equation and entrances as scene.html.
The plot describes that oscillator; bass, piano stabs and brushes accompany it.
"""
import argparse
import json
from pathlib import Path
import wave
import numpy as np

RATE = 48000
DURATION = 12.0
BPM = 120
ODD = np.array([1, 3, 5, 7, 9], dtype=np.float64)


def ease(x):
    x = np.clip(x, 0, 1)
    return x*x*(3-2*x)


def partial_weight(t, index):
    return np.ones_like(t) if index == 0 else ease((t-index*2)/.32)


def lead_oscillator(theta, global_time):
    """Unit plateau convention, not peak normalization: preserve Gibbs overshoot."""
    return 4/np.pi*sum(partial_weight(global_time, i)*np.sin(n*theta)/n for i, n in enumerate(ODD))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix('.json').exists():
        raise SystemExit('Choose a fresh output; source audio and receipts are immutable.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = round(RATE*DURATION)
    mix = np.zeros((count, 2), dtype=np.float64)
    rng = np.random.default_rng(20260930)
    cues = []

    def add(signal, start, gain, pan, label):
        offset = round(start*RATE)
        if offset < 0 or offset >= count:
            raise ValueError('Event outside film.')
        n = min(len(signal), count-offset)
        stereo = np.sqrt([(1-pan)/2, (1+pan)/2])
        mix[offset:offset+n] += signal[:n, None]*stereo*gain
        cues.append({'time': start, 'event': label, 'pan': pan})

    def note(midi, start, duration, gain, timbre='lead', pan=0):
        t = np.arange(round(duration*RATE))/RATE
        frequency = 440*2**((midi-69)/12)
        theta = 2*np.pi*frequency*t
        attack = 1-np.exp(-t/.007)
        release = np.minimum(1, np.maximum(0, (duration-t)/.06))
        if timbre == 'lead':
            signal = lead_oscillator(theta, t+start)*attack*np.exp(-t/1.25)*release
        elif timbre == 'bass':
            signal = (np.sin(theta)+.18*np.sin(2*theta)+.07*np.sin(3*theta))*attack*np.exp(-t/.20)*release
        else:
            signal = (np.sin(theta)+.25*np.sin(2.002*theta)+.10*np.sin(3.008*theta))*attack*np.exp(-t/.15)*release
        add(signal, start, gain, pan, f'{timbre} MIDI {midi}')

    # Six bars at 120 BPM. The two-to-one swung eighths breathe between gestures.
    melody = [
        [(0,60),(.8333,63),(1,67),(1.6667,65)],
        [(0,63),(.3333,65),(.8333,67),(1.5,70)],
        [(0,69),(.8333,67),(1,65),(1.6667,62)],
        [(0,67),(.3333,70),(.8333,72),(1.5,74)],
        [(0,72),(.8333,70),(1,67),(1.6667,63)],
        [(0,60),(.8333,63),(1,67)],
    ]
    roots = [36, 39, 38, 43, 41, 36]
    chords = [[63,67,70],[63,67,72],[62,65,69],[65,69,71],[65,68,72],[63,67,70]]
    for bar, events in enumerate(melody):
        at = bar*2
        for j, (beat, midi) in enumerate(events):
            duration = .73 if j == len(events)-1 else .38
            if bar == 5 and j == 2:
                duration = .90
            note(midi, at+beat, min(duration, DURATION-at-beat), .32, 'lead', .05)
        for beat in range(4):
            note(roots[bar]+[0,7,12,10][beat], at+beat*.5, .45, .16, 'bass', -.25)
            # Quiet brushed ride, explicitly seeded, with a little stereo width.
            t = np.arange(round(.16*RATE))/RATE
            noise = rng.standard_normal(len(t))
            high = noise-np.convolve(noise, np.ones(7)/7, mode='same')
            brush = high*(1-np.exp(-t/.001))*np.exp(-t/.025)
            add(brush, at+beat*.5, .013 if beat%2==0 else .022, .6, 'brush')
            if beat%2:
                kick_t = np.arange(round(.12*RATE))/RATE
                kick = np.sin(2*np.pi*(65*kick_t+20*kick_t*np.exp(-kick_t/.015)))*np.exp(-kick_t/.03)
                add(kick, at+beat*.5, .07, -.05, 'soft kick')
        for off in [.3333, 1.3333]:
            for j, midi in enumerate(chords[bar]):
                note(midi, at+off, .25, .025, 'piano', -.55+j*.18)

    # Short room reflections only; keep the additive lead intelligible.
    dry = mix.copy()
    for delay, gain in [(.043,.055),(.093,.035),(.161,.018)]:
        offset = round(delay*RATE)
        mix[offset:] += dry[:-offset, ::-1]*gain
    samples = np.arange(count)
    mix *= (np.minimum(1, samples/(RATE*.015))*np.minimum(1, (count-1-samples)/(RATE*.5)))[:,None]
    scale = min(1, 10**(-3/20)/float(np.max(np.abs(mix))))
    mix *= scale
    pcm = np.rint(mix*32767).astype('<i2')
    with args.output.open('xb') as raw:
        with wave.open(raw, 'wb') as out:
            out.setnchannels(2); out.setsampwidth(2); out.setframerate(RATE); out.writeframes(pcm.tobytes())
    theta = np.linspace(0, 2*np.pi, 65536, endpoint=False)
    wave_final = lead_oscillator(theta, np.full_like(theta, 9.25))
    facts = {'title':'A square wave auditions for jazz','durationSeconds':DURATION,'sampleRate':RATE,'channels':2,'bpm':BPM,
             'partialEntrancesSeconds':[0,2,4,6,8], 'partialCrossfadeSeconds':.32, 'oddHarmonics':ODD.astype(int).tolist(),
             'formula':'(4/pi) sum[k=0..N-1] sin((2k+1) theta)/(2k+1)', 'waveformNormalization':'unit plateau; overshoot retained',
             'fivePartialPeak':float(np.max(wave_final)), 'masterGain':scale,
             'peakDbfs':float(20*np.log10(np.max(np.abs(mix)))), 'rmsDbfs':float(20*np.log10(np.sqrt(np.mean(mix**2)))),
             'firstSample':pcm[0].tolist(),'lastSample':pcm[-1].tolist(),'clippedSamples':int(np.count_nonzero(np.abs(pcm)>=32767)),
             'listened':False,'cues':cues,
             'provenance':'Original deterministic additive synthesis plus seeded brushes. No samples, music recordings, models or provider calls.',
             'scope':'Visible waveform is the lead oscillator at one pitch, before musical envelope and mix; the illustration does not plot the full accompaniment.'}
    args.output.with_suffix('.json').write_text(json.dumps(facts,indent=2)+'\n')
    print(json.dumps({k:v for k,v in facts.items() if k!='cues'}))

if __name__ == '__main__':
    main()
