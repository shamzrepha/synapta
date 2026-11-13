import json
import os
import wave
import subprocess
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
LINES_FILE = os.path.join(ROOT, "lines.json")
AUDIO_DIR = os.path.join(ROOT, "audio")
SFX_DIR = os.path.join(ROOT, "sfx")
os.makedirs(SFX_DIR, exist_ok=True)

SAMPLE_RATE = 44100

def get_duration(wav_path):
    with wave.open(wav_path, "rb") as w:
        return w.getnframes() / float(w.getframerate())

def save_wav(path, signal, sample_rate=SAMPLE_RATE):
    signal = np.clip(signal, -1.0, 1.0)
    int_data = (signal * 32767.0).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        # Stereo interleaved
        stereo = np.column_stack((int_data, int_data)).flatten()
        w.writeframes(stereo.tobytes())

def make_chime(filename, notes, duration=1.2, gain=0.25):
    path = os.path.join(SFX_DIR, filename)
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    sig = np.zeros_like(t)
    for offset_ms, freq in notes:
        offset_samples = int(SAMPLE_RATE * (offset_ms / 1000.0))
        rem = len(t) - offset_samples
        if rem <= 0: continue
        t_sub = t[:rem]
        env = np.clip(t_sub / 0.01, 0.0, 1.0) * np.exp(-3.0 * t_sub)
        tone = np.sin(2.0 * np.pi * freq * t_sub) * env * gain
        sig[offset_samples:] += tone
    save_wav(path, sig)
    return path

def build_sfx():
    make_chime("sfx_beepboop.wav", [(0, 880), (120, 1320), (240, 1760)], duration=0.8)
    make_chime("sfx_tick.wav", [(0, 1200)], duration=0.15, gain=0.15)
    make_chime("sfx_whoosh.wav", [(0, 440), (80, 660), (160, 880)], duration=0.4, gain=0.2)
    make_chime("sfx_thud.wav", [(0, 140), (50, 110), (100, 80)], duration=0.6, gain=0.3)
    make_chime("sfx_bright.wav", [(0, 523.25), (100, 659.25), (200, 783.99), (300, 1046.50)], duration=1.5, gain=0.25)
    make_chime("sfx_rope.wav", [(0, 700), (60, 950), (120, 1400)], duration=0.5, gain=0.25)
    make_chime("sfx_celebrate.wav", [(0, 784), (100, 988), (200, 1175), (300, 1568)], duration=1.2, gain=0.25)
    make_chime("sfx_ding.wav", [(0, 1046.5), (80, 1318.5)], duration=0.8, gain=0.2)
    make_chime("sfx_sunrise.wav", [(0, 261.63), (80, 329.63), (160, 392.00), (240, 523.25), (320, 659.25)], duration=2.5, gain=0.3)
    print("All SFX generated.")

def generate_background_music(total_seconds):
    total_samples = int(SAMPLE_RATE * total_seconds)
    t = np.linspace(0, total_seconds, total_samples, endpoint=False)
    music = np.zeros(total_samples, dtype=np.float32)

    bpm = 105
    sec_per_beat = 60.0 / bpm
    total_beats = int(total_seconds / sec_per_beat)

    for b in range(total_beats):
        t0 = b * sec_per_beat
        i0 = int(t0 * SAMPLE_RATE)
        i1 = min(total_samples, int((t0 + sec_per_beat) * SAMPLE_RATE))
        if i0 >= total_samples: break
        
        t_sub = t[i0:i1] - t0
        
        # Chord progression based on Act
        if t0 < 12.0:
            chord = [293.66, 369.99, 440.00] # D
            gain = 0.12
        elif t0 < 45.0:
            # Minor progression (B minor, A, G, A)
            prog = [[246.94, 293.66, 369.99], [220.00, 261.63, 329.63], [196.00, 246.94, 293.66], [220.00, 277.18, 329.63]]
            chord = prog[(b // 4) % 4]
            gain = 0.13
        elif t0 < 85.0:
            # Uplifting major progression (G, D, Em, C)
            prog = [[392.00, 493.88, 587.33], [293.66, 369.99, 440.00], [329.63, 392.00, 493.88], [261.63, 329.63, 392.00]]
            chord = prog[(b // 4) % 4]
            gain = 0.14
        elif t0 < 115.0:
            # Confident progression
            prog = [[329.63, 392.00, 493.88], [261.63, 329.63, 392.00], [392.00, 493.88, 587.33], [293.66, 369.99, 440.00]]
            chord = prog[(b // 4) % 4]
            gain = 0.14
        else:
            chord = [293.66, 369.99, 440.00, 587.33]
            gain = 0.16

        # Bass tone
        bass_freq = chord[0] / 2.0
        bass = np.sin(2.0 * np.pi * bass_freq * t_sub) * np.exp(-3.0 * t_sub)
        
        # Synth chord arpeggio
        chord_tone = np.zeros_like(t_sub)
        sub_len = len(t_sub)
        n_notes = len(chord)
        note_samples = max(1, sub_len // n_notes)
        for n_i, freq in enumerate(chord):
            s_start = n_i * note_samples
            s_end = min(sub_len, (n_i + 1) * note_samples)
            if s_start < sub_len:
                t_note = t_sub[s_start:s_end] - t_sub[s_start]
                chord_tone[s_start:s_end] = (0.7 * np.sin(2.0 * np.pi * freq * t_note) + 0.3 * np.sin(4.0 * np.pi * freq * t_note)) * np.exp(-1.5 * t_note)

        music[i0:i1] += (0.5 * bass + 0.5 * chord_tone) * gain

    bgm_path = os.path.join(AUDIO_DIR, "bgm_procedural.wav")
    save_wav(bgm_path, music)
    print("Background music generated:", bgm_path)
    return bgm_path

def build_timeline():
    with open(LINES_FILE, "r", encoding="utf-8") as f:
        lines = json.load(f)

    timeline = []
    current_time = 0.8
    
    for item in lines:
        wav_path = os.path.join(AUDIO_DIR, f"{item['id']}.wav")
        dur = get_duration(wav_path)
        scene_dur = max(dur + 1.2, 5.0)
        
        if item["id"] == "act1_scene3": scene_dur = max(scene_dur, 8.5)
        elif item["id"] == "act1_scene6": scene_dur = max(scene_dur, 8.5)
        elif item["id"] == "act2_scene7": scene_dur = max(scene_dur, 9.5)
        elif item["id"] == "act2_scene8": scene_dur = max(scene_dur, 9.5)
        elif item["id"] == "act2_scene9": scene_dur = max(scene_dur, 9.5)
        elif item["id"] == "act2_scene10": scene_dur = max(scene_dur, 9.5)
        elif item["id"] == "act3_scene11": scene_dur = max(scene_dur, 9.5)
        elif item["id"] == "act3_scene12": scene_dur = max(scene_dur, 9.0)
        elif item["id"] == "close_scene14": scene_dur = max(scene_dur, 9.5)

        timeline.append({
            "id": item["id"],
            "line": item["line"],
            "start": round(current_time, 2),
            "voice_start": round(current_time + 0.3, 2),
            "duration": round(scene_dur, 2),
            "voice_duration": round(dur, 2),
            "end": round(current_time + scene_dur, 2),
            "text": item["text"],
            "caption": item["caption"],
            "pose": item["pose"],
            "visual": item["visual"]
        })
        current_time += scene_dur

    total_duration = round(current_time + 1.5, 2)
    print(f"Total film duration: {total_duration}s (~{round(total_duration/60, 1)} min)")

    timeline_path = os.path.join(ROOT, "timeline.json")
    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump({"total_duration": total_duration, "scenes": timeline}, f, indent=2)

    return total_duration, timeline

def mix_master_audio(total_duration, timeline):
    bgm_path = generate_background_music(total_duration)
    
    # Mix using ffmpeg
    inputs = ["-i", bgm_path]
    filter_parts = []
    
    for i, sc in enumerate(timeline):
        voice_path = os.path.join(AUDIO_DIR, f"{sc['id']}.wav")
        inputs.extend(["-i", voice_path])
        delay_ms = int(sc["voice_start"] * 1000)
        filter_parts.append(f"[{i+1}:a]adelay={delay_ms}|{delay_ms},volume=1.2[v{i}];")

    sfx_cues = [
        ("sfx_beepboop.wav", 0.1),
        ("sfx_whoosh.wav", 12.0),
        ("sfx_tick.wav", 20.0),
        ("sfx_thud.wav", 36.5),
        ("sfx_bright.wav", 44.5),
        ("sfx_rope.wav", 55.5),
        ("sfx_celebrate.wav", 63.0),
        ("sfx_ding.wav", 67.0),
        ("sfx_celebrate.wav", 82.0),
        ("sfx_whoosh.wav", 86.0),
        ("sfx_ding.wav", 95.0),
        ("sfx_bright.wav", 106.0),
        ("sfx_sunrise.wav", timeline[-1]["start"] + 0.2)
    ]
    
    sfx_offset = len(timeline) + 1
    for j, (sfx_name, sfx_time) in enumerate(sfx_cues):
        sfx_path = os.path.join(SFX_DIR, sfx_name)
        inputs.extend(["-i", sfx_path])
        delay_ms = int(sfx_time * 1000)
        filter_parts.append(f"[{sfx_offset + j}:a]adelay={delay_ms}|{delay_ms},volume=0.7[sfx{j}];")

    voice_labels = "".join([f"[v{i}]" for i in range(len(timeline))])
    sfx_labels = "".join([f"[sfx{j}]" for j in range(len(sfx_cues))])
    
    total_mix_count = 1 + len(timeline) + len(sfx_cues)
    all_labels = "[0:a]" + voice_labels + sfx_labels
    
    filter_graph = "".join(filter_parts) + f"{all_labels}amix=inputs={total_mix_count}:duration=first:dropout_transition=2,loudnorm=I=-16:LRA=11:TP=-1.5[outa]"
    
    master_wav = os.path.join(AUDIO_DIR, "master_soundtrack.wav")
    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_graph, "-map", "[outa]", master_wav]
    
    print("Mixing master soundtrack via ffmpeg...")
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"Master soundtrack complete: {master_wav}")
    return master_wav

if __name__ == "__main__":
    build_sfx()
    total_dur, timeline = build_timeline()
    mix_master_audio(total_dur, timeline)
