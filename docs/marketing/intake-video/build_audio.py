"""Builds the soundtrack and timeline for the intake video.
Usage: python3 build_audio.py <work-dir>   (work-dir holds voice/L1.wav .. L9.wav from voice.py)
Writes <work-dir>/audio.wav (stereo 44.1k) and <work-dir>/timeline.json (line starts, durations, mouth envelopes, scenes)."""
import sys, json, wave, numpy as np
W = sys.argv[1]; SR = 44100
lines = json.load(open(__file__.rsplit('/', 1)[0] + '/lines.json'))
GAP = [0.5, 0.4, 0.4, 0.45, 0.4, 0.45, 0.4, 0.4, 0.4]   # silence before each line

def rd(p):
    w = wave.open(p); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    assert w.getframerate() == SR; return a

voices = [rd(f'{W}/voice/{l["id"]}.wav') for l in lines]
t = 0.0; tl = []
for i, v in enumerate(voices):
    t += GAP[i]; d = len(v) / SR
    hop = SR // 30; n = len(v) // hop
    env = np.array([np.sqrt(np.mean(v[k*hop:(k+1)*hop] ** 2)) for k in range(n)])
    env = env / (np.percentile(env, 95) + 1e-6); env = np.clip(env, 0, 1)
    env = np.convolve(env, [.25, .5, .25], 'same')
    tl.append({'id': lines[i]['id'], 'text': lines[i]['text'], 'start': round(t, 3), 'dur': round(d, 3), 'env': [round(float(x), 2) for x in env]})
    t += d
TOTAL = round(t + 1.9, 2)
N = int(TOTAL * SR)
rng = np.random.default_rng(7)

# voice track
vt = np.zeros(N, np.float32)
for item, v in zip(tl, voices):
    s = int(item['start'] * SR); vt[s:s+len(v)] += v

# music: warm pad + plucks, C major I V vi IV, 108 bpm
bpm = 108; beat = 60 / bpm; tt = np.arange(N) / SR
def hz(m): return 440 * 2 ** ((m - 69) / 12)
chords = [[48, 55, 64], [43, 50, 59], [45, 52, 60], [41, 48, 57]]
mus = np.zeros(N, np.float32)
bar = beat * 4
for b in range(int(TOTAL / bar) + 1):
    c = chords[b % 4]; s0 = b * bar
    i0 = int(s0 * SR); i1 = min(N, int((s0 + bar) * SR))
    if i0 >= N: break
    x = tt[i0:i1] - s0
    env = np.minimum(1, x / 0.25) * np.minimum(1, (bar - x) / 0.4)
    pad = sum(np.sin(2 * np.pi * hz(m) * x) + 0.4 * np.sin(2 * np.pi * hz(m) * 2.003 * x) for m in c)
    mus[i0:i1] += 0.05 * pad * env
    for k in range(8):   # eighth-note plucks
        ps = s0 + k * beat / 2; pi = int(ps * SR)
        if pi >= N: continue
        note = c[k % 3] + 24 + (12 if k % 4 == 3 else 0)
        L = min(int(0.45 * SR), N - pi); xx = np.arange(L) / SR
        mus[pi:pi+L] += 0.07 * np.sin(2 * np.pi * hz(note) * xx) * np.exp(-xx * 9)
    for k in range(4):   # soft kick on the beats, from the first bar
        ks = s0 + k * beat; ki = int(ks * SR)
        if ki >= N: continue
        L = min(int(0.25 * SR), N - ki); xx = np.arange(L) / SR
        mus[ki:ki+L] += 0.22 * np.sin(2 * np.pi * (50 + 90 * np.exp(-xx * 30)) * xx) * np.exp(-xx * 14)
# fade in/out
mus *= np.minimum(1, tt / 1.2) * np.minimum(1, (TOTAL - tt) / 1.8)
# duck under the voice
act = np.zeros(N, np.float32)
for item in tl:
    a, b = int((item['start'] - .05) * SR), int((item['start'] + item['dur'] + .15) * SR); act[a:b] = 1
k = np.hanning(int(.25 * SR)); k /= k.sum(); act = np.convolve(act, k, 'same')
mus *= 1 - 0.55 * act

# sfx
scene_cuts = [0.15, 4.2, 6.8, 9.8, 15.1, 22.2, 26.9, 31.1, 35.6]
sfx = np.zeros(N, np.float32)
def whoosh(at, dur=.45, g=.20):
    i = int(at * SR); L = min(int(dur * SR), N - i)
    if L <= 0: return
    x = np.arange(L) / SR; n = rng.standard_normal(L).astype(np.float32)
    # swept low-pass by cumulative mixing
    f = 0.02 + 0.5 * (x / dur) ** 2; out = np.zeros(L, np.float32); y = 0
    for j in range(L): y += f[j] * (n[j] - y); out[j] = y
    sfx[i:i+L] += g * out * np.sin(np.pi * x / dur) ** 1.5
def pop(at, f0=520, g=.25):
    i = int(at * SR); L = min(int(.18 * SR), N - i)
    if L <= 0: return
    x = np.arange(L) / SR
    sfx[i:i+L] += g * np.sin(2 * np.pi * (f0 + 500 * np.exp(-x * 40)) * x) * np.exp(-x * 22)
def ding(at, f=1318, g=.18):
    i = int(at * SR); L = min(int(.9 * SR), N - i)
    if L <= 0: return
    x = np.arange(L) / SR
    sfx[i:i+L] += g * (np.sin(2 * np.pi * f * x) + .4 * np.sin(2 * np.pi * f * 2.01 * x)) * np.exp(-x * 5)
for c in scene_cuts: whoosh(c - .1)
for p in (0.65, 7.2, 22.9, 25.5, 31.6): pop(p)
for d in (0.3, 26.2, 35.7): ding(d)
for p in (16.0, 17.0, 18.0): pop(p, 700, .18)   # file chips landing
mus = mus * 1.0
mix = vt * 1.0 + mus * 0.85 + sfx * 0.9
# loudness: soft limit then normalise peak
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix = mix / (np.max(np.abs(mix)) + 1e-6) * 0.89
st = np.stack([mix, mix], 1)
out = (st * 32767).astype(np.int16)
w = wave.open(f'{W}/audio.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes()); w.close()
json.dump({'total': TOTAL, 'lines': tl}, open(f'{W}/timeline.json', 'w'))
print('total', TOTAL, [(x['id'], x['start'], round(x['start'] + x['dur'], 2)) for x in tl])
