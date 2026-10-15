import { Netlist, evaluateOutputs } from "../circuit/netlist";
import { BoardRuntime, circuitReader } from "../circuit/runtime";
import type { DesignSpec } from "../spec";
import { DriveSim } from "./physics";
import { resolveTrack } from "./track";

export interface DriveResult {
  drive: DriveSim;
  error: string | null;
  seconds: number;
  /** fraction of the time the robot was on the line */
  onLineFraction: number;
  /** laps (or fraction of the path) completed */
  laps: number;
}

/**
 * Runs a design's code on the simulated board with the robot in its world — headless, same engine as
 * the live view — so tests, scoring and "does my robot work?" checks all agree with what you see.
 */
export function simulateDrive(spec: DesignSpec, seconds: number, dt = 0.01): DriveResult {
  if (!spec.circuit || !spec.robot || !spec.world) throw new Error("This design has no robot and world to simulate.");
  const drive = new DriveSim(spec.robot, resolveTrack(spec.world));
  const inputs = { pressed: new Set<string>(), values: {} as Record<string, number> };
  const rt = new BoardRuntime(spec.code || "", circuitReader(spec.circuit, inputs));
  const nl = new Netlist(spec.circuit, inputs.pressed);
  for (let t = 0; t < seconds && !rt.error; t += dt) {
    for (const s of spec.robot.sensors) inputs.values[s.id] = drive.sensor(s.x, s.z);
    rt.advance(Math.round(t * 1000), 2_000_000);
    const outs = evaluateOutputs(nl, rt.pins);
    drive.step(dt, outs[spec.robot.left], outs[spec.robot.right]);
  }
  return { drive, error: rt.error, seconds, onLineFraction: drive.time ? drive.onLine / drive.time : 0, laps: drive.progress / drive.track.length };
}
