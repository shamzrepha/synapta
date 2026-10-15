import { CATALOG_BY_TYPE } from "../circuit/catalog";
import { modelFor } from "../circuit/to3d";
import type { DesignSpec, ResolvedPart, Robot } from "../spec";

/**
 * Builds the robot's body from its numbers so it is always assembled like a real two-wheel-drive
 * robot: both wheels on one axle at ±trackWidth/2, a chassis between them, a caster at the back,
 * the motors beside the wheels, line sensors at their mounting points, and the electronics on top.
 * Coordinates are robot-local (origin = middle of the drive axle on the floor, nose toward −z).
 */
export function robotBody(robot: Robot, circuit: DesignSpec["circuit"]): ResolvedPart[] {
  const r = robot.wheelRadius;
  const half = robot.trackWidth / 2;
  const ww = robot.wheelWidth;
  const L = robot.length;
  const zMid = -L * 0.1; // chassis spans −0.6L … +0.4L around the axle
  const out: ResolvedPart[] = [];
  const add = (p: Omit<ResolvedPart, "name"> & { name: string }) => out.push({ group: "Robot", opacity: 0.3, moves: true, ...p } as ResolvedPart);

  add({ id: "rb_chassis", name: "Chassis plate", shape: "box", size: [robot.trackWidth - ww - 4, 5, L], pos: [0, r + 2, zMid], color: "#8fd3ff", explode: [0, 25, 0], info: { where: "Between the wheels", fit: "A flat plate; the axle line is through its middle third.", material: "3 mm acrylic or plywood" } });
  add({ id: "rb_battery", name: "Battery pack", shape: "box", size: [30, 16, Math.min(60, L * 0.4)], pos: [0, r - 8, L * 0.15], color: "#f87171", explode: [0, -40, 0], info: { where: "Under the chassis, over the rear", fit: "Heavy parts low keep it from tipping." } });
  add({ id: "rb_caster", name: "Caster ball", shape: "sphere", size: [Math.max(4, r * 0.28)], pos: [0, Math.max(4, r * 0.28), L * 0.4 - 10], color: "#cbd5e1", opacity: 0.6, explode: [0, -30, 0], info: { where: "Rear centre", fit: "A ball caster so the robot rests on three points." } });

  const motorBinds: Array<[string, number]> = [[robot.left, -1], [robot.right, 1]];
  for (const [motor, side] of motorBinds) {
    const x = side * half;
    const label = side < 0 ? "Left" : "Right";
    add({ id: `rb_tyre_${side < 0 ? "l" : "r"}`, name: `${label} tyre`, shape: "torus", size: [r - 4, 4], pos: [x, r, 0], rot: [0, 0, 90], color: "#475569", opacity: 0.55, bind: motor, spinAxis: "x", explode: [side * 45, 0, 0], info: { where: `${label} side of the axle`, fit: "Press onto the motor shaft." } });
    add({ id: `rb_hub_${side < 0 ? "l" : "r"}`, name: `${label} wheel hub`, shape: "cylinder", size: [Math.max(3, r - 8), ww], pos: [x, r, 0], rot: [0, 0, 90], color: "#94a3b8", opacity: 0.35, bind: motor, spinAxis: "x", explode: [side * 45, 0, 0] });
    add({ id: `rb_spoke_${side < 0 ? "l" : "r"}`, name: `${label} wheel spoke`, shape: "box", size: [ww * 0.5, 3, (r - 6) * 2], pos: [x, r, 0], color: "#e2e8f0", opacity: 0.7, bind: motor, spinAxis: "x", explode: [side * 45, 0, 0] });
    add({ id: `rb_motor_${side < 0 ? "l" : "r"}`, name: `${label} motor`, shape: "cylinder", size: [8, 28], pos: [side * (half - ww / 2 - 14 - 1), r, 0], rot: [0, 0, 90], color: "#fcd34d", opacity: 0.4, explode: [side * 20, 0, 0], info: { where: `Beside the ${label.toLowerCase()} wheel`, fit: "Glued or clamped to the chassis; its shaft carries the wheel.", cost: "~₦1,500" } });
  }

  for (const s of robot.sensors) {
    add({ id: `rb_sens_${s.id}`, name: `Line sensor ${s.id}`, shape: "box", size: [12, 4, 8], pos: [s.x, 7, s.z], color: "#0f172a", opacity: 0.6, bind: s.id, explode: [0, -20, 0], info: { where: `${Math.abs(s.z)} mm ahead of the axle, ${Math.abs(s.x)} mm ${s.x < 0 ? "left" : "right"} of centre`, fit: "Faces the floor about 5–8 mm up." } });
  }

  // electronics and controls on the chassis top, in rows from the middle backward
  const skip = new Set([robot.left, robot.right, ...robot.sensors.map((s) => s.id)]);
  const rest = (circuit?.parts || []).filter((p) => !skip.has(p.id) && CATALOG_BY_TYPE[p.type]);
  const topY = r + 4.5;
  const innerW = robot.trackWidth - ww - 8;
  let rowZ = zMid - L * 0.05;
  let cursor = -innerW / 2 + 4;
  let rowH = 0;
  for (const p of rest) {
    const def = CATALOG_BY_TYPE[p.type];
    const w = p.type === "board" ? 52 : p.type === "motor_driver" ? 20 : 20;
    const d = p.type === "board" ? 30 : p.type === "motor_driver" ? 16 : 14;
    if (cursor + w > innerW / 2 && cursor > -innerW / 2 + 4) {
      cursor = -innerW / 2 + 4;
      rowZ += rowH + 6;
      rowH = 0;
    }
    const cx = cursor + w / 2;
    cursor += w + 6;
    rowH = Math.max(rowH, d);
    modelFor(p.type, p.props, def.w, def.h).forEach((m, k) => {
      const { dx, dy, dz, name, ...rest2 } = m;
      out.push({
        ...rest2,
        id: `rb_${p.id}_${k}`,
        name: name || `${p.label || p.id}${k ? ` (${k + 1})` : ""}`,
        pos: [cx + dx, topY + dy - 3, rowZ + dz],
        group: "Robot",
        moves: true,
        bind: p.id,
        explode: [0, 50, 0],
        info: { where: `${def.name} “${p.label || p.id}” on top of the chassis`, fit: def.description },
      } as ResolvedPart);
    });
  }
  return out;
}
