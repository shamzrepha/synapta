import type { GraphSpec } from "./types";

const BG = "#0b1220";
const GRID = "#1e293b";
const AXIS = "#94a3b8";

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number, color = BG) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

/** A "nice" tick step for a span. */
export function niceStep(span: number, target = 5): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

export function extent(g: GraphSpec): { x0: number; x1: number; y0: number; y1: number } {
  const xs = g.series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = g.series.flatMap((s) => s.points.map((p) => p[1]));
  const x0 = g.xRange?.[0] ?? Math.min(...xs, 0);
  let x1 = g.xRange?.[1] ?? Math.max(...xs, 1);
  const y0 = g.yRange?.[0] ?? Math.min(...ys, 0);
  let y1 = g.yRange?.[1] ?? Math.max(...ys, 1);
  if (x1 - x0 < 1e-9) x1 = x0 + 1;
  if (y1 - y0 < 1e-9) y1 = y0 + 1;
  if (!g.yRange) y1 += (y1 - y0) * 0.05;
  if (!g.xRange) x1 += (x1 - x0) * 0.02;
  return { x0, x1, y0, y1 };
}

/** Draws a line graph with axes, gridlines, labels and markers. `t` moves the animated marker. */
export function drawGraph(ctx: CanvasRenderingContext2D, w: number, h: number, g: GraphSpec, t = 0) {
  clear(ctx, w, h);
  const padL = 44;
  const padR = 12;
  const padT = 22;
  const padB = 34;
  const { x0, x1, y0, y1 } = extent(g);
  const X = (x: number) => padL + ((x - x0) / (x1 - x0)) * (w - padL - padR);
  const Y = (y: number) => h - padB - ((y - y0) / (y1 - y0)) * (h - padT - padB);
  ctx.font = "10px sans-serif";
  ctx.lineWidth = 1;
  const sx = niceStep(x1 - x0);
  const sy = niceStep(y1 - y0);
  ctx.fillStyle = AXIS;
  ctx.strokeStyle = GRID;
  ctx.textAlign = "center";
  for (let x = Math.ceil(x0 / sx) * sx; x <= x1 + 1e-9; x += sx) {
    ctx.beginPath();
    ctx.moveTo(X(x), padT);
    ctx.lineTo(X(x), h - padB);
    ctx.stroke();
    ctx.fillText(String(+x.toFixed(6)), X(x), h - padB + 12);
  }
  ctx.textAlign = "right";
  for (let y = Math.ceil(y0 / sy) * sy; y <= y1 + 1e-9; y += sy) {
    ctx.beginPath();
    ctx.moveTo(padL, Y(y));
    ctx.lineTo(w - padR, Y(y));
    ctx.stroke();
    ctx.fillText(String(+y.toFixed(6)), padL - 4, Y(y) + 3);
  }
  ctx.strokeStyle = AXIS;
  ctx.strokeRect(padL, padT, w - padL - padR, h - padT - padB);
  ctx.fillStyle = "#e2e8f0";
  ctx.textAlign = "center";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText(g.title, w / 2, 13);
  ctx.font = "10px sans-serif";
  ctx.fillText(g.xLabel, (padL + w - padR) / 2, h - 4);
  ctx.save();
  ctx.translate(11, (padT + h - padB) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(g.yLabel, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, w - padL - padR, h - padT - padB);
  ctx.clip();
  for (const s of g.series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(s.dashed ? [5, 4] : []);
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const dot = (p: [number, number], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(X(p[0]), Y(p[1]), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  if (g.marker) dot(g.marker, "#fbbf24");
  const at = g.markerAt?.(t);
  if (at) dot(at, "#f472b6");
  ctx.restore();
}
