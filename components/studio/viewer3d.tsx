"use client";

import React, { useEffect, useRef } from "react";
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
  className?: string;
}

const SELECT = "#ffc24d";

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

function solid(geo: THREE.BufferGeometry, color: string, opacity: number, selected: boolean): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: selected ? SELECT : color, transparent: true, opacity: selected ? Math.max(0.35, opacity * 1.6) : opacity, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: selected ? "#ffffff" : color, transparent: true }));
  g.add(mesh, edges);
  return g;
}

export function Viewer3D({ parts, mechanism, explode, selectedId, onSelect, mechState, className }: Viewer3DProps) {
  const host = useRef<HTMLDivElement>(null);
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
    fitted: string;
  } | null>(null);
  const mech = useRef(mechState);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    mech.current = mechState;
    onSelectRef.current = onSelect;
  });

  // Scene setup once
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    const content = new THREE.Group();
    scene.add(content);
    ctx.current = { renderer, scene, camera, controls, content, gears: [], load: null, rope: null, ropeTop: new THREE.Vector3(), loadBaseY: 0, pickables: [], fitted: "" };

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
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
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

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = ctx.current;
      if (!c) return;
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
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  // Rebuild content when the design changes
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
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

    for (const p of parts) {
      let geo: THREE.BufferGeometry;
      if (p.shape === "cylinder") geo = new THREE.CylinderGeometry(p.size[0], p.size[0], p.size[1] ?? p.size[0], 40);
      else if (p.shape === "cone") geo = new THREE.ConeGeometry(p.size[0], p.size[1] ?? p.size[0], 40);
      else if (p.shape === "sphere") geo = new THREE.SphereGeometry(p.size[0], 24, 16);
      else geo = new THREE.BoxGeometry(p.size[0], p.size[1] ?? p.size[0], p.size[2] ?? p.size[0]);
      const g = solid(geo, p.color || "#8fd3ff", p.opacity ?? 0.15, p.id === selectedId);
      const ex = p.explode || [0, 0, 0];
      g.position.set(p.pos[0] + ex[0] * explode, p.pos[1] + ex[1] * explode, p.pos[2] + ex[2] * explode);
      if (p.rot) g.rotation.set((p.rot[0] * Math.PI) / 180, (p.rot[1] * Math.PI) / 180, (p.rot[2] * Math.PI) / 180);
      g.userData.partId = p.id;
      c.content.add(g);
      c.pickables.push(g.children[0]);
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
  }, [parts, mechanism, explode, selectedId]);

  return <div ref={host} className={className} style={{ background: "#0b2a5b", position: "relative", overflow: "hidden" }} aria-label="3D model — drag to orbit, scroll or pinch to zoom" />;
}
