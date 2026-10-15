import { ttRpmAt } from "../parts/library";
import type { Joint, Trigger } from "../spec";

/** Output of a circuit part as the simulator reports it (motor volts / servo angle). */
export interface PartOut {
  on: boolean;
  level: number;
  volts?: number;
  brake?: boolean;
  angle?: number;
}

/** SG90 datasheet: 0.1 s per 60° = 600 °/s */
export const SERVO_DEG_PER_S = 600;

/**
 * Kinematics for machine joints. A motor sets the joint's speed (from the voltage the driver really
 * delivers, via the TT-motor curve); a servo sets its angle and swings there at its datasheet speed.
 * Limits stop the joint, and `applyTriggers` turns the joint's position into limit-switch presses and
 * sensor values the code can read — the loop that makes the whole machine one system.
 */
export class JointRig {
  values: Record<string, number> = {};

  constructor(readonly joints: Joint[]) {
    for (const j of joints) this.values[j.id] = Math.max(j.min, Math.min(j.max, j.initial));
  }

  step(dt: number, outs: Record<string, PartOut | undefined>) {
    for (const j of this.joints) {
      let v = this.values[j.id];
      if (j.servo) {
        const o = outs[j.servo];
        if (o?.on) {
          const target = Math.max(j.min, Math.min(j.max, o.angle ?? 90));
          const maxStep = (j.rate > 90 ? j.rate : SERVO_DEG_PER_S) * dt;
          v += Math.max(-maxStep, Math.min(maxStep, target - v));
        }
      } else if (j.motor) {
        const o = outs[j.motor];
        if (o?.on && !o.brake) {
          const volts = o.volts ?? Math.sign(o.level) * o.level * 6;
          v += Math.sign(volts) * (ttRpmAt(volts) / ttRpmAt(6)) * j.rate * dt;
        }
      }
      this.values[j.id] = Math.max(j.min, Math.min(j.max, v));
    }
  }

  /** Presses limit switches and sets position sensors; returns true when a pressed state changed. */
  applyTriggers(triggers: Trigger[], inputs: { pressed: Set<string>; values: Record<string, number> }): boolean {
    let changed = false;
    for (const t of triggers) {
      const j = this.joints.find((x) => x.id === t.joint);
      if (!j) continue;
      const v = this.values[j.id];
      if (t.kind === "limit") {
        const on = Math.abs(v - (t.at === "min" ? j.min : j.max)) <= t.tolerance;
        if (on !== inputs.pressed.has(t.part)) {
          if (on) inputs.pressed.add(t.part);
          else inputs.pressed.delete(t.part);
          changed = true;
        }
      } else {
        const span = j.max - j.min || 1;
        inputs.values[t.part] = Math.round((1023 * (v - j.min)) / span);
      }
    }
    return changed;
  }
}
