"use client";

import React, { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileText, ImageIcon, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { useBuild } from "@/components/worlds/use-build";

interface Detail {
  world: { id: string; activeJobId: string | null; title: string; status: string; themeId: string; stats: { kuCount: number; conceptCount: number; docCount: number; conflictCount: number }; disclaimer: string | null };
  docs: Array<{ id: string; title: string; pageCount: number; flaggedCount: number }>;
  concepts: Array<{ id: string; name: string; topic: string | null; count: number }>;
  conflicts: Array<{ id: string; status: "open" | "resolved" | "later"; why: string; a?: string; b?: string }>;
  agreed: number;
  lowConfidence: number;
}

export default function WorldLibraryPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/worlds/${worldId}`)).json();
      if (j.ok) setD(j.data);
      else setMissing(true);
    } catch {
      /* keep what we have */
    }
  }, [worldId]);
  const { progress, run } = useBuild(load);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  // a build that was started earlier (or before a refresh) picks up where it left off
  const jobId = d?.world.status === "building" ? d.world.activeJobId : null;
  useEffect(() => {
    if (jobId) void run(jobId);
  }, [jobId, run]);

  const decide = async (conflictId: string, choice: "a" | "b" | "later") => {
    const r = await (await fetch(`/api/worlds/${worldId}/conflicts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conflictId, choice }) })).json();
    if (!r.ok) return toast({ title: "Couldn't save that", description: r.error?.message, variant: "destructive" });
    await load();
  };
  const remove = async () => {
    if (!confirm("Delete this world and everything built from it? Your original notes stay.")) return;
    await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
    router.replace("/worlds");
  };

  const zones = useMemo(() => {
    const by = new Map<string, Detail["concepts"]>();
    for (const c of asArray<Detail["concepts"][number]>(d?.concepts)) by.set(c.topic || "Notes", [...(by.get(c.topic || "Notes") ?? []), c]);
    return [...by.entries()];
  }, [d]);

  if (missing) return <Card className="p-8 text-center">This world was not found. <Link href="/worlds" className="underline">Back to My Worlds</Link></Card>;
  if (!d) return <Skeleton className="h-64 w-full rounded-xl" />;
  const open = asArray<Detail["conflicts"][number]>(d.conflicts).filter((c) => c.status === "open");
  const building = d.world.status === "building";

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link href="/worlds" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" /> My Worlds</Link>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight truncate">{d.world.title}</h1>
          <p className="text-sm text-muted-foreground">{d.world.stats.kuCount} facts from {d.world.stats.docCount} note{d.world.stats.docCount === 1 ? "" : "s"}{d.agreed ? ` · ${d.agreed} confirmed by more than one note` : ""}</p>
        </div>
        {!building && d.world.stats.kuCount > 0 && <Link href={`/worlds/${worldId}/learn`}><Button><Play className="h-4 w-4 mr-1.5" /> Start learning</Button></Link>}
        <Link href={`/worlds/new?world=${worldId}`}><Button variant="outline"><Plus className="h-4 w-4 mr-1.5" /> Add notes</Button></Link>
      </div>

      {d.world.disclaimer && <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/40 px-3 py-2" role="note">{d.world.disclaimer}</p>}

      {building && (
        <Card className="p-4 flex items-center gap-3" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <div className="flex-1 text-sm">{progress.stageLabel}{progress.total ? ` · ${progress.done} of ${progress.total} sections` : ""}{progress.error ? ` · ${progress.error}` : ""}</div>
        </Card>
      )}

      {open.length > 0 && (
        <section className="space-y-3" aria-label="Things to confirm">
          <h2 className="font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-600" /> Your notes say two different things</h2>
          {open.map((c) => (
            <Card key={c.id} className="p-4 space-y-3 cell-hatch">
              <p className="text-sm text-muted-foreground">{c.why}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" className="h-auto whitespace-normal text-left py-3" onClick={() => decide(c.id, "a")}>{c.a}</Button>
                <Button variant="outline" className="h-auto whitespace-normal text-left py-3" onClick={() => decide(c.id, "b")}>{c.b}</Button>
              </div>
              <button type="button" onClick={() => decide(c.id, "later")} className="text-xs text-muted-foreground underline">Ask my lecturer later</button>
            </Card>
          ))}
        </section>
      )}

      <PicturesSection worldId={worldId} onChanged={load} />

      <section className="space-y-2">
        <h2 className="font-bold">Your notes</h2>
        <Card className="divide-y divide-border">
          {asArray<Detail["docs"][number]>(d.docs).map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 px-3 py-2 text-sm"><FileText className="h-4 w-4 text-muted-foreground" /><span className="flex-1 truncate">{doc.title}</span><span className="text-xs text-muted-foreground">{doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}{doc.flaggedCount ? ` · ${doc.flaggedCount} unchecked` : ""}</span></div>
          ))}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">What&apos;s in your library</h2>
        {zones.length === 0 && !building && <p className="text-sm text-muted-foreground">Nothing was found yet.</p>}
        {zones.map(([topic, cs]) => (
          <Card key={topic} className="p-3 space-y-2">
            <p className="text-sm font-semibold">{topic}</p>
            <div className="flex flex-wrap gap-1.5">{cs.map((c) => <span key={c.id} className="rounded-md bg-muted px-2 py-1 text-xs">{c.name} <span className="text-muted-foreground">· {c.count}</span></span>)}</div>
          </Card>
        ))}
      </section>

      <div className="pt-2"><button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Delete this world</button></div>
    </div>
  );
}

interface Pic {
  kuId: string;
  status: "suggested" | "approved" | "skipped";
  term: string;
  statement?: string;
  candidate: { title: string; thumbUrl: string; pageUrl: string; license: string; author: string };
}

/** Pictures from Wikimedia Commons for things you can see (a sign, a structure). She approves each one; nothing is used until she does. */
function PicturesSection({ worldId, onChanged }: { worldId: string; onChanged: () => void }) {
  const { toast } = useToast();
  const [pics, setPics] = useState<Pic[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/worlds/${worldId}/images`)).json();
      if (j.ok) setPics(asArray<Pic>(j.data.images));
    } catch {
      /* keep what we have */
    }
  }, [worldId]);
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const find = async () => {
    setBusy(true);
    const j = await (await fetch(`/api/worlds/${worldId}/images`, { method: "POST" })).json().catch(() => null);
    setBusy(false);
    if (!j?.ok) return toast({ title: "Couldn't look for pictures", description: j?.error?.message, variant: "destructive" });
    toast({ title: j.data.found ? `Found ${j.data.found} picture${j.data.found === 1 ? "" : "s"}` : "No suitable pictures found", description: j.data.found ? "Check each one and tap Use or Skip." : "Only openly licensed, non-graphic pictures are used.", variant: j.data.found ? "success" : "amber" });
    await refresh();
  };
  const decide = async (kuId: string, decision: "approve" | "skip") => {
    await fetch(`/api/worlds/${worldId}/images`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kuId, decision }) });
    await refresh();
    if (decision === "approve") onChanged();
  };
  const suggested = pics.filter((p) => p.status === "suggested");
  const used = pics.filter((p) => p.status === "approved").length;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-bold flex-1">Pictures{used ? ` (${used} in use)` : ""}</h2>
        <Button size="sm" variant="outline" onClick={find} isLoading={busy}><ImageIcon className="h-4 w-4 mr-1.5" /> Find pictures</Button>
      </div>
      <p className="text-xs text-muted-foreground">For signs and things you can see. Pictures come from Wikimedia Commons (openly licensed, credited, anything graphic is skipped), stay blurred until tapped, and are only used if you say so.</p>
      {suggested.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {suggested.map((p) => (
            <Card key={p.kuId} className="p-3 space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.candidate.thumbUrl} alt={`Suggested picture for ${p.term}`} referrerPolicy="no-referrer" className="w-full h-40 object-cover rounded-md bg-muted" loading="lazy" />
              <p className="text-sm"><span className="font-semibold">{p.term}</span><span className="text-muted-foreground"> · {p.candidate.author}, {p.candidate.license}</span></p>
              <p className="text-xs text-muted-foreground line-clamp-2">{p.statement}</p>
              <div className="flex gap-2"><Button size="sm" onClick={() => decide(p.kuId, "approve")}>Use it</Button><Button size="sm" variant="outline" onClick={() => decide(p.kuId, "skip")}>Skip</Button></div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
