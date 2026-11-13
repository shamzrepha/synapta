#!/usr/bin/env python3
"""
Sprout's voice. Piper (a neural text-to-speech engine) reads each line from lines.json, then ffmpeg turns the natural voice into a
small, bright robot-pet voice. Change the numbers in ROBOT to taste:
  pitch   1.0 = the original voice; 1.25 is about 4 semitones higher (smaller, cuter)
  buzz    0..1 strength of the robotic wobble (tremolo)
  grit    0..1 strength of the digital crunch
Usage: python3 voice.py <work-dir> <path-to-piper-voice.onnx> [lines.json]
Writes <work-dir>/voice/<id>.wav (robot) and <id>.plain.wav (the natural voice, no effects) and <work-dir>/durs.json.
"""
import json, subprocess, sys, wave, pathlib

work = pathlib.Path(sys.argv[1]); model = sys.argv[2]
ROBOT = {"pitch": 1.22, "buzz": 0.35, "grit": 0.25, "speed": 1.0}
lines = json.loads((pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else pathlib.Path(__file__).parent / "lines.json").read_text())
(work / "voice").mkdir(parents=True, exist_ok=True)

def seconds(p):
    with wave.open(str(p)) as w: return w.getnframes() / w.getframerate()

durs = {}
for ln in lines:
    plain = work / "voice" / f"{ln['id']}.plain.wav"
    robot = work / "voice" / f"{ln['id']}.wav"
    subprocess.run(["piper", "-m", model, "-f", str(plain), "--length-scale", "0.93", "--sentence-silence", "0.22"],
                   input=ln["text"].encode(), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sr = wave.open(str(plain)).getframerate()
    pitch = ROBOT["pitch"]
    chain = [
        f"asetrate={int(sr * pitch)}", f"aresample=44100",             # higher pitch (and a smaller, brighter voice)
        f"atempo={ROBOT['speed'] / pitch:.4f}",                        # keep the speaking speed
        "highpass=f=140",
        f"tremolo=f=38:d={0.5 * ROBOT['buzz']:.3f}",                   # the robotic buzz
        f"acrusher=bits={int(16 - 7 * ROBOT['grit'])}:mode=log:aa=1:mix={0.5 * ROBOT['grit'] + 0.1:.2f}",   # digital grit
        "chorus=0.55:0.85:38|55:0.35|0.28:0.22|0.3:1.6|1.1",            # a doubled, synthetic shimmer
        "equalizer=f=2800:t=q:w=1.2:g=3",                               # bright and clear
        "alimiter=limit=0.9",
        "loudnorm=I=-16:TP=-1.5:LRA=7",
    ]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(plain), "-af", ",".join(chain), "-ar", "44100", "-ac", "1", str(robot)], check=True)
    durs[ln["id"]] = round(seconds(robot), 2)
    print(ln["id"], durs[ln["id"]], "s")
(work / "durs.json").write_text(json.dumps(durs, indent=1))
print("total speech", round(sum(durs.values()), 1), "s")
