import type { World } from "../spec";

export type Pt = [number, number];

export type Obstacle = { shape: "box"; x: number; z: number; w: number; d: number; h: number } | { shape: "cylinder"; x: number; z: number; r: number; h: number };

export interface Track {
  /** the line (empty when the world has no line) */
  pts: Pt[];
  obstacles: Obstacle[];
  /** walls around the floor, centred on the origin */
  arena?: { width: number; depth: number };
  closed: boolean;
  width: number;
  /** cumulative arc length at each point (mm) */
  cum: number[];
  length: number;
  start: { x: number; z: number; heading: number };
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 18): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as Pt;
  });
}

/** Ready-made tracks (mm). All are centred on the origin and run clockwise seen from above. */
export function presetPoints(preset: string): { pts: Pt[]; closed: boolean } {
  switch (preset) {
    case "square": {
      const h = 320;
      const r = 90;
      return {
        closed: true,
        pts: [...arc(h - r, -h + r, r, -Math.PI / 2, 0), ...arc(h - r, h - r, r, 0, Math.PI / 2), ...arc(-h + r, h - r, r, Math.PI / 2, Math.PI), ...arc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5)],
      };
    }
    case "scurve": {
      const pts: Pt[] = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        pts.push([-450 + t * 900, Math.sin(t * Math.PI * 2) * 160]);
      }
      return { closed: false, pts };
    }
    case "zigzag":
      return {
        closed: false,
        pts: [[-450, -120], [-250, -120], [-150, 120], [50, 120], [150, -120], [350, -120], [450, 100]],
      };
    default: {
      // oval (stadium): two straights joined by half circles
      const r = 150;
      const half = 220;
      return { closed: true, pts: [...arc(half, 0, r, -Math.PI / 2, Math.PI / 2, 24), ...arc(-half, 0, r, Math.PI / 2, (Math.PI * 3) / 2, 24)] };
    }
  }
}

export function resolveTrack(world: World): Track {
  const t = world.track;
  const obstacles = (world.obstacles || []) as Obstacle[];
  if (!t) {
    // no line: an open floor (arena and obstacles only)
    const s = world.start ? { x: world.start.x, z: world.start.z, heading: (world.start.heading * Math.PI) / 180 } : { x: 0, z: world.arena ? world.arena.depth / 2 - 120 : 0, heading: 0 };
    return { pts: [], obstacles, arena: world.arena, closed: false, width: 0, cum: [0], length: 1, start: s };
  }
  const base = t.points && t.points.length >= 2 ? { pts: t.points as Pt[], closed: t.closed } : presetPoints(t.preset || "oval");
  const pts = base.pts;
  const closed = base.closed && pts.length > 2;
  const cum = [0];
  const n = pts.length;
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = cum[n - 1] + (closed ? Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) : 0);
  const p0 = pts[0];
  const p1 = pts[1];
  // heading: forward vector is (−sin h, −cos h); solve for the first segment direction
  const dx = p1[0] - p0[0];
  const dz = p1[1] - p0[1];
  const heading = Math.atan2(-dx, -dz);
  const start = world.start ? { x: world.start.x, z: world.start.z, heading: (world.start.heading * Math.PI) / 180 } : { x: p0[0], z: p0[1], heading };
  return { pts, obstacles, arena: world.arena, closed, width: t.width, cum, length: Math.max(length, 1), start };
}

/** Nearest point on the path: distance (mm) and arc length along the path (mm). */
export function nearest(track: Track, x: number, z: number): { dist: number; s: number } {
  const { pts, closed, cum } = track;
  if (pts.length < 2) return { dist: Infinity, s: 0 };
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let best = Infinity;
  let bestS = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const len2 = abx * abx + abz * abz;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / len2)) : 0;
    const px = a[0] + abx * u;
    const pz = a[1] + abz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bestS = cum[i] + Math.sqrt(len2) * u;
    }
  }
  return { dist: best, s: bestS };
}
