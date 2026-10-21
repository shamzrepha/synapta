"use client";

import { GestureToggle, useGestureLock } from "./gesture-lock";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ResolvedPart } from "@/lib/studio/spec";
import type { Mechanism } from "@/lib/studio/spec";
import { gearLayout } from "@/lib/studio/mech/gears";

/**
 * Blueprint-style 3D viewer (same look as the ClassAir drawing): translucent faces + crisp edges,
 * orbit/zoom/pan, an explode slider, click-to-select, and live gear trains whose teeth, speeds and
 * directions come straight from the mechanism data.
 */
export interface Viewer3DProps {
  parts: ResolvedPart[];
  mechanism?: Mechanism;
  /** 0..1 */
  explode: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** live simulation state: input shaft angle (rad) and load height (m) */
  mechState?: { inputAngle: number; loadHeight: number };
  /** circuit part id → type, so linked (`bind`) 3D parts know how to behave */
  links?: Record<string, string>;
  /** live simulation: outputs of every circuit part and which buttons/switches are pressed */
  live?: { outputs: Record<string, { on: boolean; level: number; direction?: 1 | -1; angle?: number }>; pressed: Set<string> };
  /** a linked button/switch part was pressed (down=true) or released in the 3D view */
  onPress?: (id: string, down: boolean) => void;
  /** a track on the floor and the robot's live pose: parts marked `moves` ride on the robot */
  /** machine joints: parts with `joint` ride on them; `values` is read every frame (degrees or mm) */
  joints?: { defs: Array<{ id: string; kind: "revolute" | "prismatic"; axis: "x" | "y" | "z"; pivot?: [number, number, number] }>; values: Record<string, number> };
  /** keep the camera on the robot (close-up chase view) */
  follow?: boolean;
  world?: { track: { pts: Array<[number, number]>; closed: boolean; width: number; obstacles: Array<{ shape: "box"; x: number; z: number; w: number; d: number; h: number } | { shape: "cylinder"; x: number; z: number; r: number; h: number }>; arena?: { width: number; depth: number } }; pose: { x: number; z: number; h: number } };
  /** jumper wires between the generated circuit parts, as polylines in mm */
  wires?: Array<{ id: string; color: string; pts: Array<[number, number, number]> }>;
  className?: string;
}

const SELECT = "#ffc24d";

type Role = "light" | "spin" | "press" | "servo" | "pulse";
const ROLE: Record<string, Role> = { led: "light", dc_motor: "spin", button: "press", switch: "press", servo: "servo", buzzer: "pulse", stepper: "servo" };
interface Linked {
  obj: THREE.Group;
  bind: string;
  role: Role;
  mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
  edge: THREE.LineBasicMaterial;
  baseColor: THREE.Color;
  baseOpacity: number;
  basePos: THREE.Vector3;
  baseRotY: number;
  ratio: number;
  axis: THREE.Vector3;
  shift: THREE.Vector3;
}

function gearShape(teeth: number, module: number): THREE.Shape {
  const r = (module * teeth) / 2;
  const ro = r + module;
  const rr = Math.max(r - 1.25 * module, module);
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts: Array<[number, number]> = [
      [rr, a],
      [rr, a + step * 0.12],
      [ro, a + step * 0.3],
      [ro, a + step * 0.52],
      [rr, a + step * 0.7],
    ];
    pts.forEach(([rad, ang], k) => {
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      if (i === 0 && k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(2, module * 1.5), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** Geometry for a design part. Every shape's axis runs along Y (up) so rotation behaves the same for all. */
export function partGeometry(p: { shape: string; size: number[]; teeth?: number }): THREE.BufferGeometry {
  const [a, b, c] = p.size;
  switch (p.shape) {
    case "cylinder":
      return new THREE.CylinderGeometry(a, a, b ?? a, 40);
    case "cone":
      return new THREE.ConeGeometry(a, b ?? a, 40);
    case "sphere":
      return new THREE.SphereGeometry(a, 24, 16);
    case "torus":
      // lies flat (axis up), like a washer or tyre
      return new THREE.TorusGeometry(a, Math.min(b ?? a / 4, a * 0.95), 14, 40).rotateX(Math.PI / 2);
    case "capsule":
      return new THREE.CapsuleGeometry(a, Math.max(0.1, b ?? a * 2), 6, 20);
    case "prism":
      return new THREE.CylinderGeometry(a, a, b ?? a, Math.max(3, Math.min(12, Math.round(c ?? 6))));
    case "tube": {
      const outer = a;
      const inner = Math.min(c ?? a * 0.7, outer * 0.95);
      const h = b ?? a * 2;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, Math.max(0.5, inner), 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 32 });
      geo.translate(0, 0, -h / 2);
      return geo.rotateX(Math.PI / 2);
    }
    case "gear": {
      const teeth = Math.max(6, p.teeth ?? 20);
      const thickness = b ?? a * 0.3;
      const geo = new THREE.ExtrudeGeometry(gearShape(teeth, (2 * a) / teeth), { depth: thickness, bevelEnabled: false, curveSegments: 6 });
      geo.translate(0, 0, -thickness / 2);
      return geo.rotateX(Math.PI / 2);
    }
    default:
      return new THREE.BoxGeometry(a, b ?? a, c ?? a);
  }
}

/** A light floor and the dark line drawn flat on it. */
function addTrack(into: THREE.Group, track: NonNullable<Viewer3DProps["world"]>["track"]) {
  const xs: number[] = track.pts.map((p) => p[0]);
  const zs: number[] = track.pts.map((p) => p[1]);
  if (track.arena) xs.push(-track.arena.width / 2, track.arena.width / 2), zs.push(-track.arena.depth / 2, track.arena.depth / 2);
  for (const o of track.obstacles) {
    const ex = o.shape === "box" ? o.w / 2 : o.r;
    const ez = o.shape === "box" ? o.d / 2 : o.r;
    xs.push(o.x - ex, o.x + ex);
    zs.push(o.z - ez, o.z + ez);
  }
  if (!xs.length) xs.push(-300, 300), zs.push(-300, 300);
  const pad = track.arena ? 20 : 140;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minZ = Math.min(...zs) - pad;
  const maxZ = Math.max(...zs) + pad;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ).rotateX(-Math.PI / 2), currentLook === "solid" ? new THREE.MeshStandardMaterial({ color: "#d9e2ef", roughness: 0.85 }) : new THREE.MeshBasicMaterial({ color: "#e5edf7", transparent: true, opacity: 0.26, depthWrite: false }));
  floor.receiveShadow = true;
  floor.position.set((minX + maxX) / 2, 0.1, (minZ + maxZ) / 2);
  floor.renderOrder = 0;
  into.add(floor);

  if (track.arena) {
    const { width: W, depth: D } = track.arena;
    const wall = (w: number, d: number, x: number, z: number) => {
      const g = solid(new THREE.BoxGeometry(w, 60, d), "#93c5fd", 0.18, false);
      g.position.set(x, 30, z);
      into.add(g);
    };
    wall(W, 8, 0, -D / 2);
    wall(W, 8, 0, D / 2);
    wall(8, D, -W / 2, 0);
    wall(8, D, W / 2, 0);
  }
  for (const o of track.obstacles) {
    const geo = o.shape === "box" ? new THREE.BoxGeometry(o.w, o.h, o.d) : new THREE.CylinderGeometry(o.r, o.r, o.h, 28);
    const g = solid(geo, "#fbbf24", 0.28, false);
    g.position.set(o.x, o.h / 2, o.z);
    into.add(g);
  }
  if (track.pts.length < 2) return;

  const mat = new THREE.MeshBasicMaterial({ color: "#05080f", transparent: true, opacity: 0.95, depthWrite: false });
  const half = track.width / 2;
  const n = track.pts.length;
  const segs = track.closed ? n : n - 1;
  const pos: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = track.pts[i];
    const b = track.pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const y = 0.4;
    pos.push(a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] + nx, y, b[1] + nz, b[0] + nx, y, b[1] + nz, a[0] - nx, y, a[1] - nz, b[0] - nx, y, b[1] - nz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const ribbon = new THREE.Mesh(g, mat);
  ribbon.renderOrder = 1;
  ribbon.frustumCulled = false;
  ribbon.material.side = THREE.DoubleSide;
  into.add(ribbon);
  const disc = new THREE.CircleGeometry(half, 14).rotateX(-Math.PI / 2);
  for (const p of track.pts) {
    const d = new THREE.Mesh(disc, mat);
    d.position.set(p[0], 0.4, p[1]);
    d.renderOrder = 1;
    into.add(d);
  }
}

/**
 * "solid" (default) draws lit, opaque parts with soft shadows so a circuit or machine looks like the real thing;
 * "blueprint" keeps the translucent faces with crisp edges. Set before each rebuild of the scene.
 */
export type ViewLook = "solid" | "blueprint";
let currentLook: ViewLook = "solid";

function solid(geo: THREE.BufferGeometry, color: string, opacity: number, selected: boolean): THREE.Group {
  const g = new THREE.Group();
  if (currentLook === "solid") {
    const mat = new THREE.MeshStandardMaterial({ color: selected ? SELECT : color, roughness: 0.5, metalness: 0.12, emissive: selected ? SELECT : "#000000", emissiveIntensity: selected ? 0.35 : 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // faint outline keeps small parts readable against each other
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), new THREE.LineBasicMaterial({ color: selected ? "#ffffff" : "#0f172a", transparent: true, opacity: selected ? 1 : 0.28 }));
    g.add(mesh, edges);
    return g;
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: selected ? SELECT : color, transparent: true, opacity: selected ? Math.max(0.35, opacity * 1.6) : opacity, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: selected ? "#ffffff" : color, transparent: true }));
  g.add(mesh, edges);
  return g;
}

export function Viewer3D({ parts, mechanism, explode, selectedId, onSelect, mechState, links, live, onPress, world, follow, joints, wires, className }: Viewer3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const lightsRef = useRef<{ lights: THREE.Group; grid: THREE.Object3D } | null>(null);
  const [look, setLook] = useState<ViewLook>("solid");
  const gesture = useGestureLock();
  const interactiveRef = useRef(gesture.interactive);
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    content: THREE.Group;
    gears: Array<{ obj: THREE.Object3D; factor: number; phase: number }>;
    load: THREE.Object3D | null;
    rope: THREE.Line | null;
    ropeTop: THREE.Vector3;
    loadBaseY: number;
    pickables: THREE.Object3D[];
    linked: Linked[];
    robot: THREE.Group;
    jointGroups: Array<{ id: string; obj: THREE.Group; kind: "revolute" | "prismatic"; axis: "x" | "y" | "z"; pivot: THREE.Vector3 }>;
    fitted: string;
  } | null>(null);
  const mech = useRef(mechState);
  const liveRef = useRef(live);
  const worldRef = useRef(world);
  const followRef = useRef(follow);
  const jointValues = useRef(joints?.values);
  const onPressRef = useRef(onPress);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    mech.current = mechState;
    liveRef.current = live;
    worldRef.current = world;
    followRef.current = follow;
    jointValues.current = joints?.values;
    onPressRef.current = onPress;
    onSelectRef.current = onSelect;
  });

  // Scene setup once
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Phones: a lower pixel ratio and a smaller shadow map keep the frame rate steady. A heavy WebGL layer that misses
    // frames makes Android browsers repaint stale tiles around it, which shows up as flicker.
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = coarse ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 20000);
    camera.position.set(500, 400, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    const grid = new THREE.GridHelper(2000, 40, "#2b5a9c", "#1b4280");
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);
    // studio lighting for the solid look: sky/ground fill, a key light that casts soft shadows, and a rim fill
    const lights = new THREE.Group();
    lights.add(new THREE.HemisphereLight("#dbeafe", "#334155", 1.35));
    const key = new THREE.DirectionalLight("#ffffff", 2.4);
    key.position.set(600, 1100, 500);
    key.castShadow = true;
    key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -1400, right: 1400, top: 1400, bottom: -1400, near: 10, far: 4000 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 1.5;
    const fill = new THREE.DirectionalLight("#bfdbfe", 0.8);
    fill.position.set(-700, 400, -600);
    lights.add(key, fill);
    const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
    shadowFloor.position.y = 0.05;
    shadowFloor.receiveShadow = true;
    lights.add(shadowFloor);
    scene.add(lights);
    lightsRef.current = { lights, grid };
    const content = new THREE.Group();
    scene.add(content);
    ctx.current = { renderer, scene, camera, controls, content, gears: [], load: null, rope: null, ropeTop: new THREE.Vector3(), loadBaseY: 0, pickables: [], linked: [], robot: new THREE.Group(), jointGroups: [], fitted: "" };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Click to select (ignore drags)
    let down: { x: number; y: number } | null = null;
    let holding: string | null = null;
    const release = () => {
      if (holding) onPressRef.current?.(holding, false);
      holding = null;
      controls.enabled = interactiveRef.current;
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      const c = ctx.current;
      if (!c || !onPressRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(c.pickables, false)[0];
      let o: THREE.Object3D | null = hit?.object || null;
      while (o && !c.linked.some((l) => l.obj === o)) o = o.parent;
      const l = c.linked.find((x) => x.obj === o);
      if (l && l.role === "press") {
        holding = l.bind;
        controls.enabled = false; // pressing a switch shouldn't also orbit the camera
        onPressRef.current(l.bind, true);
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasHolding = !!holding;
      release();
      if (wasHolding) return;
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || !ctx.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(ctx.current.pickables, false)[0];
      let o: THREE.Object3D | null = hit?.object || null;
      while (o && !o.userData.partId) o = o.parent;
      onSelectRef.current(o ? (o.userData.partId as string) : null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", release);
    renderer.domElement.addEventListener("pointercancel", release);

    // Don't render while the viewer is scrolled out of view or the tab is hidden: it frees the GPU for the page itself
    let visible = true;
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; }, { threshold: 0 }) : null;
    io?.observe(el);
    let raf = 0;
    let lastT = performance.now();
    let following = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = ctx.current;
      if (!c) return;
      if (!visible || document.hidden) {
        lastT = performance.now();
        return;
      }
      const nowT = performance.now();
      const dt = Math.min(0.1, (nowT - lastT) / 1000);
      lastT = nowT;
      const wd = worldRef.current;
      if (wd) {
        c.robot.position.set(wd.pose.x, 0, wd.pose.z);
        c.robot.rotation.y = wd.pose.h;
        if (followRef.current) {
          const target = new THREE.Vector3(wd.pose.x, 20, wd.pose.z);
          if (!following) {
            // first frame of a chase view: come in close behind-and-above
            camera.position.set(target.x + 220, 170, target.z + 260);
            following = true;
          }
          const delta = target.clone().sub(controls.target);
          controls.target.add(delta);
          camera.position.add(delta);
        } else following = false;
      }
      const jv = jointValues.current;
      if (jv) {
        for (const jg of c.jointGroups) {
          const val = jv[jg.id] ?? 0;
          if (jg.kind === "revolute") jg.obj.rotation[jg.axis] = (val * Math.PI) / 180;
          else {
            jg.obj.position.copy(jg.pivot);
            jg.obj.position[jg.axis] += val;
          }
        }
      }
      const lv = liveRef.current;
      if (lv) {
        const t = nowT / 1000;
        for (const l of c.linked) {
          const out = lv.outputs[l.bind];
          if (l.role === "spin") {
            if (out?.on) l.obj.rotateOnWorldAxis(l.axis, (out.direction || 1) * l.ratio * (0.5 + out.level * 9) * dt);
          } else if (l.role === "light") {
            const on = !!out?.on;
            if (l.mat instanceof THREE.MeshStandardMaterial) {
              // a lit LED really glows: emissive colour scales with brightness (PWM level)
              l.mat.emissive.set(on ? l.baseColor : "#000000");
              l.mat.emissiveIntensity = on ? 0.6 + 1.8 * Math.min(1, out!.level || 1) : 0;
            } else {
              l.mat.opacity = on ? 0.55 + 0.4 * Math.min(1, out!.level || 1) : l.baseOpacity;
              l.mat.color.set(on ? "#ffffff" : l.baseColor).lerp(l.baseColor, on ? 0.45 : 0);
              l.edge.color.set(on ? "#ffffff" : l.baseColor);
            }
            l.obj.scale.setScalar(on ? 1.12 : 1);
          } else if (l.role === "press") {
            const down = lv.pressed.has(l.bind);
            l.obj.position.copy(l.basePos);
            if (down) l.obj.position.add(l.shift);
            l.mat.opacity = down ? Math.min(1, l.baseOpacity + 0.3) : l.baseOpacity;
          } else if (l.role === "servo") {
            l.obj.rotation.y = l.baseRotY - (((out?.angle ?? 90) - 90) * Math.PI) / 180;
          } else if (l.role === "pulse") {
            l.obj.position.set(l.basePos.x + (out?.on ? Math.sin(t * 90) * 0.5 : 0), l.basePos.y, l.basePos.z);
            l.mat.color.set(out?.on ? "#fbbf24" : l.baseColor);
          }
        }
      }
      const st = mech.current;
      if (st) {
        for (const g of c.gears) g.obj.rotation.z = st.inputAngle * g.factor + g.phase;
        if (c.load) {
          const y = c.loadBaseY + st.loadHeight * 1000 * 0.25;
          c.load.position.y = y;
          if (c.rope) {
            const p = c.rope.geometry.attributes.position as THREE.BufferAttribute;
            p.setXYZ(1, c.ropeTop.x, y + 20, c.ropeTop.z);
            p.needsUpdate = true;
          }
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", release);
      renderer.domElement.removeEventListener("pointercancel", release);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  // On phones the page scrolls over the model until "Move & zoom" is on, so it never traps a swipe
  useEffect(() => {
    interactiveRef.current = gesture.interactive;
    const c = ctx.current;
    if (!c) return;
    c.renderer.domElement.style.touchAction = gesture.interactive ? "none" : "pan-y";
    c.controls.enabled = gesture.interactive;
  }, [gesture.interactive]);

  // Rebuild content when the design changes
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    currentLook = look;
    if (lightsRef.current) lightsRef.current.lights.visible = look === "solid";
    c.content.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    c.content.clear();
    c.gears = [];
    c.load = null;
    c.rope = null;
    c.pickables = [];
    c.linked = [];
    c.robot = new THREE.Group();
    c.content.add(c.robot);
    c.jointGroups = [];
    if (world) addTrack(c.content, world.track);

    for (const p of parts) {
      const geo = partGeometry(p);
      const g = solid(geo, p.color || "#8fd3ff", p.opacity ?? 0.15, p.id === selectedId);
      const ex = p.explode || [0, 0, 0];
      g.position.set(p.pos[0] + ex[0] * explode, p.pos[1] + ex[1] * explode, p.pos[2] + ex[2] * explode);
      if (p.rot) g.rotation.set((p.rot[0] * Math.PI) / 180, (p.rot[1] * Math.PI) / 180, (p.rot[2] * Math.PI) / 180);
      g.userData.partId = p.id;
      const jd = p.joint ? joints?.defs.find((d) => d.id === p.joint) : undefined;
      if (jd) {
        let jg = c.jointGroups.find((x) => x.id === jd.id);
        if (!jg) {
          const pivot = new THREE.Vector3(...(jd.pivot || (jd.kind === "revolute" ? [g.position.x, g.position.y, g.position.z] : [0, 0, 0])));
          const grp = new THREE.Group();
          grp.position.copy(pivot);
          (p.moves ? c.robot : c.content).add(grp);
          jg = { id: jd.id, obj: grp, kind: jd.kind, axis: jd.axis, pivot };
          c.jointGroups.push(jg);
        }
        g.position.sub(jg.pivot);
        jg.obj.add(g);
      } else (p.moves ? c.robot : c.content).add(g);
      c.pickables.push(g.children[0]);
      const bind = p.bind || p.spinWith;
      const role = bind && links ? ROLE[links[bind]] : undefined;
      if (bind && role) {
        const mesh = g.children[0] as THREE.Mesh;
        const edgeLines = g.children[1] as THREE.LineSegments;
        c.linked.push({
          obj: g,
          bind,
          role,
          mat: mesh.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial,
          edge: edgeLines.material as THREE.LineBasicMaterial,
          baseColor: new THREE.Color(p.color || "#8fd3ff"),
          baseOpacity: p.opacity ?? 0.15,
          basePos: g.position.clone(),
          baseRotY: g.rotation.y,
          ratio: p.spinRatio ?? 1,
          axis: new THREE.Vector3(p.spinAxis === "y" ? 0 : p.spinAxis === "z" ? 0 : 1, p.spinAxis === "y" ? 1 : 0, p.spinAxis === "z" ? 1 : 0),
          shift: new THREE.Vector3(...(p.pressShift || [0, 0, 0])),
        });
      }
    }

    // Jumper wires: a smooth tube (lit and rounded in the solid look, a plain line in the blueprint look)
    for (const w of wires || []) {
      if (w.pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(w.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, "catmullrom", 0.3);
      if (look === "solid") {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.8, 8, false), new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.4, metalness: 0.05 }));
        tube.castShadow = true;
        c.content.add(tube);
      } else {
        c.content.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), new THREE.LineBasicMaterial({ color: w.color })));
      }
    }

    if (mechanism) {
      const gears = gearLayout(mechanism);
      const m = mechanism.module;
      const rig = new THREE.Group();
      const baseY = 260;
      const width = 8;
      const shafts = new Map<number, { x: number; zs: number[] }>();
      gears.forEach((gi) => {
        const geo = new THREE.ExtrudeGeometry(gearShape(gi.teeth, m), { depth: width, bevelEnabled: false, curveSegments: 6 });
        geo.translate(0, 0, -width / 2);
        const color = gi.role === "driver" ? "#ff9a7a" : "#9be7c4";
        const id = `gear-${gi.stage}-${gi.role}`;
        const g = solid(geo, color, 0.25, selectedId === id);
        g.position.set(gi.x, baseY, gi.z);
        g.userData.partId = id;
        rig.add(g);
        c.pickables.push(g.children[0]);
        // Meshing gears turn opposite ways; offset the driven gear half a tooth so teeth interlock
        const phase = gi.role === "driven" ? Math.PI / gi.teeth : 0;
        c.gears.push({ obj: g, factor: gi.speedFactor * gi.direction, phase });
        const s = shafts.get(gi.shaft) || { x: gi.x, zs: [] };
        s.zs.push(gi.z);
        shafts.set(gi.shaft, s);
      });
      shafts.forEach((s) => {
        const z0 = Math.min(...s.zs) - 20;
        const z1 = Math.max(...s.zs) + 20;
        const geo = new THREE.CylinderGeometry(Math.max(2, m * 1.4), Math.max(2, m * 1.4), z1 - z0, 16);
        geo.rotateX(Math.PI / 2);
        const shaft = solid(geo, "#b9d9f2", 0.3, false);
        shaft.position.set(s.x, baseY, (z0 + z1) / 2);
        rig.add(shaft);
      });
      // Input: motor can or crank handle on the first shaft
      const first = gears[0];
      if (first) {
        const zIn = first.z - 28;
        if (mechanism.input.kind === "motor") {
          const geo = new THREE.CylinderGeometry(18, 18, 36, 24);
          geo.rotateX(Math.PI / 2);
          const motor = solid(geo, "#b8a6ff", 0.25, selectedId === "input");
          motor.position.set(first.x, baseY, zIn - 10);
          motor.userData.partId = "input";
          rig.add(motor);
          c.pickables.push(motor.children[0]);
        } else {
          const len = mechanism.input.crankRadius * 1000 * 0.5;
          const arm = new THREE.Group();
          const bar = solid(new THREE.BoxGeometry(len, 8, 6), "#b8a6ff", 0.35, selectedId === "input");
          bar.position.set(len / 2, 0, 0);
          const handle = solid(new THREE.CylinderGeometry(4, 4, 30, 12).rotateX(Math.PI / 2), "#b8a6ff", 0.35, false);
          handle.position.set(len, 0, -15);
          arm.add(bar, handle);
          arm.position.set(first.x, baseY, zIn);
          arm.userData.partId = "input";
          rig.add(arm);
          c.pickables.push(bar.children[0]);
          c.gears.push({ obj: arm, factor: 1, phase: 0 });
        }
      }
      // Drum on the last shaft, rope down to the load
      const last = gears[gears.length - 1];
      if (last) {
        const dr = Math.max(4, mechanism.drumRadius * 1000);
        const drumGeo = new THREE.CylinderGeometry(dr, dr, 24, 32);
        drumGeo.rotateX(Math.PI / 2);
        const drum = solid(drumGeo, "#ffc24d", 0.3, selectedId === "drum");
        drum.position.set(last.x, baseY, last.z + 26);
        drum.userData.partId = "drum";
        rig.add(drum);
        c.pickables.push(drum.children[0]);
        c.gears.push({ obj: drum, factor: last.speedFactor * last.direction, phase: 0 });
        const side = Math.max(30, Math.cbrt(mechanism.load.mass) * 40);
        const load = solid(new THREE.BoxGeometry(side, side, side), "#eaf4ff", 0.2, selectedId === "load");
        const ropeX = last.x + dr;
        c.loadBaseY = side / 2;
        load.position.set(ropeX, c.loadBaseY, last.z + 26);
        load.userData.partId = "load";
        rig.add(load);
        c.pickables.push(load.children[0]);
        c.load = load;
        c.ropeTop.set(ropeX, baseY, last.z + 26);
        const ropeGeo = new THREE.BufferGeometry().setFromPoints([c.ropeTop.clone(), new THREE.Vector3(ropeX, c.loadBaseY + side / 2, last.z + 26)]);
        c.rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: "#ffc24d" }));
        c.rope.frustumCulled = false;
        rig.add(c.rope);
        // target height marker
        const top = c.loadBaseY + mechanism.liftHeight * 1000 * 0.25;
        const marker = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ropeX - 60, top, last.z + 26), new THREE.Vector3(ropeX + 60, top, last.z + 26)]), new THREE.LineDashedMaterial({ color: "#9be7c4", dashSize: 8, gapSize: 6 }));
        marker.computeLineDistances();
        rig.add(marker);
      }
      c.content.add(rig);
    }

    // Frame the model the first time (or when its size changes a lot)
    const box = new THREE.Box3().setFromObject(c.content);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const key = `${Math.round(size.x / 50)}-${Math.round(size.y / 50)}-${Math.round(size.z / 50)}`;
      if (key !== c.fitted) {
        c.fitted = key;
        const center = box.getCenter(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z, 100);
        c.controls.target.copy(center);
        c.camera.position.set(center.x + r * 0.85, center.y + r * 0.6, center.z + r * 1.05);
        c.camera.near = r / 100;
        c.camera.far = r * 50;
        c.camera.updateProjectionMatrix();
      }
    }
  }, [parts, mechanism, explode, selectedId, links, world?.track, joints?.defs, wires, look]);

  const zoomBy = (f: number) => {
    const c = ctx.current;
    if (!c) return;
    const off = c.camera.position.clone().sub(c.controls.target);
    const len = Math.min(c.camera.far * 0.5, Math.max(c.camera.near * 5, off.length() * f));
    c.camera.position.copy(c.controls.target).add(off.setLength(len));
  };
  const btn = "flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/85 text-white border border-white/30 text-lg font-bold shadow-lg";
  return (
    // contain: paint keeps the canvas's repaints from invalidating the page around it
    <div className={className} style={{ position: "relative", overflow: "hidden", contain: "paint", isolation: "isolate" }}>
      <div
        ref={host}
        style={{ background: look === "solid" ? "linear-gradient(180deg,#27456f 0%,#10213d 100%)" : "#0b2a5b", position: "absolute", inset: 0, overflow: "hidden" }}
        aria-label="3D model — drag to orbit, scroll or pinch to zoom"
      />
      <button
        type="button"
        onClick={() => setLook((v) => (v === "solid" ? "blueprint" : "solid"))}
        aria-pressed={look === "blueprint"}
        className="absolute left-2 top-2 z-10 rounded-full border border-white/30 bg-slate-900/80 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg"
      >
        {look === "solid" ? "Show blueprint" : "Show solid"}
      </button>
      <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1.5">
        <button type="button" className={btn} onClick={() => zoomBy(0.75)} aria-label="Zoom in">+</button>
        <button type="button" className={btn} onClick={() => zoomBy(1.35)} aria-label="Zoom out">−</button>
      </div>
      {gesture.canToggle && <GestureToggle active={gesture.active} onChange={gesture.setActive} className="absolute top-2 right-2 z-10" />}
      {gesture.canToggle && !gesture.active && <p className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[55%] rounded-lg bg-slate-900/70 px-2 py-1 text-[10px] text-white">Swipe scrolls the page · tap Move &amp; zoom to turn the model</p>}
    </div>
  );
}
