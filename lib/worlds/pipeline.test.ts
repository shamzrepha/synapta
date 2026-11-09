import { describe, it, expect, vi, beforeEach } from "vitest";

/** A tiny in-memory Firestore: enough to run the real store and pipeline code end to end. */
const mem = new Map<string, Record<string, unknown>>();
const ts = () => ({ _t: Date.now() });
function ref(path: string): Record<string, unknown> {
  const id = path.split("/").pop()!;
  return {
    id,
    path,
    get: async () => ({ id, exists: mem.has(path), data: () => (mem.has(path) ? structuredClone(mem.get(path)) : undefined), ref: ref(path) }),
    set: async (d: Record<string, unknown>, o?: { merge?: boolean }) => void mem.set(path, o?.merge ? { ...(mem.get(path) ?? {}), ...structuredClone(d) } : structuredClone(d)),
    update: async (d: Record<string, unknown>) => void mem.set(path, { ...(mem.get(path) ?? {}), ...structuredClone(d) }),
    delete: async () => void mem.delete(path),
    collection: (n: string) => coll(`${path}/${n}`),
  };
}
function coll(path: string): Record<string, unknown> {
  let n = 0;
  return {
    doc: (id?: string) => ref(`${path}/${id ?? `auto${++n}_${Math.random().toString(36).slice(2, 7)}`}`),
    get: async () => {
      const docs = [...mem.keys()].filter((k) => k.startsWith(path + "/") && !k.slice(path.length + 1).includes("/")).map((k) => ({ id: k.split("/").pop()!, ref: ref(k), data: () => structuredClone(mem.get(k)) }));
      return { docs, forEach: (f: (d: unknown) => void) => docs.forEach(f), empty: docs.length === 0 };
    },
  };
}
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => ts() },
  FieldValue: { delete: () => ({}) },
  adminDb: () => ({
    collection: (n: string) => coll(n),
    batch: () => {
      const ops: Array<() => Promise<void>> = [];
      return { set: (r: { set: (d: unknown) => Promise<void> }, d: unknown) => void ops.push(() => r.set(d)), delete: (r: { delete: () => Promise<void> }) => void ops.push(() => r.delete()), commit: async () => void (await Promise.all(ops.map((o) => o()))) };
    },
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) => fn({ get: (r: { get: () => Promise<unknown> }) => r.get(), update: (r: { update: (d: unknown) => Promise<void> }, d: unknown) => void r.update(d), set: (r: { set: (d: unknown) => Promise<void> }, d: unknown) => void r.set(d) }),
  }),
}));
vi.mock("@/lib/ai/api-key", () => ({ activeGeminiKey: () => "", refreshGeminiKey: async () => undefined }));
vi.mock("@/lib/ai/groq", () => ({ activeGroqKey: () => "", refreshGroqKey: async () => undefined, listGroqModels: async () => null }));

import { advanceJob, planJob, STAGE_LABELS, type JobDoc } from "./pipeline";
import { ingestDocument } from "./ingest";
import { col, loadLibrary, now } from "./store";
import { EMPTY_AI_CONFIG, type AiConfig } from "@/lib/ai/structured/types";
import type { Gen } from "./extract";

const config: AiConfig = { ...EMPTY_AI_CONFIG, models: { m: { id: "any", provider: "p", capabilities: ["json_mode"], contextTokens: 8000, maxOutputTokens: 2000, tier: "standard" } }, routes: { ...EMPTY_AI_CONFIG.routes, extract: ["m"] } };

const NOTE_A = `GASTROSTOMY FEEDING\nDEFINITION\nA gastrostomy tube gives feeds directly into the stomach.\nPROCEDURE\nDo not use the tube for the first 4-6 hours after insertion.\nCOMPLICATIONS\nClean the stoma site 1-2 times daily.`;
const NOTE_B = `GASTROSTOMY FEEDING\nPROCEDURE\nDo not use the tube for the first 4-6 hours after insertion.\nFlush the tube with water after each feed.\nCOMPLICATIONS\nClean the stoma site daily (three times daily).`;

/** A model that returns one grounded unit for every line that looks like a fact. */
const gen: Gen = (async (o: { promptVars: { source: string } }) => {
  const units = o.promptVars.source.split("\n").flatMap((row) => {
    const m = /^(\d+):(\d+) (.+)$/.exec(row);
    if (!m || /^[A-Z\s]+$/.test(m[3])) return [];
    return [{ type: "rule", statement: m[3].replace(/\.$/, "") + ".", question: `What does the note say? (${m[2]})`, answer: "see note", source: { pageNo: Number(m[1]), lineStart: Number(m[2]), lineEnd: Number(m[2]), excerpt: m[3] } }];
  });
  return { data: { units }, meta: { modelId: "x", repairs: 0, latencyMs: 1, usage: { in: 0, out: 0 } } };
}) as unknown as Gen;

async function startJob(worldId: string, docIds: string[], owner = "u1") {
  const { plan } = await planJob(docIds);
  const jobRef = col.jobs().doc();
  const job: JobDoc = { ownerUid: owner, worldId, docIds, status: "queued", stage: "extract", stageLabel: STAGE_LABELS.extract, plan, done: [], attempts: {}, skipped: [], report: { dropped: 0, modelCalls: 0, unitsFound: 0, unitsAdded: 0, unitsAlreadyKnown: 0, conflicts: 0 }, createdAt: now(), updatedAt: now() };
  await jobRef.set(JSON.parse(JSON.stringify(job)));
  return jobRef.id;
}
async function runToEnd(jobId: string, g: Gen = gen) {
  for (let i = 0; i < 40; i++) {
    const { more } = await advanceJob(jobId, { gen: g, config });
    if (!more) return;
  }
  throw new Error("did not finish");
}

describe("the build pipeline, end to end", () => {
  beforeEach(() => mem.clear());

  it("merges two notes on one topic into one library and raises the disagreement", async () => {
    const a = await ingestDocument({ ownerUid: "u1", title: "Note A", kind: "text", pageTexts: [NOTE_A] });
    const b = await ingestDocument({ ownerUid: "u1", title: "Note B", kind: "text", pageTexts: [NOTE_B] });
    await col.worlds().doc("w1").set({ ownerUid: "u1", title: "Gastrostomy", docIds: [], status: "building", stats: {}, createdAt: now(), updatedAt: now() });
    const jobId = await startJob("w1", [a.docId, b.docId]);
    await runToEnd(jobId);

    const world = (await col.worlds().doc("w1").get()).data()!;
    expect(world.status).toBe("ready");
    expect(world.docIds).toEqual(expect.arrayContaining([a.docId, b.docId]));
    const lib = await loadLibrary("w1");
    const units = Object.values(lib.units);
    // the shared fact is stored once and remembers both notes; each note's own facts are both kept
    const shared = units.filter((u) => u.statement.startsWith("Do not use the tube"));
    expect(shared).toHaveLength(1);
    expect(shared[0].alsoIn.length).toBe(1);
    expect(units.some((u) => u.statement.includes("Flush the tube"))).toBe(true);
    expect(units.some((u) => u.statement.includes("gives feeds"))).toBe(true);
    // the two cleaning frequencies disagree: raised, not chosen
    const conflicts = Object.values(lib.conflicts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].status).toBe("open");
    expect(world.stats).toMatchObject({ conflictCount: 1, docCount: 2 });
    const job = (await col.jobs().doc(jobId).get()).data()!;
    expect(job.status).toBe("done");
    expect(job.report.unitsAlreadyKnown).toBeGreaterThan(0);

    // the playable world exists: zones, lessons with beats, and grounded activities for every fact
    expect(world.zones.length).toBeGreaterThan(0);
    expect(world.nodes.length).toBeGreaterThan(0);
    expect(world.stats.activityCount).toBeGreaterThanOrEqual(units.length);
    const acts = [...mem.keys()].filter((k) => k.startsWith("worlds/w1/activities/"));
    expect(acts.length).toBe(world.stats.activityCount);

    // when the student settles the disagreement, the dropped fact leaves every lesson
    const [c] = conflicts;
    const { resolveConflict } = await import("./audit");
    const { saveLibrary } = await import("./store");
    const { rebuildWorld } = await import("./build");
    const settled = resolveConflict(lib, c.id, c.kuIdA);
    await saveLibrary("w1", settled);
    await rebuildWorld("w1", settled);
    const after = [...mem.entries()].filter(([k]) => k.startsWith("worlds/w1/activities/")).map(([, v]) => v as { kuIds: string[] });
    expect(after.some((a) => a.kuIds.includes(c.kuIdB))).toBe(false);
    expect(after.some((a) => a.kuIds.includes(c.kuIdA))).toBe(true);
  });

  it("adding a third note later rebuilds the same library without duplicating anything", async () => {
    const a = await ingestDocument({ ownerUid: "u1", title: "A", kind: "text", pageTexts: [NOTE_A] });
    await col.worlds().doc("w1").set({ ownerUid: "u1", title: "G", docIds: [], status: "building", stats: {}, createdAt: now(), updatedAt: now() });
    await runToEnd(await startJob("w1", [a.docId]));
    const before = Object.keys((await loadLibrary("w1")).units).length;
    const c = await ingestDocument({ ownerUid: "u1", title: "C", kind: "text", pageTexts: [NOTE_A + "\nKeep the head raised during feeds."] });
    await runToEnd(await startJob("w1", [c.docId]));
    const after = Object.keys((await loadLibrary("w1")).units).length;
    expect(after).toBe(before + 1);
    expect((await col.worlds().doc("w1").get()).data()!.docIds).toHaveLength(2);
  });

  it("is resumable: a failing section is retried, then skipped, and the rest of the world still builds", async () => {
    const a = await ingestDocument({ ownerUid: "u1", title: "A", kind: "text", pageTexts: [NOTE_A] });
    await col.worlds().doc("w1").set({ ownerUid: "u1", title: "G", docIds: [], status: "building", stats: {}, createdAt: now(), updatedAt: now() });
    const flaky: Gen = (async (o: { promptVars: { source: string } }) => {
      if (o.promptVars.source.includes("stomach")) throw new Error("model down");
      return (gen as unknown as (x: unknown) => Promise<unknown>)(o);
    }) as unknown as Gen;
    const jobId = await startJob("w1", [a.docId]);
    await runToEnd(jobId, flaky);
    const job = (await col.jobs().doc(jobId).get()).data()!;
    expect(job.status).toBe("done");
    expect(job.skipped.length).toBe(1);
    expect(Object.values((await loadLibrary("w1")).units).some((u) => u.statement.includes("Do not use"))).toBe(true);
  });

  it("two calls never work on the same job at once", async () => {
    const a = await ingestDocument({ ownerUid: "u1", title: "A", kind: "text", pageTexts: [NOTE_A] });
    await col.worlds().doc("w1").set({ ownerUid: "u1", title: "G", docIds: [], status: "building", stats: {}, createdAt: now(), updatedAt: now() });
    const jobId = await startJob("w1", [a.docId]);
    await col.jobs().doc(jobId).update({ lockedUntil: Date.now() + 60_000 });
    const r = await advanceJob(jobId, { gen, config });
    expect(r.job).toBeNull(); // someone else holds the lease
  });

  it("flags unclear lines at upload instead of fixing them", async () => {
    const r = await ingestDocument({ ownerUid: "u1", title: "Hand", kind: "text", pageTexts: ["Peristomal infection is the most common complication"] });
    expect(r.flagged).toHaveLength(0); // typed text is fully legible
    expect(r.pageCount).toBe(1);
  });
});
