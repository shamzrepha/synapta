"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Pause, Play, RotateCcw } from "lucide-react";
import { evaluate } from "@/lib/studio/expr";
import { clamp, round } from "@/lib/teach/math";
import type { Block } from "@/lib/teach/script";

type Artifact3DData = Extract<Block, { type: "artifact3d" }>;
type PartSpec = Artifact3DData["parts"][number];
type SliderSpec = Artifact3DData["sliders"][number];

function safeEval(v: unknown, vars: Record<string, number>, fallback: number, radians = true): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      const n = evaluate(v, vars, { radians });
      if (Number.isFinite(n)) return n;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function safeColor(raw: string | undefined, fallback = "#4f6df5"): THREE.Color {
  const c = new THREE.Color();
  try {
    c.set(raw && raw.trim() ? raw.trim() : fallback);
  } catch {
    c.set(fallback);
  }
  return c;
}

function normSize(raw: PartSpec["size"], vars: Record<string, number>): [number, number, number] {
  const a = clamp(safeEval(raw[0], vars, 1), 0.05, 20);
  const b = clamp(safeEval(raw[1] ?? raw[0], vars, a), 0.05, 20);
  const c = clamp(safeEval(raw[2] ?? raw[0], vars, a), 0.05, 20);
  return [a, b, c];
}

function makePartObject(p: PartSpec): THREE.Object3D {
  const mat = new THREE.MeshStandardMaterial({
    color: safeColor(p.color),
    emissive: p.emissive ? safeColor(p.emissive, "#000000") : new THREE.Color(0x000000),
    emissiveIntensity: p.emissive ? 0.65 : 0,
    metalness: p.metalness,
    roughness: p.roughness,
    transparent: p.opacity < 0.99,
    opacity: p.opacity,
  });

  if (p.shape === "arrow") {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.72, 16), mat);
    shaft.position.y = 0.36;
    shaft.castShadow = true;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 16), mat);
    head.position.y = 0.86;
    head.castShadow = true;
    g.add(shaft, head);
    return g;
  }

  let geo: THREE.BufferGeometry;
  switch (p.shape) {
    case "sphere":
      geo = new THREE.SphereGeometry(0.5, 28, 20);
      break;
    case "cylinder":
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      break;
    case "cone":
      geo = new THREE.ConeGeometry(0.5, 1, 24);
      break;
    case "torus":
      geo = new THREE.TorusGeometry(0.5, 0.14, 16, 40);
      break;
    case "ring":
      geo = new THREE.TorusGeometry(0.5, 0.05, 12, 48);
      break;
    case "box":
    default:
      geo = new THREE.BoxGeometry(1, 1, 1);
      break;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = p.opacity >= 0.6;
  mesh.receiveShadow = true;
  return mesh;
}

interface PresetRuntime {
  update: (t: number, norm: number[], raw: number[]) => void;
}

function buildPresetScene(preset: Artifact3DData["preset"], root: THREE.Group, sliders: SliderSpec[]): PresetRuntime {
  const matMetal = (hex: number, rough = 0.3, metal = 0.75) =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
  const matGloss = (hex: number, emissive = 0x000000, ei = 0) =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: 0.35, metalness: 0.2, emissive, emissiveIntensity: ei });

  if (preset === "pendulum") {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.22), matMetal(0x64748b));
    beam.position.set(0, 2.3, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0, 2.25, 0);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 14), matMetal(0xcbd5e1));
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 20), matGloss(0xf59e0b, 0xf59e0b, 0.2));
    bob.castShadow = true;
    pivot.add(rod, bob);
    root.add(beam, pivot);
    return {
      update(t, norm) {
        const len = 1.1 + (norm[0] ?? 0.5) * 1.9;
        const amp = 0.18 + (norm[1] ?? 0.45) * 0.65;
        const gScale = 0.6 + (norm[2] ?? 0.5) * 1.1;
        const omega = Math.sqrt((9.81 * gScale) / len);
        rod.scale.set(1, len, 1);
        rod.position.y = -len / 2;
        bob.position.y = -len;
        pivot.rotation.z = amp * Math.cos(omega * t);
      },
    };
  }

  if (preset === "spring") {
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.4), matMetal(0x64748b));
    topBar.position.set(0, 2.5, 0);
    const coils: THREE.Mesh[] = [];
    const coilGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.055, 12, 28), matMetal(0x94a3b8, 0.25, 0.85));
      c.rotation.x = Math.PI / 2;
      coilGroup.add(c);
      coils.push(c);
    }
    const mass = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.85), matGloss(0x4f6df5, 0x3b82f6, 0.18));
    mass.castShadow = true;
    root.add(topBar, coilGroup, mass);
    return {
      update(t, norm) {
        const k = 0.6 + (norm[0] ?? 0.5) * 2.2;
        const m = 0.5 + (norm[1] ?? 0.5) * 1.8;
        const amp = 0.15 + (norm[2] ?? 0.5) * 0.55;
        const omega = Math.sqrt(k / m) * 2.4;
        const yBottom = 0.2 - amp * Math.cos(omega * t);
        const span = Math.max(0.6, 2.4 - yBottom);
        coils.forEach((c, i) => {
          c.position.y = 2.4 - ((i + 0.5) / coils.length) * span;
        });
        mass.position.y = yBottom - 0.35;
        const s = 0.75 + m * 0.25;
        mass.scale.set(s, s, s);
      },
    };
  }

  if (preset === "atom") {
    const nucleus = new THREE.Group();
    const offsets = [
      [0.12, 0.08, 0], [-0.12, -0.06, 0.08], [0, -0.1, -0.1], [0.06, 0.12, 0.08],
    ];
    offsets.forEach(([x, y, z], i) => {
      const n = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 20, 16),
        matGloss(i % 2 === 0 ? 0xef4444 : 0xf59e0b, i % 2 === 0 ? 0xef4444 : 0xf59e0b, 0.25)
      );
      n.position.set(x, y, z);
      nucleus.add(n);
    });
    const shells: Array<{ ring: THREE.Mesh; electron: THREE.Mesh; tilt: [number, number]; baseR: number; speed: number }> = [];
    const tilts: Array<[number, number]> = [[0.5, 0.3], [-0.6, 0.9], [1.1, -0.4]];
    tilts.forEach(([rx, ry], idx) => {
      const g = new THREE.Group();
      g.rotation.set(rx, ry, 0);
      const r = 1.2 + idx * 0.45;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 12, 56), matGloss(0x64748b));
      const electron = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), matGloss(0x38bdf8, 0x38bdf8, 0.8));
      g.add(ring, electron);
      root.add(g);
      shells.push({ ring, electron, tilt: [rx, ry], baseR: r, speed: 1.8 - idx * 0.35 });
    });
    root.add(nucleus);
    return {
      update(t, norm) {
        const radiusScale = 0.7 + (norm[0] ?? 0.5) * 0.75;
        const speedMult = 0.4 + (norm[1] ?? 0.5) * 2.2;
        nucleus.rotation.y = t * 0.6;
        shells.forEach((s, i) => {
          const r = s.baseR * radiusScale;
          s.ring.scale.set(radiusScale, radiusScale, 1);
          const ang = t * s.speed * speedMult + i * 2.1;
          s.electron.position.set(r * Math.cos(ang), r * Math.sin(ang), 0);
        });
      },
    };
  }

  if (preset === "circuit") {
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 2.4), matGloss(0x0f2922));
    board.position.y = -0.08;
    board.receiveShadow = true;
    const battery = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.05, 24), matGloss(0xf59e0b, 0xd97706, 0.15));
    battery.rotation.z = Math.PI / 2;
    battery.position.set(-1.35, 0.32, 0.6);
    const resistor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 20), matGloss(0xd97706));
    resistor.rotation.z = Math.PI / 2;
    resistor.position.set(0, 0.25, -0.65);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.92 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), ledMat);
    led.position.set(1.35, 0.42, 0.1);
    const wire = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 10, 48), matMetal(0x94a3b8));
    wire.rotation.x = Math.PI / 2;
    wire.scale.set(1.25, 0.6, 1);
    wire.position.y = 0.08;
    const charges: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), matGloss(0x38bdf8, 0x38bdf8, 0.7));
      charges.push(ch);
      root.add(ch);
    }
    root.add(board, battery, resistor, led, wire);
    return {
      update(t, norm) {
        const v = 0.15 + (norm[0] ?? 0.55) * 1.4;
        const r = 0.35 + (norm[1] ?? 0.4) * 1.4;
        const current = clamp(v / r, 0.1, 3);
        ledMat.emissiveIntensity = 0.25 + current * 0.95;
        const resScale = 0.65 + (norm[1] ?? 0.4) * 0.8;
        resistor.scale.set(resScale, 1, resScale);
        charges.forEach((ch, idx) => {
          const ang = (idx / charges.length) * Math.PI * 2 + t * current * 1.8;
          ch.position.set(1.62 * Math.cos(ang), 0.12, 0.78 * Math.sin(ang));
        });
      },
    };
  }

  if (preset === "optics") {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.14, 0.6), matMetal(0x475569));
    bench.position.y = -0.8;
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.5 });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 24), lensMat);
    lens.scale.set(0.28, 1.35, 1.35);
    const objArrow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 14), matGloss(0xf59e0b, 0xf59e0b, 0.3));
    const focalDot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), matGloss(0xec4899, 0xec4899, 0.8));
    const imgArrow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 14), matGloss(0x34d399, 0x34d399, 0.35));
    const rayMat = matGloss(0xfef08a, 0xfacc15, 0.6);
    const ray1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), rayMat);
    const ray2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), rayMat);
    root.add(bench, lens, objArrow, focalDot, imgArrow, ray1, ray2);
    return {
      update(_t, norm) {
        const focal = 0.75 + (norm[0] ?? 0.45) * 1.1;
        const objDist = 1.2 + (norm[1] ?? 0.55) * 1.3;
        lens.scale.x = clamp(0.42 - (norm[0] ?? 0.45) * 0.22, 0.15, 0.55);
        objArrow.position.set(-objDist, 0.35, 0);
        focalDot.position.set(focal, 0, 0);
        const imgDist = Math.abs(objDist - focal) > 0.15 ? clamp((focal * objDist) / (objDist - focal), -2.4, 2.5) : 2.5;
        const mag = -imgDist / objDist;
        imgArrow.position.set(imgDist, mag * 0.35, 0);
        imgArrow.scale.y = clamp(Math.abs(mag), 0.25, 1.6);
        ray1.position.set(-objDist / 2, 0.7, 0);
        ray1.rotation.z = Math.PI / 2;
        ray1.scale.y = objDist;
        const dx = Math.max(0.5, imgDist);
        const dy = mag * 0.7 - 0.7;
        const rLen = Math.hypot(dx, dy);
        ray2.position.set(dx / 2, (0.7 + mag * 0.7) / 2, 0);
        ray2.rotation.z = Math.atan2(dx, -dy);
        ray2.scale.y = rLen;
      },
    };
  }

  if (preset === "lever") {
    const fulcrum = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.85, 4), matMetal(0x64748b));
    fulcrum.rotation.y = Math.PI / 4;
    fulcrum.position.y = 0.42;
    const beamGroup = new THREE.Group();
    beamGroup.position.y = 0.88;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 0.5), matGloss(0xe2e8f0));
    const leftBox = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), matGloss(0xef4444, 0xef4444, 0.15));
    const rightBox = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), matGloss(0x3b82f6, 0x3b82f6, 0.15));
    beamGroup.add(beam, leftBox, rightBox);
    root.add(fulcrum, beamGroup);
    return {
      update(t, norm) {
        const mL = 0.5 + (norm[0] ?? 0.5) * 1.4;
        const mR = 0.5 + (norm[1] ?? 0.5) * 1.4;
        const dL = 0.6 + (norm[2] ?? 0.6) * 1.2;
        const dR = 1.2;
        leftBox.position.set(-dL, 0.3, 0);
        leftBox.scale.set(0.75 + mL * 0.25, 0.75 + mL * 0.25, 0.75 + mL * 0.25);
        rightBox.position.set(dR, 0.3, 0);
        rightBox.scale.set(0.75 + mR * 0.25, 0.75 + mR * 0.25, 0.75 + mR * 0.25);
        const torqueDiff = mL * dL - mR * dR;
        const targetTilt = clamp(torqueDiff * 0.26, -0.35, 0.35);
        beamGroup.rotation.z = targetTilt + 0.02 * Math.sin(t * 2.5);
      },
    };
  }

  if (preset === "orbit") {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.6, 28, 20), matGloss(0xf59e0b, 0xf59e0b, 0.9));
    const track = new THREE.Mesh(new THREE.TorusGeometry(2, 0.02, 10, 64), matMetal(0x475569));
    track.rotation.x = Math.PI / 2;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), matGloss(0x38bdf8, 0x0284c7, 0.2));
    planet.castShadow = true;
    root.add(sun, track, planet);
    return {
      update(t, norm) {
        const r = 1.1 + (norm[0] ?? 0.5) * 1.6;
        const speed = 0.5 + (norm[1] ?? 0.5) * 2.2;
        const tilt = ((norm[2] ?? 0.2) - 0.5) * 0.5;
        track.scale.set(r / 2, r / 2, 1);
        const a = t * speed;
        planet.position.set(r * Math.cos(a), r * Math.sin(tilt) * Math.sin(a), r * Math.sin(a));
        planet.rotation.y = t * 1.5;
      },
    };
  }

  if (preset === "wave") {
    const beads: THREE.Mesh[] = [];
    for (let i = 0; i < 17; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), matGloss(0x38bdf8, 0x3b82f6, 0.35));
      b.position.x = -2.4 + i * 0.3;
      root.add(b);
      beads.push(b);
    }
    return {
      update(t, norm) {
        const amp = 0.15 + (norm[0] ?? 0.6) * 1.1;
        const freq = 0.8 + (norm[1] ?? 0.4) * 2.6;
        const speed = 1.2 + (norm[2] ?? 0.5) * 3.2;
        beads.forEach((b, i) => {
          b.position.y = amp * Math.sin(freq * (i * 0.45) - speed * t);
        });
      },
    };
  }

  if (preset === "field") {
    const north = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.65), matGloss(0xef4444, 0xef4444, 0.2));
    north.position.x = -0.55;
    const south = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.65), matGloss(0x3b82f6, 0x3b82f6, 0.2));
    south.position.x = 0.55;
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.85 + i * 0.28, 0.025, 10, 48), matGloss(0xa78bfa, 0x8b5cf6, 0.45));
      r.rotation.y = Math.PI / 2;
      r.position.x = -0.8 + i * 0.4;
      root.add(r);
      rings.push(r);
    }
    root.add(north, south);
    return {
      update(t, norm) {
        const strength = 0.45 + (norm[0] ?? 0.6) * 1.15;
        rings.forEach((r, i) => {
          const pulse = 1 + 0.06 * Math.sin(t * 3 - i * 0.6);
          const sc = strength * pulse;
          r.scale.set(sc, sc, 1);
        });
      },
    };
  }

  // Fallback "custom" dynamic rig when AI passed empty parts
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.55, 0.2, 32), matMetal(0x334155));
  pedestal.position.y = -0.1;
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), matGloss(0x4f6df5, 0x4f6df5, 0.22));
  rotor.position.y = 0.55;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 14, 48), matGloss(0xf59e0b, 0xf59e0b, 0.4));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.6;
  const satellite = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), matGloss(0x38bdf8, 0x38bdf8, 0.6));
  root.add(pedestal, rotor, ring, satellite);
  const count = Math.max(1, sliders.length);
  return {
    update(t, norm) {
      const s0 = 0.55 + (norm[0] ?? 0.5) * 1.1;
      const s1 = 0.5 + (norm[Math.min(1, count - 1)] ?? 0.5) * 1.4;
      const s2 = ((norm[Math.min(2, count - 1)] ?? 0.5) - 0.5) * 0.8;
      rotor.scale.set(s0, 0.7 + s1 * 0.5, s0);
      rotor.rotation.y = t * 0.7;
      rotor.rotation.z = s2;
      ring.scale.set(0.8 + s0 * 0.35, 0.8 + s0 * 0.35, 1);
      const r = 1.45 * (0.8 + s0 * 0.35);
      const a = t * (0.8 + s1);
      satellite.position.set(r * Math.cos(a), 0.6 + s2 * Math.sin(a), r * Math.sin(a));
    },
  };
}

export function Artifact3DBlock({ b }: { b: Artifact3DData }) {
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(b.sliders.map((s) => [s.key, s.value]))
  );
  const valsRef = useRef(vals);
  useEffect(() => {
    valsRef.current = vals;
  }, [vals]);

  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const [resetTick, setResetTick] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);

  const sliderNorms = (v: Record<string, number>) =>
    b.sliders.map((s) => (s.max > s.min ? clamp((v[s.key] ?? s.value) - s.min, 0, s.max - s.min) / (s.max - s.min) : 0.5));

  const readouts = useMemo(() => {
    return b.readouts.map((r) => {
      const radians = /\b(t|pi|tau)\b/i.test(r.expr);
      const val = safeEval(r.expr, { ...vals, pi: Math.PI, e: Math.E, t: 0 }, NaN, radians);
      return { ...r, val };
    });
  }, [b.readouts, vals]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || webglFailed) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      const id = setTimeout(() => setWebglFailed(true), 0);
      return () => clearTimeout(id);
    }

    const width = Math.max(280, el.clientWidth || 520);
    const height = Math.max(260, el.clientHeight || 320);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    camera.position.set(4.5, 3.3, 5.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.5;
    controls.maxDistance = 30;
    controls.target.set(0, 0.5, 0);

    const hemi = new THREE.HemisphereLight(0xe2e8f0, 0x0f172a, 1.05);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    const rim = new THREE.DirectionalLight(0x60a5fa, 0.45);
    rim.position.set(-5, 3, -4);
    scene.add(hemi, key, rim);

    const grid = new THREE.GridHelper(10, 12, 0x334155, 0x1e293b);
    grid.position.y = -0.25;
    scene.add(grid);

    const root = new THREE.Group();
    scene.add(root);

    let presetRuntime: PresetRuntime | null = null;
    const customObjects: Array<{ obj: THREE.Object3D; spec: PartSpec }> = [];
    let partsUseSliders = false;

    if (b.parts.length > 0) {
      const sliderKeySet = b.sliders.map((s) => s.key.toLowerCase());
      for (const spec of b.parts) {
        const obj = makePartObject(spec);
        root.add(obj);
        customObjects.push({ obj, spec });
        const joined = [...spec.size, ...spec.pos, ...spec.rot, spec.spinY ?? "", spec.bobY ?? ""].map(String).join(" ").toLowerCase();
        if (sliderKeySet.some((k) => joined.includes(k))) partsUseSliders = true;
      }
    } else {
      presetRuntime = buildPresetScene(b.preset, root, b.sliders);
      partsUseSliders = true;
    }

    const evalCustom = (t: number) => {
      const v = valsRef.current;
      const scope: Record<string, number> = { ...v, t, pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
      const norms = b.sliders.map((s) =>
        s.max > s.min ? clamp((v[s.key] ?? s.value) - s.min, 0, s.max - s.min) / (s.max - s.min) : 0.5
      );
      b.sliders.forEach((s, i) => {
        scope[`s${i}`] = v[s.key] ?? s.value;
        scope[`n${i}`] = norms[i];
      });

      if (presetRuntime) {
        presetRuntime.update(t, norms, b.sliders.map((s) => v[s.key] ?? s.value));
      } else {
        for (const { obj, spec } of customObjects) {
          const [sx, sy, sz] = normSize(spec.size, scope);
          obj.scale.set(sx, sy, sz);
          const bob = spec.bobY !== undefined ? safeEval(spec.bobY, scope, 0) : 0;
          const spin = spec.spinY !== undefined ? safeEval(spec.spinY, scope, 0) : 0;
          obj.position.set(
            safeEval(spec.pos[0], scope, 0),
            safeEval(spec.pos[1], scope, 0) + bob,
            safeEval(spec.pos[2], scope, 0)
          );
          obj.rotation.set(
            safeEval(spec.rot[0], scope, 0),
            safeEval(spec.rot[1], scope, 0) + spin,
            safeEval(spec.rot[2], scope, 0)
          );
        }
        // Guarantee sliders visibly affect the 3D scene even if AI omitted slider keys in part formulas
        if (!partsUseSliders && b.sliders.length > 0) {
          const s0 = 0.65 + (norms[0] ?? 0.5) * 0.75;
          const rotZ = ((norms[1] ?? 0.5) - 0.5) * 0.8;
          root.scale.setScalar(s0);
          root.rotation.z = rotZ;
        }
      }
    };

    // Initial evaluation + auto-frame bounding box
    evalCustom(0);
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 2);
      controls.target.copy(center);
      camera.position.set(center.x + maxDim * 1.15, center.y + maxDim * 0.85, center.z + maxDim * 1.45);
      controls.update();
    }

    const ro = new ResizeObserver(() => {
      if (!el) return;
      const w = Math.max(240, el.clientWidth);
      const h = Math.max(220, el.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    ro.observe(el);

    let simTime = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (playingRef.current) simTime += dt;
      evalCustom(simTime);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      renderer.dispose();
    };
  }, [b.preset, b.parts, b.sliders, resetTick, webglFailed]);

  const norms = sliderNorms(vals);

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900">
        {webglFailed ? (
          <svg viewBox="0 0 400 240" role="img" aria-label={b.title} className="w-full h-[260px]">
            <rect width="400" height="240" fill="#0f172a" />
            <circle cx="200" cy="120" r={30 + (norms[0] ?? 0.5) * 45} fill="#4f6df5" opacity="0.35" />
            <line
              x1="200"
              y1="120"
              x2={200 + Math.cos(((norms[1] ?? 0.3) - 0.5) * 2.4) * (50 + (norms[0] ?? 0.5) * 55)}
              y2={120 - Math.sin(((norms[1] ?? 0.3) - 0.5) * 2.4) * (50 + (norms[0] ?? 0.5) * 55)}
              stroke="#f59e0b"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <text x="200" y="216" textAnchor="middle" fill="#cbd5e1" fontSize="12">{b.title}</text>
          </svg>
        ) : (
          <div ref={mountRef} className="w-full h-[280px] sm:h-[320px] touch-none" />
        )}

        <div className="pointer-events-none absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2">
          <span className="rounded-full bg-slate-950/75 border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-100 backdrop-blur-sm truncate">
            {`${b.title} · 3D`}
          </span>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause 3D animation" : "Play 3D animation"}
              className="rounded-full bg-slate-950/75 border border-white/10 p-1.5 text-slate-200 hover:bg-slate-800"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setResetTick((n) => n + 1)}
              aria-label="Reset 3D camera"
              className="rounded-full bg-slate-950/75 border border-white/10 p-1.5 text-slate-200 hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-400">
          Drag to orbit · Scroll to zoom
        </span>
      </div>

      {readouts.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {readouts.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-2.5 py-1 text-xs font-mono"
            >
              <span className="text-slate-500">{`${r.label}:`}</span>
              <span className="font-bold text-brand-600 dark:text-brand-400">
                {`${Number.isFinite(r.val) ? round(r.val, 2) : "—"}${r.unit ? ` ${r.unit}` : ""}`}
              </span>
            </span>
          ))}
        </div>
      )}

      {b.caption && <p className="text-center text-xs text-slate-500">{b.caption}</p>}

      {b.sliders.length > 0 && (
        <div className="space-y-1.5">
          {b.sliders.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-xs font-semibold">
              <span className="w-28 shrink-0 truncate text-slate-600 dark:text-slate-300">{s.label || s.key}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={Math.max((s.max - s.min) / 100, 0.01)}
                value={vals[s.key] ?? s.value}
                onChange={(e) => setVals((o) => ({ ...o, [s.key]: Number(e.target.value) }))}
                className="flex-1 accent-brand-600"
              />
              <span className="w-16 text-right font-mono tabular-nums">
                {`${round(vals[s.key] ?? s.value, 2)}${s.unit ? ` ${s.unit}` : ""}`}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
