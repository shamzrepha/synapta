import { buildValidatedActivities } from "./activities";
import { designWorld } from "./design";
import { getPack } from "./packs";
import { col, commitInChunks, loadDocPages, loadLibrary, now } from "./store";
import type { Library } from "./types";

/**
 * Turns the library into the playable world: validated activities, zones, nodes and beats. No model is involved (the
 * activities are built from the notes by code, then checked against them), so this is quick, free and the same every time.
 * Runs after a build and again whenever the student settles a conflict (the dropped fact leaves every lesson).
 */
export async function rebuildWorld(worldId: string, libIn?: Library): Promise<{ activityCount: number; nodeCount: number; dropped: number }> {
  const lib = libIn ?? (await loadLibrary(worldId));
  const worldRef = col.worlds().doc(worldId);
  const world = (await worldRef.get()).data() ?? {};

  const docIds = Array.from(new Set(Object.values(lib.units).map((u) => u.source.docId)));
  const pages = new Map<string, Map<number, Array<{ lineNo: number; text: string }>>>();
  for (const id of docIds) {
    const m = new Map<number, Array<{ lineNo: number; text: string }>>();
    for (const p of await loadDocPages(id)) m.set(p.pageNo, p.lines);
    pages.set(id, m);
  }
  const lineText = (docId: string, pageNo: number, from: number, to: number) =>
    (pages.get(docId)?.get(pageNo) ?? []).filter((l) => l.lineNo >= from && l.lineNo <= to).map((l) => l.text).join(" ");

  const report = buildValidatedActivities(lib, lineText);
  const design = designWorld(lib, report.activities);

  // replace what is stored: write the new set, delete what is no longer in it
  const [oldNodes, oldActs] = await Promise.all([worldRef.collection("nodes").get(), worldRef.collection("activities").get()]);
  const nodeIds = new Set(design.nodes.map((n) => n.id));
  const actIds = new Set(report.activities.map((a) => a.id));
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
  for (const n of design.nodes) ops.push((b) => b.set(worldRef.collection("nodes").doc(n.id), JSON.parse(JSON.stringify(n))));
  for (const a of report.activities) ops.push((b) => b.set(worldRef.collection("activities").doc(a.id), JSON.parse(JSON.stringify(a))));
  oldNodes.docs.filter((d) => !nodeIds.has(d.id)).forEach((d) => ops.push((b) => b.delete(d.ref)));
  oldActs.docs.filter((d) => !actIds.has(d.id)).forEach((d) => ops.push((b) => b.delete(d.ref)));
  await commitInChunks(ops);

  const pack = getPack(world.subjectPackId ?? "general");
  const stats = { ...(world.stats ?? {}), activityCount: report.activities.length, kuCount: Object.values(lib.units).filter((u) => u.status === "active").length };
  await worldRef.set(
    {
      zones: design.zones,
      // a compact map for the screen: no beats, just what the map needs
      nodes: design.nodes.map((n) => ({ id: n.id, title: n.title, zoneId: n.zoneId, kuIds: n.kuIds, estMinutes: n.estMinutes, activityCount: n.activityIds.length })),
      themeId: pack.themes[0] ?? "island",
      stats,
      version: (world.version ?? 0) + 1,
      updatedAt: now(),
    },
    { merge: true }
  );
  return { activityCount: report.activities.length, nodeCount: design.nodes.length, dropped: report.dropped.length };
}
