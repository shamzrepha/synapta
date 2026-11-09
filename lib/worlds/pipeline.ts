import { resolveChain } from "@/lib/ai/structured/config";
import { getAiConfig } from "@/lib/ai/structured/config";
import type { AiConfig, Tier } from "@/lib/ai/structured/types";
import { AiRouteMissingError } from "@/lib/ai/structured/types";
import { adminDb } from "@/lib/firebase/admin";
import { auditLibrary } from "./audit";
import type { CleanLine } from "./clean";
import { extractSection, type Gen } from "./extract";
import { normalize } from "./fuzzy";
import { mergeIntoLibrary } from "./merge";
import { buildOutline, templateHint, type Section } from "./outline";
import { detectSubject, getPack } from "./packs";
import { col, loadDocPages, loadLibrary, now, saveLibrary } from "./store";
import { stableId, type Concept, type KnowledgeUnit } from "./types";

/**
 * The resumable build (R16). A job is a list of small units of work keyed "docId:sectionId". Each call of advanceJob does a
 * bounded amount (a few sections), records the result in Firestore and returns, so a refresh, a timeout or a model failure
 * never loses work and re-running a unit overwrites the same document.
 */
export interface JobUnit {
  key: string;
  docId: string;
  section: Section;
  packId: string;
  template: "condition" | "procedure" | "none";
}
export interface JobDoc {
  ownerUid: string;
  worldId: string;
  docIds: string[];
  status: "queued" | "running" | "done" | "failed";
  stage: "extract" | "finalize" | "done";
  stageLabel: string;
  plan: JobUnit[];
  done: string[];
  attempts: Record<string, number>;
  skipped: Array<{ key: string; reason: string }>;
  report: { dropped: number; modelCalls: number; unitsFound: number; unitsAdded: number; unitsAlreadyKnown: number; conflicts: number };
  lockedUntil?: number;
  error?: string | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

const FAN_OUT = 3;
const LEASE_MS = 100_000;
const MAX_ATTEMPTS = 2;

export const STAGE_LABELS = { extract: "Finding the key facts", finalize: "Merging with your library", done: "Your world is ready" } as const;

export async function tierFor(config: AiConfig): Promise<Tier> {
  try {
    return (await resolveChain("extract", config))[0].tier;
  } catch (e) {
    if (e instanceof AiRouteMissingError) throw e;
    return "standard";
  }
}

/** Builds the list of units for a job from the stored, cleaned documents. */
export async function planJob(docIds: string[]): Promise<{ plan: JobUnit[]; packId: string }> {
  const docs = await Promise.all(docIds.map(async (id) => ({ id, pages: await loadDocPages(id) })));
  const allText = docs.flatMap((d) => d.pages.flatMap((p) => p.lines.map((l) => l.text))).join("\n");
  const detected = detectSubject(allText);
  const plan: JobUnit[] = [];
  for (const d of docs) {
    for (const p of d.pages) {
      const sections = buildOutline(p.lines, p.pageNo);
      const hint = templateHint(sections);
      for (const s of sections) plan.push({ key: `${d.id}:${p.pageNo}:${s.id}`, docId: d.id, section: s, packId: detected.packId, template: hint });
    }
  }
  return { plan, packId: detected.packId };
}

export async function acquireLease(jobId: string): Promise<JobDoc | null> {
  const ref = col.jobs().doc(jobId);
  return adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return null;
    const job = snap.data() as JobDoc;
    if (job.status === "done" || job.status === "failed") return job;
    if (job.lockedUntil && job.lockedUntil > Date.now()) return null; // another call is working on it
    t.update(ref, { lockedUntil: Date.now() + LEASE_MS, status: "running", updatedAt: now() });
    return { ...job, status: "running" };
  });
}

interface Deps {
  gen?: Gen;
  config?: AiConfig;
}

/** One bounded step. Returns whether more calls are needed. */
export async function advanceJob(jobId: string, deps: Deps = {}): Promise<{ job: JobDoc | null; more: boolean }> {
  const job = await acquireLease(jobId);
  if (!job) return { job: null, more: true };
  if (job.status === "done" || job.status === "failed") return { job, more: false };
  const ref = col.jobs().doc(jobId);
  try {
    const config = deps.config ?? (await getAiConfig());
    if (job.stage === "extract") {
      const pending = job.plan.filter((u) => !job.done.includes(u.key) && !job.skipped.some((s) => s.key === u.key));
      if (pending.length === 0) {
        await ref.update({ stage: "finalize", stageLabel: STAGE_LABELS.finalize, lockedUntil: 0, updatedAt: now() });
        return { job: { ...job, stage: "finalize" }, more: true };
      }
      const tier = await tierFor(config);
      const pack = getPack(job.plan[0]?.packId ?? "general");
      const batch = pending.slice(0, FAN_OUT);
      const results = await Promise.allSettled(
        batch.map(async (u) => {
          const pages = await loadDocPages(u.docId);
          const page = pages.find((p) => u.key.startsWith(`${u.docId}:${p.pageNo}:`));
          if (!page) throw new Error("page missing");
          const report = await extractSection(u.section, page.lines as CleanLine[], { docId: u.docId, pageNo: page.pageNo, pack, tier, config, templateHint: u.template, gen: deps.gen });
          const topic = topicOf(u.section, page.lines as CleanLine[]);
          const concept: Concept = { id: stableId("concept", normalize(u.section.title)), name: u.section.title.replace(/^#+\s*/, ""), kind: u.template === "procedure" ? "procedure" : u.template === "condition" ? "condition" : "topic", summary: "", kuIds: report.units.map((x) => x.id), docIds: [u.docId], ...(topic ? { topic } : {}) } as Concept;
          await ref.collection("extracted").doc(encodeKey(u.key)).set(JSON.parse(JSON.stringify({ key: u.key, concept, units: report.units, dropped: report.dropped.length, modelCalls: report.modelCalls })));
          return u.key;
        })
      );
      const done = [...job.done];
      const skipped = [...job.skipped];
      const attempts = { ...job.attempts };
      results.forEach((r, i) => {
        const key = batch[i].key;
        if (r.status === "fulfilled") done.push(key);
        else {
          attempts[key] = (attempts[key] ?? 0) + 1;
          if (attempts[key] >= MAX_ATTEMPTS) skipped.push({ key, reason: (r.reason as Error)?.message?.slice(0, 160) ?? "failed" });
        }
      });
      await ref.update({ done, skipped, attempts, lockedUntil: 0, updatedAt: now() });
      return { job: { ...job, done, skipped, attempts }, more: true };
    }

    if (job.stage === "finalize") {
      await finalize(jobId, job, deps);
      return { job: { ...job, stage: "done", status: "done" }, more: false };
    }
    return { job, more: false };
  } catch (e) {
    const message = (e as Error).message?.slice(0, 300) ?? "failed";
    // a missing model assignment is the admin's to fix: the job waits instead of failing, so nothing is lost
    await ref.update({ lockedUntil: 0, error: message, status: e instanceof AiRouteMissingError ? "queued" : "running", updatedAt: now() });
    return { job: { ...job, error: message }, more: false };
  }
}

const encodeKey = (k: string) => k.replace(/[:/]/g, "__");

/** Nearest level-1 heading above a section: the "topic" that groups concepts into a zone. */
function topicOf(section: Section, lines: CleanLine[]): string | null {
  const first = lines[0];
  if (section.level <= 1 || !first) return null;
  return lines.find((l) => /^#\s|^[A-Z][A-Z\s&/-]{5,}$/.test(l.text) && l.lineNo < section.lineStart)?.text.replace(/^#+\s*/, "") ?? null;
}

/** Merge everything this job extracted into the world's library, record conflicts, and mark the world ready. */
async function finalize(jobId: string, job: JobDoc, deps: Deps): Promise<void> {
  const ref = col.jobs().doc(jobId);
  const extracted = await ref.collection("extracted").get();
  let library = await loadLibrary(job.worldId);
  const report = { ...job.report };
  for (const d of extracted.docs) {
    const e = d.data() as { concept: Concept; units: KnowledgeUnit[]; dropped: number; modelCalls: number };
    const docId = e.concept.docIds[0];
    const merged = mergeIntoLibrary(library, { docId, concepts: [e.concept], units: e.units });
    library = merged.library;
    report.unitsFound += e.units.length;
    report.unitsAdded += merged.log.unitsAdded;
    report.unitsAlreadyKnown += merged.log.unitsAlreadyKnown;
    report.dropped += e.dropped;
    report.modelCalls += e.modelCalls;
    await col.worlds().doc(job.worldId).collection("mergeLog").doc(`${jobId}_${d.id}`).set(JSON.parse(JSON.stringify({ ...merged.log, jobId })));
  }
  const audit = await auditLibrary(library, { config: deps.config, gen: deps.gen, useModel: false });
  for (const c of audit.conflicts) library.conflicts[c.id] = c;
  report.conflicts = Object.values(library.conflicts).filter((c) => c.status === "open").length;
  library.docIds = Array.from(new Set([...library.docIds, ...job.docIds]));
  await saveLibrary(job.worldId, library);
  const kuCount = Object.values(library.units).filter((u) => u.status === "active").length;
  const pack = getPack(job.plan[0]?.packId ?? "general");
  await col.worlds().doc(job.worldId).set(
    { docIds: library.docIds, subjectPackId: pack.id, themeId: pack.themes[0] ?? "island", status: "ready", stats: { kuCount, conceptCount: Object.keys(library.concepts).length, activityCount: 0, conflictCount: report.conflicts, docCount: library.docIds.length }, updatedAt: now() },
    { merge: true }
  );
  await ref.update({ stage: "done", stageLabel: STAGE_LABELS.done, status: "done", report, lockedUntil: 0, error: null, updatedAt: now() });
}
