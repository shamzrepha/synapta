import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  decide: vi.fn(),
  genStudio: vi.fn(),
  editDesign: vi.fn(),
  loadCtx: vi.fn(),
  quota: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => {
  function makeDocRef(path: string) {
    return {
      path,
      async get() {
        const d = h.docs.get(path);
        return { exists: !!d, data: () => d, ref: this };
      },
      async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
        const prev = opts?.merge ? h.docs.get(path) || {} : {};
        h.docs.set(path, { ...prev, ...data });
      },
      async delete() {
        h.docs.delete(path);
      },
    };
  }
  function makeColRef(prefix: string): Record<string, unknown> {
    return {
      doc(id: string) {
        return makeDocRef(`${prefix}/${id}`);
      },
      async get() {
        const docs: Array<{ data: () => Record<string, unknown>; ref: ReturnType<typeof makeDocRef> }> = [];
        for (const [k, v] of h.docs.entries()) {
          if (k.startsWith(`${prefix}/`)) docs.push({ data: () => v, ref: makeDocRef(k) });
        }
        return { docs };
      },
    };
  }
  const db = {
    collection: (name: string) => ({
      doc: (classId: string) => ({
        collection: (kcs: string) => ({
          doc: (kcId: string) => ({
            collection: (sub: string) => makeColRef(`${name}/${classId}/${kcs}/${kcId}/${sub}`),
          }),
        }),
      }),
    }),
    runTransaction: async <T>(fn: (tx: { get: (r: { get: () => Promise<unknown> }) => Promise<unknown>; set: (r: { set: (d: Record<string, unknown>, o?: { merge?: boolean }) => Promise<void> }, d: Record<string, unknown>, o?: { merge?: boolean }) => void; delete: (r: { delete: () => Promise<void> }) => void }) => Promise<T>) => {
      const tx = {
        get: (r: { get: () => Promise<unknown> }) => r.get(),
        set: (r: { set: (d: Record<string, unknown>, o?: { merge?: boolean }) => Promise<void> }, d: Record<string, unknown>, o?: { merge?: boolean }) => {
          void r.set(d, o);
        },
        delete: (r: { delete: () => Promise<void> }) => {
          void r.delete();
        },
      };
      return fn(tx);
    },
  };
  const Timestamp = {
    now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
  };
  return { adminDb: () => db, Timestamp };
});

vi.mock("@/lib/ai/router", () => ({
  generateWithFallback: vi.fn(),
  AiGenerationError: class extends Error {},
}));
vi.mock("@/lib/quota/guard", () => ({ checkRateLimitAndQuota: h.quota }));
vi.mock("@/lib/kc/context", () => ({ loadKcGroundingContext: h.loadCtx }));
vi.mock("@/lib/studio/design-ai", () => ({ editDesign: h.editDesign }));
vi.mock("./studio-mode", () => ({
  decideSimulationMedium: h.decide,
  generateStudioSimulation: h.genStudio,
}));

import { generateAndStoreSimulation, undoSimulation, toClientSimulation, hasSimulationContent, type StoredSimulation } from "./store";

const sampleSpec = {
  version: 1 as const,
  kind: "circuit" as const,
  summary: "Ohm's Law bench",
  params: [],
  parts: [],
  joints: [],
  triggers: [],
  steps: [],
  tests: [],
  circuit: {
    parts: [{ id: "bat", type: "battery", x: 100, y: 100 }],
    wires: [],
  },
};

describe("classroom studio simulation store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.docs.clear();
    h.loadCtx.mockResolvedValue({
      kcTitle: "Ohm's Law",
      subject: "Physics",
      level: "high school",
      contextText: "V = I * R",
      objectives: ["Measure current"],
      otherTopics: [],
    });
  });

  it("identifies ready content for both html and studioSpec and strips check answer on client", () => {
    expect(hasSimulationContent({ html: null, studioSpec: null })).toBe(false);
    expect(hasSimulationContent({ studioSpec: sampleSpec })).toBe(true);
    const client = toClientSimulation(
      {
        status: "ready",
        version: 2,
        studioSpec: sampleSpec,
        html: null,
        title: "Ohm's Law",
        goal: "Verify V = IR",
        howTo: ["Wire circuit"],
        concepts: ["Ohm's law"],
        checkQuestion: { question: "Q?", options: ["A", "B", "C", "D"], correctIndex: 2, difficulty: "medium" as const, explanation: "secret" },
        historyVersions: [1],
      } as StoredSimulation,
      { includeInstructions: true }
    )!;
    expect(client.studioSpec).toEqual(sampleSpec);
    expect(client.html).toBeUndefined();
    expect(client.canUndo).toBe(true);
    expect(JSON.stringify(client)).not.toContain("correctIndex");
    expect(JSON.stringify(client)).not.toContain("secret");
  });

  it("creates a studioSpec simulation, edits it via editDesign with history, and supports Undo", async () => {
    h.decide.mockResolvedValueOnce({ medium: "studio", kind: "circuit", reason: "Circuit lab" });
    h.genStudio.mockResolvedValueOnce({
      studioSpec: sampleSpec,
      title: "Ohm's Law Bench",
      goal: "Measure V = IR",
      howTo: ["Connect wires"],
      concepts: ["Resistance"],
      checkQuestion: { question: "Q?", options: ["1", "2", "3", "4"], correctIndex: 0, difficulty: "medium" as const, explanation: "e" },
    });

    const v1 = await generateAndStoreSimulation({
      classId: "c1",
      kcId: "k1",
      userId: "t1",
      mode: "create",
      allowReplace: true,
    });
    expect(v1.version).toBe(1);
    expect(v1.studioSpec).toEqual(sampleSpec);
    expect(v1.html).toBeNull();

    const editedSpec = { ...sampleSpec, summary: "Updated with switch" };
    h.editDesign.mockResolvedValueOnce({ changed: true, spec: editedSpec, message: "Added switch" });

    const v2 = await generateAndStoreSimulation({
      classId: "c1",
      kcId: "k1",
      userId: "t1",
      mode: "edit",
      changeRequest: "Add a toggle switch",
      allowReplace: true,
    });
    expect(v2.version).toBe(2);
    expect(v2.studioSpec?.summary).toBe("Updated with switch");
    expect(v2.historyVersions).toEqual([1]);

    const v3 = await undoSimulation({ classId: "c1", kcId: "k1", userId: "t1" });
    expect(v3.version).toBe(3);
    expect(v3.studioSpec?.summary).toBe("Ohm's Law bench");
    expect(v3.html).toBeNull();
  });
});
