# Intake welcome video

Sources for the 43-second "congratulations on your admission" film starring Sprout. Rendered video is not committed (13 MB); build it with the steps below.

- `SCRIPT.md`: script and timing. `lines.json`: the spoken lines.
- `PROMPT-ANTIGRAVITY.md`: prompt to hand to Antigravity. `PROMPT-FLOW-AGENT.md`: prompt for Flow or any other video tool.
- `voice.py`, `build_audio.py`, `film.html`, `sprout.js`, `render.mjs`: the render pipeline. `assets/`: real app screenshots and logos.

## Build
Needs Python 3 with numpy, ffmpeg, Node with Playwright (Chromium), and a Piper voice (`en_US-lessac-high.onnx`).
```
W=/tmp/intake && mkdir -p $W
python3 voice.py $W path/to/en_US-lessac-high.onnx      # robot voice lines -> $W/voice/L1..L9.wav
python3 build_audio.py $W                               # music, sfx, timeline.json, audio.wav
node render.mjs $W 30                                   # frames -> $W/frames (add a list of seconds to preview only those)
ffmpeg -framerate 30 -i $W/frames/f%05d.jpg -i $W/audio.wav -af loudnorm=I=-16:TP=-1.5 \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart sunroot_welcome.mp4
```
Personalise: `FILM_CONFIG='{"school":"Your University"}' node render.mjs $W 30`. Note: `render.mjs` imports Playwright from `/opt/node-tools`; change that path if yours differs.
Robot voice amount lives in `ROBOT` at the top of `voice.py`.
