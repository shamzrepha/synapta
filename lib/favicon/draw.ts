import type { FaviconFrame } from "./frames";

/** Draws Sprout (same geometry as components/bot/sprout.tsx, viewBox 100x112) onto a square canvas. */
export function drawSprout(ctx: CanvasRenderingContext2D, size: number, f: FaviconFrame): void {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  const s = size / 112;
  ctx.translate((size - 100 * s) / 2, 0);
  ctx.scale(s, s);
  ctx.translate(0, 4 - f.lift);
  if (f.ring) {
    ctx.strokeStyle = f.ring;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(19, 31, 62, 68, 29);
    ctx.stroke();
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = "#0d9488";
  ctx.lineWidth = 3.5;
  ctx.stroke(new Path2D("M50 36 C50 26 49 20 47 14"));
  ctx.fillStyle = "#14b8a6";
  ctx.fill(new Path2D("M47 15 C36 8 28 13 27 21 C36 24 44 22 47 15 Z"));
  ctx.fillStyle = "#0d9488";
  ctx.fill(new Path2D("M48 16 C58 6 70 9 72 18 C62 22 52 21 48 16 Z"));
  ctx.fillStyle = f.arm;
  ctx.beginPath(); ctx.roundRect(14, 62, 14, 9, 4.5); ctx.fill();
  ctx.beginPath(); ctx.roundRect(72, 62, 14, 9, 4.5); ctx.fill();
  ctx.fillStyle = f.body;
  ctx.beginPath(); ctx.roundRect(22, 34, 56, 62, 26); ctx.fill();
  const g = ctx.createLinearGradient(0, 34, 0, 96);
  g.addColorStop(0, "rgba(255,255,255,0.18)");
  g.addColorStop(1, f.shade + "99");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(22, 34, 56, 62, 26); ctx.fill();
  ctx.fillStyle = "#eef3ff";
  ctx.beginPath(); ctx.roundRect(28, 42, 44, 34, 15); ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3;
  for (const cx of [41, 59]) {
    if (f.eyes === "open") {
      ctx.beginPath(); ctx.ellipse(cx, 58, 4.6, 5.4, 0, 0, Math.PI * 2); ctx.fill();
    } else if (f.eyes === "closed") {
      ctx.beginPath(); ctx.moveTo(cx - 4.5, 58); ctx.lineTo(cx + 4.5, 58); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx, 60, 4.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  }
  ctx.stroke(new Path2D("M44 67 Q50 72 56 67"));
  ctx.fillStyle = f.arm;
  ctx.beginPath(); ctx.ellipse(38, 97, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(62, 97, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (f.badge === "flame") {
    ctx.fillStyle = "#fb923c";
    ctx.fill(new Path2D("M82 40 q-9 -10 -2 -22 q2 8 9 10 q5 -6 1 -16 q15 10 8 28z"));
  } else if (f.badge === "z") {
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText("z", 78, 34);
  } else if (f.badge === "spark" || f.badge === "star") {
    ctx.fillStyle = f.badge === "spark" ? "#f59e0b" : "#fde68a";
    ctx.fill(new Path2D("M84 8 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"));
  }
  ctx.restore();
}
