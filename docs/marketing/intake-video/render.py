import os
import json
import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
TIMELINE_FILE = os.path.join(ROOT, "timeline.json")
AUDIO_FILE = os.path.join(ROOT, "audio", "master_soundtrack.wav")
ASSETS_DIR = os.path.join(ROOT, "assets")
OUTPUT_DIR = os.path.join(ROOT, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

WIDTH = 1080
HEIGHT = 1920
FPS = 30

# Load fonts
try:
    font_bold_huge = ImageFont.truetype("arialbd.ttf", 68)
    font_bold_large = ImageFont.truetype("arialbd.ttf", 52)
    font_bold_med = ImageFont.truetype("arialbd.ttf", 40)
    font_regular = ImageFont.truetype("arial.ttf", 36)
    font_mono = ImageFont.truetype("courbd.ttf", 38)
    font_caption = ImageFont.truetype("arialbd.ttf", 46)
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

def draw_sprout(img_base, sprout_img, x, y, scale=0.65, bob=0):
    if sprout_img is None:
        return
    w = int(sprout_img.width * scale)
    h = int(sprout_img.height * scale)
    sprout_resized = sprout_img.resize((w, h), Image.Resampling.LANCZOS)
    
    # Shadow
    shadow = Image.new("RGBA", (w, 40), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.ellipse([w*0.2, 5, w*0.8, 35], fill=(0, 0, 0, 70))
    img_base.paste(shadow, (x - w//2, y + h//2 - 15), shadow)
    
    # Sprite
    draw_y = int(y - h//2 + bob)
    img_base.paste(sprout_resized, (x - w//2, draw_y), sprout_resized)

def draw_caption(draw, text):
    if not text:
        return
    # Caption box at bottom 14%
    box_w = 920
    box_h = 160
    box_x = (WIDTH - box_w) // 2
    box_y = int(HEIGHT * 0.76)
    
    # Rounded rect background
    draw.rounded_rectangle([box_x, box_y, box_x + box_w, box_y + box_h], radius=24, fill=(11, 19, 43, 235), outline=(255, 255, 255, 45), width=2)
    
    # Word wrap
    words = text.split(" ")
    lines = []
    cur = []
    for w in words:
        test = " ".join(cur + [w])
        if len(test) > 34:
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

def render_scene_frame(sc, t_rel, t_abs):
    # Base background canvas
    base = Image.new("RGBA", (WIDTH, HEIGHT), (8, 16, 36, 255))
    draw = ImageDraw.Draw(base)
    
    sprout_img = load_image(sc["pose"])
    bob = math.sin(t_rel * 4.0) * 12

    visual = sc["visual"]
    
    # Background styling based on Act
    if sc["line"] <= 2:
        # Act 0: Midnight blue with sunrise glow
        for r in range(500, 100, -60):
            alpha = int(25 * (1.0 - r / 500.0))
            draw.ellipse([WIDTH//2 - r, 750 - r, WIDTH//2 + r, 750 + r], outline=(37, 99, 235, alpha), width=4)
        
        # Headline
        draw.text((WIDTH//2 - 280, 360), "CONGRATULATIONS!", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 230, 450), "You Got Admitted", font=font_bold_large, fill=(96, 165, 250))
        
        draw_sprout(base, sprout_img, WIDTH//2, 1020, scale=0.72, bob=bob)

    elif 3 <= sc["line"] <= 6:
        # Act 1: The Problem (Dark tense slate)
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(6, 10, 22, 255))
        
        if visual == "night_desk_countdown":
            # Clock vignette: 11:00 PM
            draw.text((WIDTH//2 - 220, 320), "11:00 PM", font=font_bold_huge, fill=(239, 68, 68))
            draw.text((WIDTH//2 - 200, 410), "Exam Tomorrow Morning", font=font_bold_med, fill=(148, 163, 184))
            
            # Stack of 40 pages
            for i in range(8):
                y_off = 650 + i * 28
                draw.rounded_rectangle([240 - i*4, y_off, 840 + i*4, y_off + 22], radius=6, fill=(30, 41, 59, 255), outline=(71, 85, 105, 255))
            draw.text((WIDTH//2 - 130, 920), "40 Pages To Read", font=font_mono, fill=(248, 113, 113))
            draw_sprout(base, sprout_img, WIDTH//2, 1180, scale=0.62, bob=bob)

        elif visual == "cramming_loop":
            draw.text((WIDTH//2 - 240, 340), "THE CRAMMING TRAP", font=font_bold_huge, fill=(245, 158, 11))
            draw.text((WIDTH//2 - 220, 430), "Reading again and again...", font=font_regular, fill=(203, 213, 225))
            
            # Simulated book page
            draw.rounded_rectangle([180, 560, 900, 1140], radius=16, fill=(248, 250, 252, 255))
            # Text lines with heavy yellow highlighting
            for i in range(10):
                line_y = 610 + i * 48
                draw.rectangle([220, line_y, 860, line_y + 24], fill=(254, 240, 138, 255) if i % 2 == 0 else (226, 232, 240, 255))
            draw.text((WIDTH//2 - 190, 1180), "\"Looks Familiar\" ≠ Understood", font=font_bold_med, fill=(248, 113, 113))
            draw_sprout(base, sprout_img, 820, 1050, scale=0.55, bob=bob)

        elif visual == "dissolving_words":
            draw.text((WIDTH//2 - 280, 340), "THE FORGETTING CURVE", font=font_bold_huge, fill=(239, 68, 68))
            # Dissolving text box
            draw.rounded_rectangle([160, 520, 920, 1080], radius=20, fill=(15, 23, 42, 255), outline=(239, 68, 68, 100), width=2)
            dissolve_alpha = max(20, int(255 * (1.0 - (t_rel / sc["duration"]) * 0.85)))
            draw.text((220, 600), "Day 1: Remembered for test", font=font_bold_large, fill=(52, 211, 153, 255))
            draw.text((220, 720), "Day 3: Details fading away...", font=font_bold_large, fill=(251, 191, 36, dissolve_alpha))
            draw.text((220, 840), "Day 7: [ MEMORY GONE ]", font=font_bold_large, fill=(239, 68, 68, dissolve_alpha))
            draw_sprout(base, sprout_img, WIDTH//2, 1240, scale=0.62, bob=bob)

        elif visual == "foundation_collapse":
            draw.text((WIDTH//2 - 270, 320), "THE CRUMBLING TOWER", font=font_bold_huge, fill=(239, 68, 68))
            # Wobbling semester blocks
            wobble = math.sin(t_rel * 8.0) * 14
            # Top block: Semester 2
            draw.rounded_rectangle([260 + wobble, 620, 820 + wobble, 760], radius=14, fill=(59, 130, 246, 255), outline=(255, 255, 255, 180), width=3)
            draw.text((WIDTH//2 - 130 + wobble, 670), "SEMESTER 2", font=font_bold_large, fill=(255, 255, 255))
            
            # Bottom block: Semester 1 (fractured)
            draw.rounded_rectangle([320, 800, 760, 940], radius=14, fill=(185, 28, 28, 220), outline=(248, 113, 113, 255), width=3)
            draw.text((WIDTH//2 - 160, 850), "Missing Foundation!", font=font_bold_large, fill=(255, 255, 255))
            draw_sprout(base, sprout_img, 240, 1180, scale=0.62, bob=bob)

    elif 7 <= sc["line"] <= 10:
        # Act 2: The Solution (Royal Blue & Real Screens)
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(11, 29, 79, 255))
        
        if visual == "notes_ingest_lessons":
            draw.text((WIDTH//2 - 280, 280), "NOTES IN. LESSONS OUT.", font=font_bold_huge, fill=(255, 255, 255))
            draw.text((WIDTH//2 - 240, 370), "PDFs • Slides • Board Photos", font=font_bold_med, fill=(147, 197, 253))
            
            # 3 source cards flowing into lesson
            draw.rounded_rectangle([180, 520, 480, 680], radius=16, fill=(30, 58, 138, 255), outline=(96, 165, 250, 255), width=2)
            draw.text((220, 580), "📄 Lecture PDF", font=font_bold_med, fill=(255, 255, 255))
            
            draw.rounded_rectangle([600, 520, 900, 680], radius=16, fill=(30, 58, 138, 255), outline=(96, 165, 250, 255), width=2)
            draw.text((640, 580), "📷 Board Photo", font=font_bold_med, fill=(255, 255, 255))
            
            # Arrow down
            draw.text((WIDTH//2 - 20, 720), "▼", font=font_bold_huge, fill=(52, 211, 153))
            
            # Formatted textbook lesson
            draw.rounded_rectangle([200, 800, 880, 1180], radius=20, fill=(255, 255, 255, 255))
            draw.text((240, 840), "Chapter 1: Principles of Biology", font=font_bold_med, fill=(15, 23, 42))
            draw.text((240, 910), "Structured step-by-step interactive textbook", font=font_regular, fill=(71, 85, 105))
            draw_sprout(base, sprout_img, 840, 1020, scale=0.58, bob=bob)

        elif visual == "clip1_tap_rope_haul":
            # Show live phone screenshot of the tap-a-word rope haul
            screen = load_image("phone-03-word-popup-sprout-perched.png")
            if screen:
                sw = 540
                sh = int(screen.height * (sw / screen.width))
                screen_resized = screen.resize((sw, sh), Image.Resampling.LANCZOS)
                base.paste(screen_resized, (WIDTH//2 - sw//2, 380))
            draw.text((WIDTH//2 - 210, 260), "TAP ANY WORD", font=font_bold_huge, fill=(255, 255, 255))
            draw_sprout(base, sprout_img, 860, 980, scale=0.55, bob=bob)

        elif visual == "active_practice_quiz_circuits":
            draw.text((WIDTH//2 - 270, 270), "ACTIVE RETRIEVAL", font=font_bold_huge, fill=(255, 255, 255))
            draw.text((WIDTH//2 - 230, 360), "Flashcards • Quizzes • Challenges", font=font_bold_med, fill=(147, 197, 253))
            
            # 3 Action badges
            draw.rounded_rectangle([180, 520, 900, 650], radius=18, fill=(15, 23, 42, 240), outline=(52, 211, 153, 255), width=2)
            draw.text((230, 565), "⚡ Flashcard Sprint: Active Recall", font=font_bold_med, fill=(255, 255, 255))
            
            draw.rounded_rectangle([180, 700, 900, 830], radius=18, fill=(15, 23, 42, 240), outline=(96, 165, 250, 255), width=2)
            draw.text((230, 745), "🎯 Diagnostic Quizzes: No Guessing", font=font_bold_med, fill=(255, 255, 255))
            
            draw.rounded_rectangle([180, 880, 900, 1010], radius=18, fill=(15, 23, 42, 240), outline=(245, 158, 11, 255), width=2)
            draw.text((230, 925), "🛠️ Hands-On Labs: Explain & Build", font=font_bold_med, fill=(255, 255, 255))
            draw_sprout(base, sprout_img, WIDTH//2, 1220, scale=0.62, bob=bob)

        elif visual == "clip2_focus_sprint_xp":
            screen = load_image("phone-05-focus-sprint.png")
            if screen:
                sw = 540
                sh = int(screen.height * (sw / screen.width))
                screen_resized = screen.resize((sw, sh), Image.Resampling.LANCZOS)
                base.paste(screen_resized, (WIDTH//2 - sw//2, 360))
            draw.text((WIDTH//2 - 270, 250), "10-MINUTE FOCUS SPRINT", font=font_bold_huge, fill=(255, 255, 255))
            draw_sprout(base, sprout_img, 840, 960, scale=0.55, bob=bob)

    elif 11 <= sc["line"] <= 13:
        # Act 3: Why ours is better
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(8, 18, 44, 255))
        
        if visual == "comparison_panel":
            draw.text((WIDTH//2 - 290, 240), "THE DIFFERENCE", font=font_bold_huge, fill=(255, 255, 255))
            
            # 3-row Comparison Table
            headers = [("Memorise Tonight", (239, 68, 68)), ("Understand For Good", (52, 211, 153))]
            draw.text((200, 360), headers[0][0], font=font_bold_med, fill=headers[0][1])
            draw.text((580, 360), headers[1][0], font=font_bold_med, fill=headers[1][1])
            
            rows = [
                ("Re-reading the page", "Explaining & building"),
                ("One brutal 6-hr cram", "Small 10-min sprints"),
                ("Forgot by next week", "Strong next-year base")
            ]
            for r_i, (col1, col2) in enumerate(rows):
                y_box = 440 + r_i * 180
                # Left box
                draw.rounded_rectangle([160, y_box, 500, y_box + 140], radius=16, fill=(30, 41, 59, 220), outline=(239, 68, 68, 120))
                draw.text((190, y_box + 50), col1, font=font_regular, fill=(255, 255, 255))
                # Right box
                draw.rounded_rectangle([560, y_box, 920, y_box + 140], radius=16, fill=(15, 23, 42, 240), outline=(52, 211, 153, 200), width=2)
                draw.text((590, y_box + 50), col2, font=font_bold_med, fill=(255, 255, 255))
                
            draw_sprout(base, sprout_img, WIDTH//2, 1240, scale=0.60, bob=bob)

        elif visual == "evaluation_diagnostic":
            draw.text((WIDTH//2 - 280, 260), "\"HOW AM I DOING?\"", font=font_bold_huge, fill=(255, 255, 255))
            draw.text((WIDTH//2 - 230, 350), "Real-Time Diagnostic Evaluation", font=font_bold_med, fill=(96, 165, 250))
            
            # Diagnostic evaluation card
            draw.rounded_rectangle([160, 480, 920, 1040], radius=24, fill=(15, 23, 42, 240), outline=(96, 165, 250, 200), width=2)
            draw.text((220, 540), "🧭 Diagnostic Evidence", font=font_bold_large, fill=(255, 255, 255))
            draw.text((220, 620), "• Analyzes your wrong answers directly", font=font_regular, fill=(203, 213, 225))
            draw.text((220, 700), "• Pinpoints exact misconception gaps", font=font_regular, fill=(203, 213, 225))
            draw.text((220, 780), "• Gives you a tailored 5-step recovery plan", font=font_regular, fill=(52, 211, 153))
            draw.text((220, 880), "Spend time ONLY where you need it.", font=font_bold_med, fill=(245, 158, 11))
            draw_sprout(base, sprout_img, WIDTH//2, 1220, scale=0.62, bob=bob)

        elif visual == "backflip_confidence":
            draw.text((WIDTH//2 - 270, 320), "CONFIDENT EXAMS", font=font_bold_huge, fill=(255, 255, 255))
            draw.text((WIDTH//2 - 210, 410), "Learn it once. Properly.", font=font_bold_large, fill=(52, 211, 153))
            
            # Confidence checkmarks
            draw.text((WIDTH//2 - 220, 560), "✓ No panic cramming", font=font_bold_med, fill=(255, 255, 255))
            draw.text((WIDTH//2 - 220, 640), "✓ Genuine mastery", font=font_bold_med, fill=(255, 255, 255))
            draw.text((WIDTH//2 - 220, 720), "✓ Real retention that lasts", font=font_bold_med, fill=(255, 255, 255))
            
            draw_sprout(base, sprout_img, WIDTH//2, 1060, scale=0.72, bob=bob)

    else:
        # Close: End Card
        draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(8, 16, 36, 255))
        for r in range(600, 100, -70):
            alpha = int(35 * (1.0 - r / 600.0))
            draw.ellipse([WIDTH//2 - r, 720 - r, WIDTH//2 + r, 720 + r], outline=(37, 99, 235, alpha), width=5)
            
        draw.text((WIDTH//2 - 260, 320), "SUNROOTLEARN", font=font_bold_huge, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 270, 430), "Understand it. Build it. Prove it.", font=font_bold_large, fill=(96, 165, 250))
        
        draw_sprout(base, sprout_img, WIDTH//2, 850, scale=0.78, bob=bob)
        
        # CTA Pill
        draw.rounded_rectangle([240, 1180, 840, 1300], radius=60, fill=(37, 99, 235, 255), outline=(255, 255, 255, 200), width=2)
        draw.text((WIDTH//2 - 190, 1220), "START FREE TODAY", font=font_bold_large, fill=(255, 255, 255))
        draw.text((WIDTH//2 - 230, 1340), "sunrootlearn.vercel.app", font=font_mono, fill=(147, 197, 253))

    # Always draw caption pill at the bottom
    draw_caption(draw, sc["caption"])
    
    return np.array(base.convert("RGB"))

def render_film():
    with open(TIMELINE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    scenes = data["scenes"]
    total_dur = data["total_duration"]
    
    out_raw_video = os.path.join(OUTPUT_DIR, "raw_video.mp4")
    out_final_9_16 = os.path.join(OUTPUT_DIR, "sunroot_intake_2min.mp4")
    out_final_1_1 = os.path.join(OUTPUT_DIR, "sunroot_intake_square.mp4")
    out_final_16_9 = os.path.join(OUTPUT_DIR, "sunroot_intake_horizontal.mp4")
    out_ad_30s = os.path.join(OUTPUT_DIR, "sunroot_ad_30s.mp4")
    
    total_frames = int(total_dur * FPS)
    print(f"Rendering {total_frames} frames ({total_dur}s at {FPS} fps)...")
    
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-crf", "18",
        out_raw_video
    ]
    
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    
    for f_idx in range(total_frames):
        t_abs = f_idx / float(FPS)
        # Find current scene
        curr_sc = scenes[-1]
        for s in scenes:
            if s["start"] <= t_abs < s["end"]:
                curr_sc = s
                break
        t_rel = t_abs - curr_sc["start"]
        
        frame = render_scene_frame(curr_sc, t_rel, t_abs)
        proc.stdin.write(frame.tobytes())
        
        if f_idx % (FPS * 10) == 0:
            print(f"  Rendered {f_idx}/{total_frames} frames ({int(t_abs)}s)...")
            
    proc.stdin.close()
    proc.wait()
    print("Raw video render complete!")
    
    # Multiplex with master soundtrack
    print("Muxing audio soundtrack into final 9:16 video...")
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
    print(f"9:16 Video complete: {out_final_9_16}")
    
    # 1:1 Square crop
    print("Generating 1:1 Square cut...")
    subprocess.run([
        "ffmpeg", "-y",
        "-i", out_final_9_16,
        "-vf", "crop=1080:1080:0:(in_h-out_h)/2",
        "-c:a", "copy",
        out_final_1_1
    ], check=True)
    print(f"1:1 Video complete: {out_final_1_1}")
    
    # 16:9 Horizontal letterbox cut
    print("Generating 16:9 Horizontal cut...")
    subprocess.run([
        "ffmpeg", "-y",
        "-i", out_final_9_16,
        "-vf", "scale=608:1080,pad=1920:1080:(1920-608)/2:0:black",
        "-c:a", "copy",
        out_final_16_9
    ], check=True)
    print(f"16:9 Video complete: {out_final_16_9}")
    
    # 30s Social Cut-Down (Acts 1 + 2 Highlights)
    print("Generating 30s Social Ad cut...")
    subprocess.run([
        "ffmpeg", "-y",
        "-ss", "00:00:16",
        "-i", out_final_9_16,
        "-t", "30",
        "-c", "copy",
        out_ad_30s
    ], check=True)
    print(f"30s Social Ad complete: {out_ad_30s}")

if __name__ == "__main__":
    render_film()
