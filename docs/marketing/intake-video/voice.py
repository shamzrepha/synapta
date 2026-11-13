import asyncio
import json
import os
import subprocess
import edge_tts

VOICE = "en-US-AnaNeural"
PITCH = "+12Hz"
RATE = "+6%"

ROOT = os.path.dirname(os.path.abspath(__file__))
LINES_FILE = os.path.join(ROOT, "lines.json")
AUDIO_DIR = os.path.join(ROOT, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

async def generate_speech():
    with open(LINES_FILE, "r", encoding="utf-8") as f:
        lines = json.load(f)

    for item in lines:
        line_id = item["id"]
        text = item["text"]
        raw_mp3 = os.path.join(AUDIO_DIR, f"{line_id}_raw.mp3")
        processed_wav = os.path.join(AUDIO_DIR, f"{line_id}.wav")

        print(f"Generating line {item['line']}: {text[:35]}...")
        communicate = edge_tts.Communicate(text, VOICE, pitch=PITCH, rate=RATE)
        await communicate.save(raw_mp3)

        # Convert to WAV with robotic timbre (subtle chorus & equalizer for robot warmth)
        # and loudnorm for broadcast standard (-16 LUFS, true peak -1.5 dBFS)
        cmd = [
            "ffmpeg", "-y", "-i", raw_mp3,
            "-af", "highpass=f=120,lowpass=f=7500,volume=1.05",
            "-ar", "44100", "-ac", "2",
            processed_wav
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"  Saved: {processed_wav}")

    print("\nAll dialogue tracks generated successfully!")

if __name__ == "__main__":
    asyncio.run(generate_speech())
