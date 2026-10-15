import type { Robot } from "../spec";
import { nearest, type Obstacle, type Track } from "./track";
import { ttRpmAt } from "../parts/library";

/**
 * Top-down physics for a two-wheel-drive robot (the "digital twin").
 * - each motor's power and direction come from the simulated circuit (PWM duty through the driver)
 * - wheel speed follows the command with motor lag, so the robot accelerates like a real one
 * - the body moves by differential-drive kinematics (v = (vL+vR)/2, ω = (vR−vL)/track)
 * - line sensors read how dark the floor is under them (the path is a dark line on a light floor)
 * Frame: x right, z back (nose points to −z), heading h turns anticlockwise seen from above.
 */

export interface MotorOut {
  on: boolean;
  level: number;
  direction?: 1 | -1;
  /** average voltage across the motor after the driver's drop (from the circuit) */
  volts?: number;
  brake?: boolean;
}

export interface Pose {
  x: number;
  z: number;
  /** radians; forward is (−sin h, −cos h) */
  h: number;
}

const LAG = 0.12; // motor/wheel response time (s)
const EDGE = 3; // sensor transition width (mm)

export class DriveSim {
  pose: Pose;
  /** wheel angular speeds (rad/s), positive = forward */
  wl = 0;
  wr = 0;
  time = 0;
  distance = 0;
  /** seconds with the robot centre on the line (within half the line width + a margin) */
  onLine = 0;
  /** distance travelled forward along the path (mm), unwrapped; laps = progress / length */
  progress = 0;
  private lastS: number;
  /** times the robot ran into a wall or obstacle */
  hits = 0;
  touching = false;
  /** where (mm) and when (s) the robot last ran into something */
  lastHit: { x: number; z: number; t: number } | null = null;
  trail: Array<[number, number]> = [];
  private trailAt = 0;

  constructor(readonly robot: Robot, readonly track: Track) {
    this.pose = { x: track.start.x, z: track.start.z, h: track.start.heading };
    this.lastS = nearest(track, this.pose.x, this.pose.z).s;
  }

  /** forward speed of each wheel (mm/s) */
  get speeds() {
    const r = this.robot.wheelRadius;
    return { left: this.wl * r, right: this.wr * r };
  }

  /** Where a sensor mounted at (sx, sz) on the robot is in the world. */
  sensorWorld(sx: number, sz: number): [number, number] {
    const c = Math.cos(this.pose.h);
    const s = Math.sin(this.pose.h);
    return [this.pose.x + sx * c + sz * s, this.pose.z - sx * s + sz * c];
  }

  /** What a robot sensor reads right now: line sensors 0–1023, distance sensors in cm (999 = nothing in range). */
  read(s: { x: number; z: number; kind?: string; angle?: number }): number {
    return s.kind === "distance" ? this.range(s.x, s.z, s.angle || 0) : this.sensor(s.x, s.z);
  }

  /**
   * HC-SR04: nearest object within its 15° cone (three rays), 2 cm – 4 m (datasheet). Returns cm,
   * or 999 when nothing is in range. Rays hit the arena walls and obstacles.
   */
  range(sx: number, sz: number, angleDeg: number): number {
    const [ox, oz] = this.sensorWorld(sx, sz);
    let best = Infinity;
    for (const off of [-7.5, 0, 7.5]) {
      const a = this.pose.h + ((angleDeg + off) * Math.PI) / 180;
      const dx = -Math.sin(a);
      const dz = -Math.cos(a);
      best = Math.min(best, castRay(this.track, ox, oz, dx, dz, 4000));
    }
    const cm = best / 10;
    return cm < 2 || cm > 400 ? 999 : Math.round(cm * 10) / 10;
  }

  /** Reflectance sensor reading 0–1023: ~900 over the dark line, ~80 over the light floor, soft edges. */
  sensor(sx: number, sz: number): number {
    const [x, z] = this.sensorWorld(sx, sz);
    const d = nearest(this.track, x, z).dist;
    const half = this.track.width / 2;
    const k = Math.max(0, Math.min(1, (half + EDGE - d) / (2 * EDGE)));
    return Math.round(80 + 820 * k);
  }

  /** Wheel speed (rad/s) a motor output asks for. With a real voltage the TT-motor datasheet curve applies (rpm ≈ 43.3·V − 10, 250 rpm at 6 V). */
  private target(m: MotorOut | undefined): number {
    if (!m || !m.on || m.brake) return 0;
    const full = (this.robot.maxRpm * 2 * Math.PI) / 60;
    if (m.volts !== undefined) return Math.sign(m.volts) * (ttRpmAt(m.volts) / ttRpmAt(6)) * full;
    return (m.direction || 1) * Math.max(0, Math.min(1, m.level)) * full;
  }

  step(dt: number, left: MotorOut | undefined, right: MotorOut | undefined) {
    const aL = Math.min(1, dt / (left?.brake ? 0.03 : LAG));
    const aR = Math.min(1, dt / (right?.brake ? 0.03 : LAG));
    this.wl += (this.target(left) - this.wl) * aL;
    this.wr += (this.target(right) - this.wr) * aR;
    const { left: vl, right: vr } = this.speeds;
    const v = (vl + vr) / 2;
    const w = (vr - vl) / this.robot.trackWidth;
    const mid = this.pose.h + (w * dt) / 2;
    this.pose.x += -Math.sin(mid) * v * dt;
    this.pose.z += -Math.cos(mid) * v * dt;
    this.pose.h += w * dt;
    collideBody(this);
    this.time += dt;
    this.distance += Math.abs(v) * dt;

    const n = nearest(this.track, this.pose.x, this.pose.z);
    if (this.track.pts.length && n.dist <= this.track.width / 2 + 6) this.onLine += dt;
    let ds = n.s - this.lastS;
    const L = this.track.length;
    if (this.track.closed) {
      if (ds < -L / 2) ds += L;
      else if (ds > L / 2) ds -= L;
    }
    // only count progress while still near the path (shortcuts across the infield don't count)
    if (n.dist < this.track.width * 3) this.progress += ds;
    this.lastS = n.s;

    this.trailAt += Math.abs(v) * dt;
    if (this.trailAt > 6) {
      this.trailAt = 0;
      this.trail.push([this.pose.x, this.pose.z]);
      if (this.trail.length > 1500) this.trail.shift();
    }
  }
}

/** Body radius used for collisions: the chassis reaches 60% of its length ahead of the axle, so the nose never passes through a wall. */
function bodyRadius(r: Robot): number {
  return Math.max(r.trackWidth / 2 + r.wheelWidth / 2, r.length * 0.6);
}

/** Distance (mm) along a ray to the arena walls or the nearest obstacle; Infinity when nothing is hit within `max`. */
export function castRay(track: Track, ox: number, oz: number, dx: number, dz: number, max: number): number {
  let best = Infinity;
  const consider = (t: number) => {
    if (t >= 0 && t < best && t <= max) best = t;
  };
  if (track.arena) {
    const hw = track.arena.width / 2;
    const hd = track.arena.depth / 2;
    if (dx > 1e-9) consider((hw - ox) / dx);
    if (dx < -1e-9) consider((-hw - ox) / dx);
    if (dz > 1e-9) consider((hd - oz) / dz);
    if (dz < -1e-9) consider((-hd - oz) / dz);
  }
  for (const o of track.obstacles) {
    if (o.shape === "box") {
      const x0 = o.x - o.w / 2;
      const x1 = o.x + o.w / 2;
      const z0 = o.z - o.d / 2;
      const z1 = o.z + o.d / 2;
      let tmin = -Infinity;
      let tmax = Infinity;
      for (const [p, d, lo, hi] of [[ox, dx, x0, x1], [oz, dz, z0, z1]] as const) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) {
            tmin = Infinity;
            break;
          }
        } else {
          const a = (lo - p) / d;
          const b = (hi - p) / d;
          tmin = Math.max(tmin, Math.min(a, b));
          tmax = Math.min(tmax, Math.max(a, b));
        }
      }
      if (tmin <= tmax && tmax >= 0) consider(Math.max(tmin, 0));
    } else {
      const fx = ox - o.x;
      const fz = oz - o.z;
      const b = fx * dx + fz * dz;
      const c = fx * fx + fz * fz - o.r * o.r;
      const disc = b * b - c;
      if (disc >= 0) {
        const t = -b - Math.sqrt(disc);
        if (t >= 0) consider(t);
        else if (-b + Math.sqrt(disc) >= 0) consider(0);
      }
    }
  }
  return best;
}

/** Push the robot's circular body out of walls and obstacles, counting each new impact. */
function collideBody(sim: DriveSim) {
  const R = bodyRadius(sim.robot);
  const p = sim.pose;
  let hit = false;
  const t = sim.track;
  if (t.arena) {
    const hw = t.arena.width / 2 - R;
    const hd = t.arena.depth / 2 - R;
    if (p.x > hw) ((p.x = hw), (hit = true));
    if (p.x < -hw) ((p.x = -hw), (hit = true));
    if (p.z > hd) ((p.z = hd), (hit = true));
    if (p.z < -hd) ((p.z = -hd), (hit = true));
  }
  for (const o of t.obstacles as Obstacle[]) {
    if (o.shape === "box") {
      const cx = Math.max(o.x - o.w / 2, Math.min(p.x, o.x + o.w / 2));
      const cz = Math.max(o.z - o.d / 2, Math.min(p.z, o.z + o.d / 2));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < R) {
        hit = true;
        if (d > 1e-6) ((p.x = cx + (dx / d) * R), (p.z = cz + (dz / d) * R));
        else p.x = o.x + o.w / 2 + R;
      }
    } else {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < R + o.r) {
        hit = true;
        const k = d > 1e-6 ? (R + o.r) / d : 1;
        p.x = o.x + dx * k;
        p.z = o.z + dz * k;
      }
    }
  }
  if (hit && !sim.touching) {
    sim.hits++;
    sim.lastHit = { x: sim.pose.x, z: sim.pose.z, t: sim.time };
  }
  sim.touching = hit;
}
