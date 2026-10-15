import { describe, it, expect } from "vitest";
import { parseSpec } from "../spec";
import { getTemplate } from "../templates";
import { simulateDrive } from "./run";
import { DriveSim } from "./physics";
import { resolveTrack } from "./track";
import { sceneParts } from "../circuit/to3d";

const line = () => parseSpec(getTemplate("line-follower")!.spec);

describe("robot physics", () => {
  const robot = { wheelRadius: 20, trackWidth: 100, length: 140, wheelWidth: 14, maxRpm: 120, left: "mL", right: "mR", sensors: [], body: "auto" as const };
  const track = resolveTrack({ track: { preset: "oval", width: 18, closed: true } });
  const on = { on: true, level: 1, direction: 1 as const };

  it("drives straight when both wheels match, and moves along its nose (−z)", () => {
    const d = new DriveSim(robot, track);
    d.pose = { x: 0, z: 0, h: 0 };
    for (let i = 0; i < 200; i++) d.step(0.01, on, on);
    expect(d.pose.z).toBeLessThan(-100);
    expect(Math.abs(d.pose.x)).toBeLessThan(1e-6);
    expect(Math.abs(d.pose.h)).toBeLessThan(1e-9);
  });

  it("turns left (anticlockwise) when the right wheel is faster, and spins on the spot with opposite wheels", () => {
    const d = new DriveSim(robot, track);
    d.pose = { x: 0, z: 0, h: 0 };
    for (let i = 0; i < 100; i++) d.step(0.01, { on: true, level: 0.3, direction: 1 }, on);
    expect(d.pose.h).toBeGreaterThan(0.3);
    expect(d.pose.x).toBeLessThan(0); // nose −z, turning left → drifts to −x
    const s = new DriveSim(robot, track);
    s.pose = { x: 0, z: 0, h: 0 };
    for (let i = 0; i < 100; i++) s.step(0.01, { on: true, level: 1, direction: -1 }, on);
    expect(Math.hypot(s.pose.x, s.pose.z)).toBeLessThan(5);
    expect(Math.abs(s.pose.h)).toBeGreaterThan(1);
  });

  it("sensors see the dark line and the light floor", () => {
    const d = new DriveSim(robot, track);
    expect(d.sensor(0, 0)).toBeGreaterThan(800);
    expect(d.sensor(80, 0)).toBeLessThan(120);
  });
});

describe("line-following digital twin", { timeout: 60000 }, () => {
  it("the template robot finishes a lap and stays on the line", () => {
    const r = simulateDrive(line(), 20, 0.02);
    expect(r.error).toBeNull();
    expect(r.laps).toBeGreaterThan(0.9);
    expect(r.onLineFraction).toBeGreaterThan(0.8);
  });

  it("a robot with no steering code (drives straight) leaves the line", () => {
    const s = line();
    s.code = "function setup(){pinMode(5,OUTPUT);pinMode(6,OUTPUT);}\nfunction loop(){analogWrite(5,190);analogWrite(6,190);}";
    const r = simulateDrive(s, 12, 0.02);
    expect(r.onLineFraction).toBeLessThan(0.6);
  });

  it("unpowered sensors make the robot blind, so it leaves the line", () => {
    const s = line();
    s.circuit = { ...s.circuit!, wires: s.circuit!.wires.filter((w) => !/^s[LR]\.(vcc|gnd)$/.test(w.from) && !/^s[LR]\.(vcc|gnd)$/.test(w.to)) };
    const r = simulateDrive(s, 12, 0.02);
    expect(r.onLineFraction).toBeLessThan(0.6);
  });

  it("the 3D body is assembled with both wheels on one axle at ±track/2", () => {
    const parts = sceneParts(line());
    const tyres = parts.filter((p) => p.id.startsWith("rb_tyre"));
    expect(tyres).toHaveLength(2);
    expect(tyres.map((p) => p.pos[0]).sort((a, b) => a - b)).toEqual([-56, 56]);
    expect(new Set(tyres.map((p) => p.pos[2])).size).toBe(1);
    expect(tyres.every((p) => p.moves && p.bind)).toBe(true);
    expect(parts.filter((p) => p.id.startsWith("rb_sens_")).every((p) => p.pos[2] < -50)).toBe(true);
  });
});

import { repairSpec } from "../design-ai";
describe("AI robot designs are repaired into something that can drive", () => {
  it("fixes motor ids, drops unknown sensors, flips positive sensor z, adds a world", () => {
    const messy = JSON.parse(JSON.stringify(line()));
    messy.robot = { ...messy.robot, left: "nope", right: "alsoNope", sensors: [{ id: "sL", x: -17, z: 78 }, { id: "ghost", x: 0, z: -50 }], body: "auto" };
    delete messy.world;
    const fixed = parseSpec(repairSpec(messy));
    expect(fixed.robot!.left).toBe("mL");
    expect(fixed.robot!.right).toBe("mR");
    expect(fixed.robot!.sensors).toEqual([{ id: "sL", x: -17, z: -78 }]);
    expect(fixed.world?.track.preset).toBe("oval");
  });
  it("a robot with no motors in the circuit is dropped instead of crashing", () => {
    const s = JSON.parse(JSON.stringify(line()));
    s.circuit.parts = s.circuit.parts.filter((p: { type: string }) => p.type !== "dc_motor");
    const fixed = parseSpec(repairSpec(s));
    expect(fixed.robot).toBeUndefined();
    expect(fixed.world).toBeUndefined();
  });
});
