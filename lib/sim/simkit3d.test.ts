import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { buildSimulationPrompt } from "./build";
import { SIM_MODEL_GUIDE } from "./guide";
import { withDisplayPatch } from "./inject";

type Vec3Tuple = [number, number, number];

function createMockThree() {
  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v: Vector3) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    add(v: Vector3) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    sub(v: Vector3) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }
    subVectors(a: Vector3, b: Vector3) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    }
    addVectors(a: Vector3, b: Vector3) {
      this.x = a.x + b.x;
      this.y = a.y + b.y;
      this.z = a.z + b.z;
      return this;
    }
    multiplyScalar(s: number) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    lerpVectors(a: Vector3, b: Vector3, t: number) {
      this.x = a.x + (b.x - a.x) * t;
      this.y = a.y + (b.y - a.y) * t;
      this.z = a.z + (b.z - a.z) * t;
      return this;
    }
    normalize() {
      const len = this.length() || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      return this;
    }
    length() {
      return Math.hypot(this.x, this.y, this.z);
    }
    distanceTo(v: Vector3) {
      return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
    }
  }

  class Euler {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }

  class Quaternion {
    setFromUnitVectors() {
      return this;
    }
  }

  class Color {
    value: unknown;
    isColor = true;
    constructor(v: unknown) {
      this.value = v && typeof v === "object" && "value" in (v as Record<string, unknown>) ? (v as Color).value : v;
    }
    set(v: unknown) {
      this.value = v && typeof v === "object" && "value" in (v as Record<string, unknown>) ? (v as Color).value : v;
      return this;
    }
    getHex() {
      return typeof this.value === "number" ? this.value : 0x60a5fa;
    }
  }

  class Object3D {
    position = new Vector3();
    rotation = new Euler();
    scale = new Vector3(1, 1, 1);
    quaternion = new Quaternion();
    children: Object3D[] = [];
    userData: Record<string, unknown> = {};
    visible = true;
    castShadow = false;
    receiveShadow = false;
    parent: Object3D | null = null;
    add(child: Object3D) {
      child.parent = this;
      this.children.push(child);
      return this;
    }
    remove(child: Object3D) {
      this.children = this.children.filter((c) => c !== child);
      child.parent = null;
      return this;
    }
    lookAt() {}
    updateMatrixWorld() {}
    traverse(fn: (obj: Object3D) => void) {
      fn(this);
      for (const c of this.children) c.traverse(fn);
    }
  }

  class Group extends Object3D {}

  class Mesh extends Object3D {
    isMesh = true;
    geometry: Record<string, unknown>;
    material: Record<string, unknown>;
    constructor(geometry: Record<string, unknown>, material: Record<string, unknown>) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class Box3 {
    min = new Vector3(Infinity, Infinity, Infinity);
    max = new Vector3(-Infinity, -Infinity, -Infinity);
    empty = true;
    expandByObject(obj: Object3D) {
      obj.traverse((child) => {
        if ((child as Mesh).isMesh) {
          this.empty = false;
          this.min.x = Math.min(this.min.x, child.position.x - 1);
          this.min.y = Math.min(this.min.y, child.position.y - 1);
          this.min.z = Math.min(this.min.z, child.position.z - 1);
          this.max.x = Math.max(this.max.x, child.position.x + 1);
          this.max.y = Math.max(this.max.y, child.position.y + 1);
          this.max.z = Math.max(this.max.z, child.position.z + 1);
        }
      });
      return this;
    }
    setFromObject(root: Object3D) {
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      let count = 0;
      root.traverse((obj) => {
        if ((obj as Mesh).isMesh) {
          count++;
          minX = Math.min(minX, obj.position.x - 1);
          minY = Math.min(minY, obj.position.y - 1);
          minZ = Math.min(minZ, obj.position.z - 1);
          maxX = Math.max(maxX, obj.position.x + 1);
          maxY = Math.max(maxY, obj.position.y + 1);
          maxZ = Math.max(maxZ, obj.position.z + 1);
        }
      });
      if (count === 0) {
        this.empty = true;
        return this;
      }
      this.empty = false;
      this.min.set(minX, minY, minZ);
      this.max.set(maxX, maxY, maxZ);
      return this;
    }
    isEmpty() {
      return this.empty;
    }
    getCenter(target: Vector3) {
      return target.set(
        (this.min.x + this.max.x) / 2,
        (this.min.y + this.max.y) / 2,
        (this.min.z + this.max.z) / 2,
      );
    }
    getSize(target: Vector3) {
      return target.set(
        Math.max(0, this.max.x - this.min.x),
        Math.max(0, this.max.y - this.min.y),
        Math.max(0, this.max.z - this.min.z),
      );
    }
  }

  class BaseGeometry {
    args: unknown[];
    type: string;
    attributes: Record<string, unknown> = {};
    constructor(type: string, ...args: unknown[]) {
      this.type = type;
      this.args = args;
    }
    setFromPoints() {
      return this;
    }
    setAttribute() {
      return this;
    }
    dispose() {}
  }

  const makeGeo = (name: string) =>
    class extends BaseGeometry {
      constructor(...args: unknown[]) {
        super(name, ...args);
      }
    };

  class Material {
    opts: Record<string, unknown>;
    color: Color;
    emissive: Color;
    emissiveIntensity: number;
    constructor(opts: Record<string, unknown> = {}) {
      this.opts = opts;
      this.color = new Color(opts.color ?? 0xffffff);
      this.emissive = new Color(opts.emissive ?? 0x000000);
      this.emissiveIntensity = Number(opts.emissiveIntensity ?? 0);
    }
    dispose() {}
  }

  class Scene extends Object3D {
    background: unknown = null;
    fog: unknown = null;
  }

  class PerspectiveCamera extends Object3D {
    fov: number;
    aspect: number;
    near: number;
    far: number;
    constructor(fov = 45, aspect = 1.5, near = 0.1, far = 200) {
      super();
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
    }
    updateProjectionMatrix() {}
  }

  class WebGLRenderer {
    domElement = {
      tagName: "CANVAS",
      style: {} as Record<string, string>,
      dataset: {} as Record<string, string>,
      addEventListener: () => {},
      removeEventListener: () => {},
      setAttribute: () => {},
      getBoundingClientRect: () => ({ width: 800, height: 380, left: 0, top: 0 }),
    };
    shadowMap = { enabled: false, type: 0 };
    outputColorSpace = "";
    toneMapping = 0;
    toneMappingExposure = 1;
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
  }

  class Light extends Object3D {
    shadow = {
      mapSize: { width: 1024, height: 1024, set: () => {} },
      camera: { near: 0.1, far: 50, left: -10, right: 10, top: 10, bottom: -10 },
      bias: 0,
    };
  }

  return {
    Vector3,
    Euler,
    Quaternion,
    Color,
    Object3D,
    Group,
    Mesh,
    Line: Mesh,
    Sprite: Mesh,
    Box3,
    BoxGeometry: makeGeo("Box"),
    CylinderGeometry: makeGeo("Cylinder"),
    SphereGeometry: makeGeo("Sphere"),
    ConeGeometry: makeGeo("Cone"),
    TorusGeometry: makeGeo("Torus"),
    CapsuleGeometry: makeGeo("Capsule"),
    PlaneGeometry: makeGeo("Plane"),
    RingGeometry: makeGeo("Ring"),
    CircleGeometry: makeGeo("Circle"),
    TubeGeometry: makeGeo("Tube"),
    BufferGeometry: makeGeo("Buffer"),
    ExtrudeGeometry: makeGeo("Extrude"),
    Shape: class {
      moveTo() {}
      lineTo() {}
      quadraticCurveTo() {}
    },
    CatmullRomCurve3: class {
      pts: unknown[];
      constructor(pts: unknown[]) {
        this.pts = pts;
      }
    },
    MeshStandardMaterial: Material,
    MeshBasicMaterial: Material,
    MeshPhysicalMaterial: Material,
    LineBasicMaterial: Material,
    SpriteMaterial: Material,
    CanvasTexture: class {
      colorSpace = "";
      needsUpdate = false;
    },
    Scene,
    FogExp2: class {},
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight: Light,
    DirectionalLight: Light,
    HemisphereLight: Light,
    PointLight: Light,
    GridHelper: Object3D,
    DoubleSide: 2,
    PCFSoftShadowMap: 2,
    ACESFilmicToneMapping: 4,
    SRGBColorSpace: "srgb",
    OrbitControls: class {
      target = new Vector3();
      enableDamping = true;
      dampingFactor = 0.08;
      minDistance = 1;
      maxDistance = 50;
      maxPolarAngle = Math.PI;
      addEventListener() {}
      update() {}
      saveState() {}
      reset() {}
      dispose() {}
    },
  };
}

function loadSimKit3D() {
  const code = fs.readFileSync(path.join(process.cwd(), "public", "sim", "simkit3d.js"), "utf8");
  const THREE = createMockThree();
  const makeEl = (tag = "DIV") => ({
    tagName: tag,
    nodeType: 1,
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    children: [] as unknown[],
    clientWidth: 800,
    clientHeight: 380,
    textContent: "",
    innerHTML: "",
    appendChild(child: unknown) {
      this.children.push(child);
      return child;
    },
    insertBefore(child: unknown) {
      this.children.unshift(child);
      return child;
    },
    removeChild(child: unknown) {
      this.children = this.children.filter((c) => c !== child);
      return child;
    },
    contains() {
      return false;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    getContext() {
      return {
        font: "",
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        textAlign: "center",
        textBaseline: "middle",
        clearRect() {},
        fillRect() {},
        beginPath() {},
        roundRect() {},
        fill() {},
        stroke() {},
        fillText() {},
      };
    },
    getBoundingClientRect: () => ({ width: 800, height: 380, left: 0, top: 0 }),
  });

  const stageEl = makeEl("DIV");
  const bodyEl = makeEl("BODY");
  bodyEl.appendChild(stageEl);

  const sandbox: Record<string, unknown> = {
    THREE,
    Math,
    Number,
    Array,
    Object,
    String,
    Boolean,
    console,
    performance: { now: () => 0 },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
    getComputedStyle: () => ({ display: "block", position: "relative" }),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    document: {
      createElement: (tag: string) => makeEl(tag.toUpperCase()),
      head: makeEl("HEAD"),
      body: bodyEl,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => stageEl,
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: "public/sim/simkit3d.js" });
  return {
    SimKit3D: sandbox.SimKit3D as { create: (el: unknown, opts?: Record<string, unknown>) => Record<string, (...args: unknown[]) => unknown> },
    stage: stageEl,
  };
}

describe("SimKit3D runtime & simulation medium rules", () => {
  it("prevents hex color integers from becoming giant cylinder heights and honors pos/rot opts", () => {
    const { SimKit3D, stage } = loadSimKit3D();
    const kit = SimKit3D.create(stage);

    // Legacy bug: hex integer 0xcbd5e1 (13424097) passed as 3rd arg used to be read as cylinder height!
    const cylLegacy = kit.cylinder(0.2, 2.2, 0xcbd5e1, { pos: [1, 1.1, -0.5] as Vec3Tuple }) as {
      geometry: { args: number[] };
      material: { color: { getHex: () => number } };
      position: { x: number; y: number; z: number };
    };
    expect(cylLegacy.geometry.args[2]).toBe(2.2);
    expect(cylLegacy.material.color.getHex()).toBe(0xcbd5e1);
    expect([cylLegacy.position.x, cylLegacy.position.y, cylLegacy.position.z]).toEqual([1, 1.1, -0.5]);

    // 4-arg cylinder (rTop, rBot, h, color)
    const cylTaper = kit.cylinder(0.15, 0.3, 1.8, 0x22c55e, { pos: [-1.2, 0.9, 0] as Vec3Tuple }) as {
      geometry: { args: number[] };
      material: { color: { getHex: () => number } };
      position: { x: number; y: number; z: number };
    };
    expect(cylTaper.geometry.args[2]).toBe(1.8);
    expect(cylTaper.material.color.getHex()).toBe(0x22c55e);
    expect([cylTaper.position.x, cylTaper.position.y, cylTaper.position.z]).toEqual([-1.2, 0.9, 0]);

    // Legacy 5-arg box(w,h,d,color,opts) must NOT drop opts.pos/opts.rot
    const box = kit.box(2, 1, 0.8, 0xf59e0b, {
      pos: [0.5, 0.5, 1.2] as Vec3Tuple,
      rot: [0, 0.4, 0] as Vec3Tuple,
    }) as {
      material: { color: { getHex: () => number } };
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
    };
    expect(box.material.color.getHex()).toBe(0xf59e0b);
    expect([box.position.x, box.position.y, box.position.z]).toEqual([0.5, 0.5, 1.2]);
    expect([box.rotation.x, box.rotation.y, box.rotation.z]).toEqual([0, 0.4, 0]);

    expect(() => kit.fitCamera(1.25)).not.toThrow();
    expect(() => kit.lookAt(0, 1, 0, 7.5)).not.toThrow();
  });

  it("instructs models to use crisp 2D workbenches for circuits/Ohm's law and non-scrolling cockpit stages", () => {
    const { systemInstruction } = buildSimulationPrompt({
      kcTitle: "Ohm's Law & DC Circuits",
      subject: "Physics",
      level: "high_school",
      contextText: "V = I * R links voltage, current, and resistance in a closed circuit.",
    });
    expect(systemInstruction).toContain("REALISTIC 2D WORKBENCH");
    expect(systemInstruction).toContain("Ohm's law");
    expect(systemInstruction).toContain("clamp(240px, 46vh, 390px)");
    expect(systemInstruction).toContain("{ color, pos:[x,y,z]");
    expect(systemInstruction).toContain("kit.fitCamera");
    expect(systemInstruction).toContain("SimKit3D.create");
    expect(systemInstruction).toContain("<REFERENCE_EXAMPLE>");
    expect(SIM_MODEL_GUIDE).toContain("kit.fitCamera");

    const patched = withDisplayPatch("<html><head></head><body><div id='stage'></div></body></html>");
    expect(patched).toContain("max-height:430px");
  });
});
