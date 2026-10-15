import type { Robot } from "../spec";
import { nearest, type Track } from "./track";

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

  /** Reflectance sensor reading 0–1023: ~900 over the dark line, ~80 over the light floor, soft edges. */
  sensor(sx: number, sz: number): number {
    const [x, z] = this.sensorWorld(sx, sz);
    const d = nearest(this.track, x, z).dist;
    const half = this.track.width / 2;
    const k = Math.max(0, Math.min(1, (half + EDGE - d) / (2 * EDGE)));
    return Math.round(80 + 820 * k);
  }

  private target(m: MotorOut | undefined): number {
    if (!m || !m.on) return 0;
    return (m.direction || 1) * Math.max(0, Math.min(1, m.level)) * ((this.robot.maxRpm * 2 * Math.PI) / 60);
  }

  step(dt: number, left: MotorOut | undefined, right: MotorOut | undefined) {
    const a = Math.min(1, dt / LAG);
    this.wl += (this.target(left) - this.wl) * a;
    this.wr += (this.target(right) - this.wr) * a;
    const { left: vl, right: vr } = this.speeds;
    const v = (vl + vr) / 2;
    const w = (vr - vl) / this.robot.trackWidth;
    const mid = this.pose.h + (w * dt) / 2;
    this.pose.x += -Math.sin(mid) * v * dt;
    this.pose.z += -Math.cos(mid) * v * dt;
    this.pose.h += w * dt;
    this.time += dt;
    this.distance += Math.abs(v) * dt;

    const n = nearest(this.track, this.pose.x, this.pose.z);
    if (n.dist <= this.track.width / 2 + 6) this.onLine += dt;
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
