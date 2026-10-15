import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { partGeometry } from "@/components/studio/viewer3d";
import type { ResolvedPart } from "@/lib/studio/spec";

/**
 * Builds the design's 3D assembly as one STL (binary, millimetres). Parts are placed at their rest
 * pose (joints and mechanisms are not animated). The viewer is Y-up; 3D printers expect Z-up, so the
 * model is turned 90° about X and dropped so its lowest point sits at z = 0.
 */
export function buildStl(parts: ResolvedPart[]): { data: ArrayBuffer; triangles: number } {
  const root = new THREE.Group();
  for (const p of parts) {
    if (p.opacity !== undefined && p.opacity < 0.02) continue;
    const mesh = new THREE.Mesh(partGeometry(p), new THREE.MeshBasicMaterial());
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.rot) mesh.rotation.set((p.rot[0] * Math.PI) / 180, (p.rot[1] * Math.PI) / 180, (p.rot[2] * Math.PI) / 180);
    root.add(mesh);
  }
  root.rotation.x = Math.PI / 2;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) {
    root.position.z -= box.min.z;
    root.updateMatrixWorld(true);
  }
  const out = new STLExporter().parse(root, { binary: true }) as unknown as DataView | ArrayBuffer;
  const data = out instanceof ArrayBuffer ? out : (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
  const triangles = data.byteLength >= 84 ? new DataView(data).getUint32(80, true) : 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return { data, triangles };
}
