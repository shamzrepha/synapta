"""Writes the SRT and VTT subtitle files from the same scene timings the film uses (src/film/config.ts)."""
import re, json, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
cfg = (root / "src/film/config.ts").read_text()
lens = [float(x) for x in re.search(r"const lens = \[([^\]]+)\]", cfg).group(1).split(",")]
dur = {int(k): float(v) for k, v in re.findall(r"(\d+): ([\d.]+)", re.search(r"const durations[^{]*\{([^}]+)\}", cfg).group(1))}
caps = re.findall(r'^\s+"(.+)",$', re.search(r"const captions = \[(.*?)\];", cfg, re.S).group(1), re.M)
delay = float(re.search(r"VO_DELAY = ([\d.]+)", cfg).group(1))
cues, t = [], 0.0
for i, ln in enumerate(lens):
    parts = re.split(r"(?<=[.?!])\s+", caps[i])
    total = sum(len(p) for p in parts)
    cur = t + delay
    for p in parts:
        d = len(p) / total * dur[i + 1]
        cues.append((cur, cur + d, p))
        cur += d
    t += ln
def ts(x, sep):
    h, r = divmod(x, 3600); m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d}{sep}{int((s % 1) * 1000):03d}"
out = root / "out"; out.mkdir(exist_ok=True)
(out / "sunroot-60s.srt").write_text("\n".join(f"{i}\n{ts(a, ',')} --> {ts(b, ',')}\n{x}\n" for i, (a, b, x) in enumerate(cues, 1)))
(out / "sunroot-60s.vtt").write_text("WEBVTT\n\n" + "\n".join(f"{ts(a, '.')} --> {ts(b, '.')}\n{x}\n" for a, b, x in cues))
print(len(cues), "cues")
