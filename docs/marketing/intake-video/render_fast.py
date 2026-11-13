import os
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
TIMELINE_FILE = os.path.join(ROOT, "timeline.json")
AUDIO_FILE = os.path.join(ROOT, "audio", "master_soundtrack.wav")
ASSETS_DIR = os.path.join(ROOT, "assets")
OUTPUT_DIR = os.path.join(ROOT, "output")
SCENES_DIR = os.path.join(OUTPUT_DIR, "scenes")
os.makedirs(SCENES_DIR, exist_ok=True)

WIDTH = 1080
HEIGHT = 1920
FPS = 30

try:
    font_bold_huge = ImageFont.truetype("arialbd.ttf", 68)
    font_bold_large = ImageFont.truetype("arialbd.ttf", 50)
    font_bold_med = ImageFont.truetype("arialbd.ttf", 38)
    font_regular = ImageFont.truetype("arial.ttf", 34)
    font_mono = ImageFont.truetype("courbd.ttf", 36)
    font_caption = ImageFont.truetype("arialbd.ttf", 44)
except Exception:
    font_bold_huge = ImageFont.load_default()
    font_bold_large = ImageFont.load_default()
    font_bold_med = ImageFont.load_default()
    font_regular = ImageFont.load_default()
    font_mono = ImageFont.load_default()
    font_caption = ImageFont.load_default()

def load_image(filename):
    p = os.path.join(ASSETS_DIR, filename)
    if os.path.exists(p):
        return Image.open(p).convert("RGBA")
    return None

def draw_sprout(img_base, sprout_img, x, y, scale=0.68):
    if sprout_img is None:
        return
    w = int(sprout_img.width * scale)
    h = int(sprout_img.height * scale)
    sprout_resized = sprout_img.resize((w, h), Image.Resampling.LANCZOS)
    
    shadow = Image.new("RGBA", (w, 40), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.ellipse([w*0.2, 5, w*0.8, 35], fill=(0, 0, 0, 75))
    img_base.paste(shadow, (x - w//2, y + h//2 - 15), shadow)
    
    img_base.paste(sprout_resized, (x - w//2, y - h//2), sprout_resized)

def draw_caption(draw, text):
    if not text:
        return
    box_w = 940
    box_h = 160
    box_x = (WIDTH - box_w) // 2
    box_y = int(HEIGHT * 0.77)
    
    draw.rounded_rectangle([box_x, box_y, box_x + box_w, box_y + box_h], radius=24, fill=(11, 19, 43, 235), outline=(255, 255, 255, 50), width=2)
    
    words = text.split(" ")
    lines = []
    cur = []
    for w in words:
        test = " ".join(cur + [w])
        if len(test) > 36:
            lines.append(" ".join(cur))
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(" ".join(cur))
        
    line_h = 48
    start_y = box_y + (box_h - len(lines) * line_h) // 2
    for i, line in enumerate(lines[:3]):
        bbox = draw.textbbox((0, 0), line, font=font_caption)
        text_w = bbox[2] - bbox[0]
        text_x = box_x + (box_w - text_w) // 2
        draw.text((text_x, start_y + i * line_h), line, font=font_caption, fill=(255, 255, 255, 255))

def render_scene_still(sc, out_path):
    base = Image.new("RGBA", (WIDTH, HEIGHT), (8, 16, 36, 255))
    draw = ImageDraw.Draw(base)
    sprout_img = load_image(sc["pose"])
    visual = sc["visual"]
    
    if sc["line"] == 1:
        # Sunrise glow
        for r in range(540, 100, -70):
            alpha = int(30 * (1.0 - r / 540.0))
            draw.ellipse([WIDTH//2 - r, 740 - r, WIDTH//2 + r, 740 + r], outline=(37, 99, 235, alpha), width=5)
        draw.text((WIDTH//2 - 290, 340), "CONGRATULATIONS!", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 210, 430), "You Got Admitted", font=font_bold_large, fill=(96, 165, 250))
        draw_sprout(base, sprout_img, WIDTH//2, 1000, scale=0.74)

    elif sc["line"] == 2:
        for r in range(540, 100, -70):
            alpha = int(25 * (1.0 - r / 540.0))
            draw.ellipse([WIDTH//2 - r, 740 - r, WIDTH//2 + r, 740 + r], outline=(16, 185, 129, alpha), width=4)
        draw.text((WIDTH//2 - 270, 340), "THE NEXT CHAPTER", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 290, 430), "Remember it all in 4 years", font=font_bold_large, fill=(52, 211, 153))
        draw_sprout(base, sprout_img, WIDTH//2, 1000, scale=0.74)

    elif sc["line"] == 3:
        # Act 1: 11:00 PM Night Desk
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(6, 10, 22, 255))
        draw.text((WIDTH//2 - 200, 310), "11:00 PM", font=font_bold_huge, fill=(239, 68, 68))
        draw.text((WIDTH//2 - 210, 400), "Exam Tomorrow Morning", font=font_bold_med, fill=(148, 163, 184))
        for i in range(8):
            y_off = 580 + i * 28
            draw.rounded_rectangle([220 - i*4, y_off, 860 + i*4, y_off + 22], radius=6, fill=(30, 41, 59, 255), outline=(71, 85, 105, 255))
        draw.text((WIDTH//2 - 140, 840), "40 Pages To Read", font=font_mono, fill=(248, 113, 113))
        draw_sprout(base, sprout_img, WIDTH//2, 1140, scale=0.64)

    elif sc["line"] == 4:
        # Cramming trap
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(6, 10, 22, 255))
        draw.text((WIDTH//2 - 250, 300), "THE CRAMMING TRAP", font=font_bold_huge, fill=(245, 158, 11))
        draw.text((WIDTH//2 - 210, 380), "Reading again and again...", font=font_regular, fill=(203, 213, 225))
        draw.rounded_rectangle([180, 460, 900, 980], radius=16, fill=(248, 250, 252, 255))
        for i in range(9):
            line_y = 500 + i * 50
            draw.rectangle([220, line_y, 860, line_y + 26], fill=(254, 240, 138, 255) if i % 2 == 0 else (226, 232, 240, 255))
        draw.text((WIDTH//2 - 220, 1030), "\"Looks Familiar\" ≠ Understood", font=font_bold_med, fill=(248, 113, 113))
        draw_sprout(base, sprout_img, 820, 940, scale=0.55)

    elif sc["line"] == 5:
        # Dissolving words
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(6, 10, 22, 255))
        draw.text((WIDTH//2 - 280, 300), "THE FORGETTING CURVE", font=font_bold_huge, fill=(239, 68, 68))
        draw.rounded_rectangle([160, 460, 920, 980], radius=20, fill=(15, 23, 42, 255), outline=(239, 68, 68, 100), width=2)
        draw.text((220, 540), "Day 1: Remembered for test", font=font_bold_large, fill=(52, 211, 153))
        draw.text((220, 660), "Day 3: Details fading away...", font=font_bold_large, fill=(251, 191, 36))
        draw.text((220, 780), "Day 7: [ MEMORY GONE ]", font=font_bold_large, fill=(239, 68, 68))
        draw_sprout(base, sprout_img, WIDTH//2, 1140, scale=0.64)

    elif sc["line"] == 6:
        # Crumbling foundation
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(6, 10, 22, 255))
        draw.text((WIDTH//2 - 270, 300), "THE CRUMBLING TOWER", font=font_bold_huge, fill=(239, 68, 68))
        draw.rounded_rectangle([260, 560, 820, 690], radius=14, fill=(59, 130, 246, 255), outline=(255, 255, 255, 180), width=3)
        draw.text((WIDTH//2 - 130, 605), "SEMESTER 2", font=font_bold_large, fill=(255, 255, 255))
        draw.rounded_rectangle([320, 720, 760, 850], radius=14, fill=(185, 28, 28, 220), outline=(248, 113, 113, 255), width=3)
        draw.text((WIDTH//2 - 160, 765), "Missing Foundation!", font=font_bold_large, fill=(255, 255, 255))
        draw_sprout(base, sprout_img, 240, 1080, scale=0.64)

    elif sc["line"] == 7:
        # Act 2: Solution Ingest
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(11, 29, 79, 255))
        draw.text((WIDTH//2 - 290, 260), "NOTES IN. LESSONS OUT.", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 230, 340), "PDFs • Slides • Board Photos", font=font_bold_med, fill=(147, 197, 253))
        draw.rounded_rectangle([180, 440, 480, 570], radius=16, fill=(30, 58, 138, 255), outline=(96, 165, 250, 255), width=2)
        draw.text((215, 485), "📄 Lecture PDF", font=font_bold_med, fill=(255, 255, 255))
        draw.rounded_rectangle([600, 440, 900, 570], radius=16, fill=(30, 58, 138, 255), outline=(96, 165, 250, 255), width=2)
        draw.text((635, 485), "📷 Board Photo", font=font_bold_med, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 15, 600), "▼", font=font_bold_huge, fill=(52, 211, 153))
        draw.rounded_rectangle([180, 680, 900, 980], radius=20, fill=(255, 255, 255, 255))
        draw.text((220, 720), "Chapter 1: Principles of Biology", font=font_bold_med, fill=(15, 23, 42))
        draw.text((220, 790), "Structured step-by-step interactive textbook", font=font_regular, fill=(71, 85, 105))
        draw_sprout(base, sprout_img, 840, 920, scale=0.55)

    elif sc["line"] == 8:
        # Tap a word rope pull
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(11, 29, 79, 255))
        screen = load_image("phone-03-word-popup-sprout-perched.png")
        if screen:
            sw = 520
            sh = int(screen.height * (sw / screen.width))
            screen_resized = screen.resize((sw, sh), Image.Resampling.LANCZOS)
            base.paste(screen_resized, (WIDTH//2 - sw//2, 320))
        draw.text((WIDTH//2 - 210, 230), "TAP ANY WORD", font=font_bold_huge, fill=(255, 255, 255))
        draw_sprout(base, sprout_img, 850, 920, scale=0.55)

    elif sc["line"] == 9:
        # Active Practice
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(11, 29, 79, 255))
        draw.text((WIDTH//2 - 260, 250), "ACTIVE RETRIEVAL", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 230, 330), "Flashcards • Quizzes • Challenges", font=font_bold_med, fill=(147, 197, 253))
        draw.rounded_rectangle([160, 440, 920, 560], radius=18, fill=(15, 23, 42, 240), outline=(52, 211, 153, 255), width=2)
        draw.text((200, 480), "⚡ Flashcard Sprint: Active Recall", font=font_bold_med, fill=(255, 255, 255))
        draw.rounded_rectangle([160, 590, 920, 710], radius=18, fill=(15, 23, 42, 240), outline=(96, 165, 250, 255), width=2)
        draw.text((200, 630), "🎯 Diagnostic Quizzes: No Guessing", font=font_bold_med, fill=(255, 255, 255))
        draw.rounded_rectangle([160, 740, 920, 860], radius=18, fill=(15, 23, 42, 240), outline=(245, 158, 11, 255), width=2)
        draw.text((200, 780), "🛠️ Hands-On Labs: Explain & Build", font=font_bold_med, fill=(255, 255, 255))
        draw_sprout(base, sprout_img, WIDTH//2, 1120, scale=0.64)

    elif sc["line"] == 10:
        # Focus sprint
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(11, 29, 79, 255))
        screen = load_image("phone-05-focus-sprint.png")
        if screen:
            sw = 520
            sh = int(screen.height * (sw / screen.width))
            screen_resized = screen.resize((sw, sh), Image.Resampling.LANCZOS)
            base.paste(screen_resized, (WIDTH//2 - sw//2, 320))
        draw.text((WIDTH//2 - 270, 230), "10-MINUTE FOCUS SPRINT", font=font_bold_huge, fill=(255, 255, 255))
        draw_sprout(base, sprout_img, 840, 900, scale=0.55)

    elif sc["line"] == 11:
        # Act 3: Comparison
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(8, 18, 44, 255))
        draw.text((WIDTH//2 - 270, 230), "THE DIFFERENCE", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((190, 330), "Memorise Tonight", font=font_bold_med, fill=(239, 68, 68))
        draw.text((580, 330), "Understand For Good", font=font_bold_med, fill=(52, 211, 153))
        rows = [
            ("Re-reading the page", "Explaining & building"),
            ("One brutal 6-hr cram", "Small 10-min sprints"),
            ("Forgot by next week", "Strong foundation")
        ]
        for r_i, (col1, col2) in enumerate(rows):
            y_box = 400 + r_i * 170
            draw.rounded_rectangle([150, y_box, 490, y_box + 130], radius=16, fill=(30, 41, 59, 220), outline=(239, 68, 68, 120))
            draw.text((180, y_box + 45), col1, font=font_regular, fill=(255, 255, 255))
            draw.rounded_rectangle([550, y_box, 930, y_box + 130], radius=16, fill=(15, 23, 42, 240), outline=(52, 211, 153, 200), width=2)
            draw.text((580, y_box + 45), col2, font=font_bold_med, fill=(255, 255, 255))
        draw_sprout(base, sprout_img, WIDTH//2, 1140, scale=0.62)

    elif sc["line"] == 12:
        # Evaluation Diagnostic
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(8, 18, 44, 255))
        draw.text((WIDTH//2 - 280, 240), "\"HOW AM I DOING?\"", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 230, 330), "Real-Time Diagnostic Evaluation", font=font_bold_med, fill=(96, 165, 250))
        draw.rounded_rectangle([150, 430, 930, 930], radius=24, fill=(15, 23, 42, 240), outline=(96, 165, 250, 200), width=2)
        draw.text((200, 480), "🧭 Diagnostic Evidence", font=font_bold_large, fill=(255, 255, 255))
        draw.text((200, 560), "• Analyzes your wrong answers directly", font=font_regular, fill=(203, 213, 225))
        draw.text((200, 630), "• Pinpoints exact misconception gaps", font=font_regular, fill=(203, 213, 225))
        draw.text((200, 700), "• Gives you a tailored recovery plan", font=font_regular, fill=(52, 211, 153))
        draw.text((200, 790), "Spend time ONLY where you need it.", font=font_bold_med, fill=(245, 158, 11))
        draw_sprout(base, sprout_img, WIDTH//2, 1140, scale=0.62)

    elif sc["line"] == 13:
        # Confident exams
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(8, 18, 44, 255))
        draw.text((WIDTH//2 - 270, 300), "CONFIDENT EXAMS", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 200, 380), "Learn it once. Properly.", font=font_bold_large, fill=(52, 211, 153))
        draw.text((WIDTH//2 - 220, 520), "✓ No panic cramming", font=font_bold_med, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 220, 600), "✓ Genuine mastery", font=font_bold_med, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 220, 680), "✓ Real retention that lasts", font=font_bold_med, fill=(255, 255, 255))
        draw_sprout(base, sprout_img, WIDTH//2, 1020, scale=0.72)

    else:
        # Close: End Card
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(8, 16, 36, 255))
        for r in range(580, 100, -70):
            alpha = int(35 * (1.0 - r / 580.0))
            draw.ellipse([WIDTH//2 - r, 700 - r, WIDTH//2 + r, 700 + r], outline=(37, 99, 235, alpha), width=5)
        draw.text((WIDTH//2 - 260, 300), "SUNROOTLEARN", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 270, 400), "Understand it. Build it. Prove it.", font=font_bold_large, fill=(96, 165, 250))
        draw_sprout(base, sprout_img, WIDTH//2, 800, scale=0.76)
        draw.rounded_rectangle([220, 1140, 860, 1260], radius=60, fill=(37, 99, 235, 255), outline=(255, 255, 255, 200), width=2)
        draw.text((WIDTH//2 - 180, 1180), "START FREE TODAY", font=font_bold_large, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 220, 1300), "sunrootlearn.vercel.app", font=font_mono, fill=(147, 197, 253))

    draw_caption(draw, sc["caption"])
    base.convert("RGB").save(out_path)

def build_film_fast():
    with open(TIMELINE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data["scenes"]
    
    seg_files = []
    print("Rendering scene frames & segments...")
    for idx, sc in enumerate(scenes):
        frame_png = os.path.join(SCENES_DIR, f"scene_{idx:02d}.png")
        seg_mp4 = os.path.join(SCENES_DIR, f"seg_{idx:02d}.mp4")
        render_scene_still(sc, frame_png)
        
        # Encode segment with ffmpeg
        dur = sc["duration"]
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", frame_png,
            "-t", str(dur),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-r", str(FPS),
            seg_mp4
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        seg_files.append(seg_mp4)
        print(f"  Scene {sc['line']}/14 ({dur}s) complete")

    # Concat list file
    concat_list = os.path.join(SCENES_DIR, "concat.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        for seg in seg_files:
            # Format: file 'C:/...'
            clean_p = seg.replace("\\", "/")
            f.write(f"file '{clean_p}'\n")

    out_raw_video = os.path.join(OUTPUT_DIR, "raw_concatenated.mp4")
    out_final_9_16 = os.path.join(OUTPUT_DIR, "sunroot_intake_2min.mp4")
    out_final_1_1 = os.path.join(OUTPUT_DIR, "sunroot_intake_square.mp4")
    out_final_16_9 = os.path.join(OUTPUT_DIR, "sunroot_intake_horizontal.mp4")
    out_ad_30s = os.path.join(OUTPUT_DIR, "sunroot_ad_30s.mp4")

    print("Concatenating video segments...")
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list,
        "-c", "copy",
        out_raw_video
    ], check=True)

    print("Multiplexing master soundtrack into 9:16 vertical film...")
    subprocess.run([
        "ffmpeg", "-y",
        "-i", out_raw_video,
        "-i", AUDIO_FILE,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_final_9_16
    ], check=True)
    print(f"✅ 9:16 Video complete: {out_final_9_16}")

    print("Generating 1:1 Square cut...")
    subprocess.run([
        "ffmpeg", "-y",
        "-i", out_final_9_16,
        "-vf", "crop=1080:1080:0:(in_h-out_h)/2",
        "-c:a", "copy",
        out_final_1_1
    ], check=True)
    print(f"✅ 1:1 Video complete: {out_final_1_1}")

    print("Generating 16:9 Horizontal cut...")
    subprocess.run([
        "ffmpeg", "-y",
        "-i", out_final_9_16,
        "-vf", "scale=608:1080,pad=1920:1080:(1920-608)/2:0:black",
        "-c:a", "copy",
        out_final_16_9
    ], check=True)
    print(f"✅ 16:9 Video complete: {out_final_16_9}")

    print("Generating 30s Social Ad cut (Acts 1 + 2 Highlights)...")
    subprocess.run([
        "ffmpeg", "-y",
        "-ss", "00:00:16",
        "-i", out_final_9_16,
        "-t", "30",
        "-c", "copy",
        out_ad_30s
    ], check=True)
    print(f"✅ 30s Social Ad complete: {out_ad_30s}")

if __name__ == "__main__":
    build_film_fast()
