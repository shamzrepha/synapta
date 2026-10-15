"use client";

import React, { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Square, Save, Sparkles, GitFork, Star, Share2, FlaskConical, Loader2, Wand2, Box, Cpu, Cog, Users, Globe, Lock, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ShareSheet } from "@/components/social/share-sheet";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { Viewer3D } from "@/components/studio/viewer3d";
import { CircuitBench, type CircuitValue } from "@/components/studio/circuit-bench";
import { CodeEditor } from "@/components/studio/code-editor";
import { MechPanel } from "@/components/studio/mech-panel";
import { GuidePanel, type GuideMode } from "@/components/studio/guide-panel";
import { HistoryPanel } from "@/components/studio/history-panel";
import { PartEditor } from "@/components/studio/part-editor";
import { parseSpec, resolveParts, type DesignSpec } from "@/lib/studio/spec";
import { Netlist, evaluateOutputs, type OutputState } from "@/lib/studio/circuit/netlist";
import { BoardRuntime, circuitReader, runBehaviorTest, type TestResult } from "@/lib/studio/circuit/runtime";
import { checkCircuit, nextGaps } from "@/lib/studio/circuit/checker";
import { verifyStep, type StepResult } from "@/lib/studio/verify";
import { cn } from "@/lib/utils";

interface DesignMeta {
  id: string;
  title: string;
  kind: "circuit" | "mechanism" | "assembly";
  ownerUid: string;
  ownerName: string;
  visibility: "private" | "public" | "class";
  classId: string | null;
  challengeId: string | null;
  forkedFrom: { id: string; title: string; ownerName: string } | null;
  headCommitId: string;
  commitCount: number;
  forkCount: number;
  starCount: number;
  contributors: Array<{ uid: string; name: string; commits: number }>;
}

interface Payload {
  design: DesignMeta;
  spec: unknown;
  canEdit: boolean;
  isOwner: boolean;
  starred: boolean;
  members: Array<{ uid: string; displayName: string; owner: boolean }>;
  myProgress: Record<string, { done: boolean; verified?: boolean }>;
}

type Tab = "guide" | "build" | "code" | "tests" | "history" | "share";

async function fetchDesign(id: string): Promise<{ ok: true; data: Payload } | { ok: false; message: string }> {
  try {
    const j = await fetch(`/api/studio/designs/${id}`).then((r) => r.json());
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: j.error?.message || "Couldn't open design" };
  } catch {
    return { ok: false, message: "Couldn't open design" };
  }
}

export default function StudioEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [work, setWork] = useState<DesignSpec | null>(null);
  const [dirty, setDirty] = useState(false);
  const [stale, setStale] = useState(false);
  const [preview, setPreview] = useState<DesignSpec | null>(null);
  const [tab, setTab] = useState<Tab>("guide");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [mode, setMode] = useState<GuideMode>("learn");
  const [checking, setChecking] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [explode, setExplode] = useState(0.4);
  const [mechState, setMechState] = useState({ inputAngle: 0, loadHeight: 0 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [sharing, setSharing] = useState(false);
  // circuit simulation
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<Record<string, OutputState>>({});
  const [serial, setSerial] = useState<string>("");
  const [runError, setRunError] = useState<string | null>(null);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [sensorValues, setSensorValues] = useState<Record<string, number>>({});
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const inputsRef = useRef({ pressed: new Set<string>(), values: {} as Record<string, number> });
  const rafRef = useRef(0);

  const dirtyRef = useRef(false);
  const markDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  }, []);

  const load = useCallback(
    (opts: { force?: boolean } = {}) =>
      fetchDesign(id).then((r) => {
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setData(r.data);
        setError(null);
        setStale(false);
        try {
          const spec = parseSpec(r.data.spec);
          setWork((cur) => (cur && !opts.force && dirtyRef.current ? cur : spec));
          if (opts.force) markDirty(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "This design is damaged.");
        }
      }),
    [id, markDirty]
  );
  useEffect(() => {
    load();
  }, [load]);

  // Someone else saved → refresh (or offer to, if we have unsaved edits)
  useLiveChannel(`design:${id}`, () => {
    if (dirtyRef.current) setStale(true);
    else load({ force: true });
    setHistoryVersion((v) => v + 1);
  });

  const edit = (patch: Partial<DesignSpec>) => {
    setWork((w) => (w ? { ...w, ...patch } : w));
    markDirty(true);
    // Editing stops the simulation so it never runs stale wiring/code
    if (running) stopSim();
  };

  const shown = preview || work;
  const design = data?.design;
  // Challenge entries are always Socratic
  const guideMode: GuideMode = design?.challengeId ? "challenge" : mode;
  const canEdit = !!data?.canEdit && !preview;

  const parts3d = useMemo(() => (shown ? resolveParts(shown) : []), [shown]);
  const gaps = useMemo(() => (shown?.circuit ? nextGaps(shown.circuit, shown.code || "") : []), [shown]);
  const issues = useMemo(() => (shown?.circuit ? checkCircuit(shown.circuit, shown.code || "") : []), [shown]);
  const liveSteps = useMemo(() => {
    const out: Record<string, StepResult> = {};
    if (!shown) return out;
    for (const s of shown.steps) {
      if (s.check.kind === "test") {
        const r = testResults.find((t) => t.id === (s.check as { testId: string }).testId);
        if (r) out[s.id] = { done: r.pass, verified: true, message: r.message };
      } else out[s.id] = verifyStep(shown, s);
    }
    return out;
  }, [shown, testResults]);

  // ---------- circuit simulation ----------
  const stopSim = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
  }, []);

  const startSim = () => {
    if (!shown?.circuit) return;
    stopSim();
    const circuit = shown.circuit;
    inputsRef.current = { pressed: new Set(), values: { ...sensorValues } };
    setPressed(new Set());
    const rt = new BoardRuntime(shown.code || "", circuitReader(circuit, inputsRef.current));
    setSerial("");
    setRunError(rt.error);
    if (rt.error) return;
    setRunning(true);
    let last = performance.now();
    let printed = 0;
    let lastKey = "";
    let nl = new Netlist(circuit);
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      rt.advance(rt.now + dt, 150_000);
      const key = Array.from(inputsRef.current.pressed).sort().join(",");
      if (key !== lastKey) {
        lastKey = key;
        nl = new Netlist(circuit, inputsRef.current.pressed);
      }
      setOutputs(evaluateOutputs(nl, rt.pins));
      if (rt.serial.length > printed) {
        const add = rt.serial.slice(printed).map((s) => s.text).join("");
        printed = rt.serial.length;
        setSerial((s) => (s + add).slice(-4000));
      }
      if (rt.error) {
        setRunError(rt.error);
        setRunning(false);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const runTests = () => {
    if (!shown?.circuit) return;
    const results = shown.tests.map((t) => runBehaviorTest(shown.circuit!, shown.code || "", t));
    setTestResults(results);
    const passed = results.filter((r) => r.pass).length;
    toast({ title: `${passed}/${results.length} tests passed`, variant: passed === results.length ? "success" : "amber" });
  };

  // ---------- saving ----------
  const save = async (msg?: string, source: "manual" | "param" = "manual"): Promise<boolean> => {
    if (!work || !design) return false;
    if (!dirty) return true;
    setSaving(true);
    try {
      const j = await fetch(`/api/studio/designs/${id}/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: work, parentId: design.headCommitId, message: msg ?? message, source }),
      }).then((r) => r.json());
      if (j.ok) {
        markDirty(false);
        setMessage("");
        await load({ force: true });
        setHistoryVersion((v) => v + 1);
        toast({ title: "Version saved", description: j.data.diff?.lines?.slice(0, 2).join(" · "), variant: "success" });
        return true;
      }
      if (j.error?.code === "STALE") setStale(true);
      toast({ title: "Couldn't save", description: j.error?.message, variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const askAi = async () => {
    const instruction = aiText.trim();
    if (!instruction || !canEdit) return;
    if (dirty && !(await save("Saved before AI change"))) return;
    setAiBusy(true);
    try {
      const j = await fetch(`/api/studio/designs/${id}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction }) }).then((r) => r.json());
      if (j.ok) {
        setAiText("");
        await load({ force: true });
        setHistoryVersion((v) => v + 1);
        toast({ title: "AI updated the design", description: asArray<string>(j.data.diff?.lines).slice(0, 3).join(" · "), variant: "success" });
      } else toast({ title: "AI couldn't change it", description: j.error?.message, variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const checkStep = async (stepId: string) => {
    if (dirty && !(await save("Saved before checking a step"))) return;
    setChecking(stepId);
    try {
      const j = await fetch(`/api/studio/designs/${id}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepId }) }).then((r) => r.json());
      if (!j.ok) toast({ title: "Couldn't check", description: j.error?.message, variant: "destructive" });
      else if (j.data.done) {
        toast({ title: j.data.completed ? "🎉 Build complete!" : "Step done ✓", description: `${j.data.message}${j.data.xp ? ` +${j.data.xp} XP` : ""}`, variant: "success" });
        await load();
      } else toast({ title: "Not yet", description: j.data.message, variant: "amber" });
    } finally {
      setChecking(null);
    }
  };

  const restore = async (commitId: string) => {
    const j = await fetch(`/api/studio/designs/${id}/revert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commitId }) }).then((r) => r.json());
    if (j.ok) {
      await load({ force: true });
      setHistoryVersion((v) => v + 1);
      toast({ title: "Version restored", variant: "success" });
    } else toast({ title: "Couldn't restore", description: j.error?.message, variant: "destructive" });
  };

  const previewCommit = async (commitId: string | null) => {
    if (!commitId) return setPreview(null);
    const j = await fetch(`/api/studio/designs/${id}/commits/${commitId}`).then((r) => r.json());
    if (j.ok) setPreview(parseSpec(j.data.spec));
  };

  const fork = async () => {
    const j = await fetch(`/api/studio/designs/${id}/fork`, { method: "POST" }).then((r) => r.json());
    if (j.ok) router.push(`/studio/${j.data.id}`);
    else toast({ title: "Couldn't fork", description: j.error?.message, variant: "destructive" });
  };

  const star = async () => {
    const j = await fetch(`/api/studio/designs/${id}/star`, { method: "POST" }).then((r) => r.json());
    if (j.ok) load();
  };

  const setVisibility = async (visibility: "private" | "public" | "class") => {
    const j = await fetch(`/api/studio/designs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility }) }).then((r) => r.json());
    if (j.ok) load();
    else toast({ title: "Couldn't change visibility", description: j.error?.message, variant: "destructive" });
  };

  if (error) {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center space-y-3">
        <p className="font-bold">Couldn&apos;t open this design</p>
        <p className="text-sm text-slate-500">{error}</p>
        <Link href="/studio"><Button size="sm">Back to Maker Studio</Button></Link>
      </Card>
    );
  }
  if (!data || !shown || !design) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    );
  }

  const kindIcon = design.kind === "circuit" ? <Cpu className="h-4 w-4" /> : design.kind === "mechanism" ? <Cog className="h-4 w-4" /> : <Box className="h-4 w-4" />;
  const has3d = parts3d.length > 0 || !!shown.mechanism;
  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: "guide", label: "Guide", show: true },
    { key: "build", label: design.kind === "circuit" ? "Parts" : design.kind === "mechanism" ? "Mechanism" : "Parts & sizes", show: true },
    { key: "code", label: "Code", show: !!shown.circuit },
    { key: "tests", label: `Tests${testResults.length ? ` ${testResults.filter((t) => t.pass).length}/${testResults.length}` : ""}`, show: !!shown.circuit },
    { key: "history", label: `History (${design.commitCount})`, show: true },
    { key: "share", label: "Share", show: true },
  ];
  const errorLine = runError ? Number(/^Line (\d+)/.exec(runError)?.[1]) || null : null;
  const selectedPart = parts3d.find((p) => p.id === selected);

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/studio" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to Maker Studio">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-extrabold text-lg leading-tight truncate flex items-center gap-2">
            {kindIcon} {design.title}
          </h1>
          <p className="text-xs text-slate-500 truncate">
            by {design.ownerName}
            {design.forkedFrom && (
              <>
                {" "}· remix of <Link href={`/studio/${design.forkedFrom.id}`} className="underline">{design.forkedFrom.title}</Link>
              </>
            )}
            {design.challengeId && (
              <>
                {" "}· <Link href={`/challenges/${design.challengeId}`} className="underline font-semibold text-amber-600">challenge entry</Link>
              </>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={star} aria-label={data.starred ? "Unstar" : "Star"}>
          <Star className={cn("h-4 w-4", data.starred && "fill-amber-400 text-amber-400")} /> <span className="ml-1">{design.starCount}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={fork}>
          <GitFork className="h-4 w-4 mr-1" /> Fork
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSharing(true)}>
          <Share2 className="h-4 w-4" />
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => save()} isLoading={saving} disabled={!dirty}>
            <Save className="h-4 w-4 mr-1" /> {dirty ? "Save version" : "Saved"}
          </Button>
        )}
      </div>

      {stale && (
        <div className="rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-sm px-3 py-2 flex items-center gap-2">
          A collaborator saved a newer version.
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => load({ force: true })}>Load it (discard my unsaved changes)</Button>
        </div>
      )}
      {preview && (
        <div className="rounded-xl bg-sky-500/10 text-sky-800 dark:text-sky-300 text-sm px-3 py-2 flex items-center gap-2">
          Previewing an older version (read-only).
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setPreview(null)}>Back to current</Button>
        </div>
      )}
      {!data.canEdit && (
        <div className="rounded-xl bg-slate-100 dark:bg-slate-900 text-sm px-3 py-2 flex items-center gap-2">
          You&apos;re viewing someone else&apos;s design. Fork it to build your own version.
          <Button size="sm" className="ml-auto" onClick={fork}><GitFork className="h-4 w-4 mr-1" /> Fork</Button>
        </div>
      )}

      {/* AI command bar */}
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askAi();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500" />
            <input
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              maxLength={1500}
              placeholder={design.kind === "circuit" ? "Tell AI what to change: “add a pedestrian button on D2”" : design.kind === "mechanism" ? "Tell AI: “make it lift 5 kg with less force”" : "Tell AI: “add a handle on top, 120 mm wide”"}
              className="w-full h-10 rounded-xl border border-violet-300/60 dark:border-violet-800 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm"
            />
          </div>
          <Button type="submit" isLoading={aiBusy} disabled={!aiText.trim()} className="bg-violet-600 hover:bg-violet-700">
            <Sparkles className="h-4 w-4 mr-1" /> Apply
          </Button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        {/* stage */}
        <div className="space-y-3 min-w-0">
          {shown.circuit && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {!running ? (
                  <Button size="sm" onClick={startSim} className="bg-emerald-600 hover:bg-emerald-700">
                    <Play className="h-4 w-4 mr-1" /> Run
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={stopSim}>
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={runTests} disabled={!shown.tests.length}>
                  <FlaskConical className="h-4 w-4 mr-1" /> Run tests
                </Button>
                {issues.filter((i) => i.severity === "error").length > 0 && (
                  <Badge variant="destructive" className="text-[10px]">{issues.filter((i) => i.severity === "error").length} wiring error(s)</Badge>
                )}
                {running && <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> simulating</span>}
              </div>
              {runError && <p className="rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm px-3 py-2 font-mono">{runError}</p>}
              <CircuitBench
                circuit={shown.circuit}
                onChange={(c: CircuitValue) => edit({ circuit: c })}
                outputs={running ? outputs : {}}
                running={running}
                readOnly={!canEdit}
                pressed={pressed}
                onPress={(pid, down) => {
                  const next = new Set(inputsRef.current.pressed);
                  if (down) next.add(pid);
                  else next.delete(pid);
                  inputsRef.current.pressed = next;
                  setPressed(next);
                }}
                sensorValues={sensorValues}
                onSensor={(pid, v) => {
                  inputsRef.current.values[pid] = v;
                  setSensorValues((s) => ({ ...s, [pid]: v }));
                }}
                highlight={gaps[0]?.parts || []}
              />
              {(running || serial) && (
                <pre className="rounded-xl bg-black text-emerald-300 text-xs p-3 max-h-40 overflow-auto whitespace-pre-wrap" aria-label="Serial monitor">{serial || "Serial monitor (Serial.println output appears here)"}</pre>
              )}
            </div>
          )}
          {has3d && (
            <div className="space-y-2">
              <Viewer3D
                parts={parts3d}
                mechanism={shown.mechanism}
                explode={explode}
                selectedId={selected}
                onSelect={setSelected}
                mechState={mechState}
                className="h-[48vh] min-h-[320px] w-full rounded-2xl border border-slate-200 dark:border-slate-800"
              />
              {parts3d.some((p) => p.explode) && (
                <label className="flex items-center gap-2 text-xs font-semibold">
                  Explode
                  <input type="range" min={0} max={100} value={Math.round(explode * 100)} onChange={(e) => setExplode(Number(e.target.value) / 100)} className="flex-1 accent-teal-600" />
                </label>
              )}
              {selectedPart && (
                <div className="rounded-xl border border-dashed border-sky-400 p-3 text-sm space-y-1">
                  <p className="font-bold">{selectedPart.name}</p>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedPart.shape} · {selectedPart.size.map((n) => Math.round(n)).join(" × ")} mm
                  </p>
                  {selectedPart.info?.where && <p><b>Where:</b> {selectedPart.info.where}</p>}
                  {selectedPart.info?.fit && <p><b>Fit:</b> {selectedPart.info.fit}</p>}
                  {selectedPart.info?.material && <p><b>Material:</b> {selectedPart.info.material}</p>}
                  {selectedPart.info?.cost && <p><b>Cost:</b> {selectedPart.info.cost}</p>}
                </div>
              )}
            </div>
          )}
          {shown.summary && <p className="text-sm text-slate-600 dark:text-slate-400">{shown.summary}</p>}
        </div>

        {/* side panel */}
        <Card className="p-0 overflow-hidden min-w-0">
          <div className="flex overflow-x-auto border-b border-slate-100 dark:border-slate-800">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn("px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2", tab === t.key ? "border-teal-600 text-teal-700 dark:text-teal-300" : "border-transparent text-slate-500")}>
                  {t.label}
                </button>
              ))}
          </div>
          <div className="p-3 max-h-[78vh] overflow-y-auto">
            {tab === "guide" && (
              <GuidePanel
                designId={id}
                spec={shown}
                progress={data.myProgress}
                live={liveSteps}
                gaps={gaps}
                mode={guideMode}
                onMode={setMode}
                lockedMode={!!design.challengeId}
                canEdit={canEdit}
                checking={checking}
                onCheck={checkStep}
                testResults={testResults.map((t) => ({ title: t.title, pass: t.pass, message: t.message }))}
              />
            )}

            {tab === "build" && (
              <div className="space-y-4">
                {shown.params.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold">Settings</p>
                    {shown.params.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-xs">
                        <span className="w-28 font-semibold">{p.label}</span>
                        <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} disabled={!canEdit} onChange={(e) => edit({ params: shown.params.map((x) => (x.key === p.key ? { ...x, value: Number(e.target.value) } : x)) })} className="flex-1 accent-teal-600" />
                        <span className="font-mono w-20 text-right">{p.value} {p.unit}</span>
                      </label>
                    ))}
                  </div>
                )}
                {shown.mechanism && (
                  <MechPanel mechanism={shown.mechanism} onChange={(m) => edit({ mechanism: m })} readOnly={!canEdit} onAnimate={setMechState} />
                )}
                {shown.circuit && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold">Wiring check</p>
                    {issues.length === 0 ? (
                      <p className="text-sm text-emerald-600">✓ No problems found.</p>
                    ) : (
                      issues.map((i, k) => (
                        <div key={k} className={cn("rounded-xl p-2 text-xs", i.severity === "error" ? "bg-rose-500/10" : i.severity === "warning" ? "bg-amber-500/10" : "bg-slate-100 dark:bg-slate-900")}>
                          <p className="font-semibold">{i.system} · {guideMode === "challenge" ? i.prompt : i.message}</p>
                          {guideMode === "learn" && <p className="text-slate-600 dark:text-slate-400">{i.why}</p>}
                          {guideMode === "practice" && <p className="italic text-slate-600 dark:text-slate-400">{i.prompt}</p>}
                        </div>
                      ))
                    )}
                    <p className="text-[11px] text-slate-500">Bad wiring is allowed — run it and see what happens. That&apos;s how you learn.</p>
                  </div>
                )}
                {(shown.kind === "assembly" || shown.parts.length > 0) && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold">3D parts</p>
                    <PartEditor spec={shown} selectedId={selected} onSelect={setSelected} onChange={(parts) => edit({ parts })} readOnly={!canEdit} />
                  </div>
                )}
                {shown.notes && <p className="text-xs text-slate-500 whitespace-pre-wrap">{shown.notes}</p>}
              </div>
            )}

            {tab === "code" && shown.circuit && (
              <div className="space-y-2">
                <CodeEditor value={shown.code || ""} onChange={(v) => edit({ code: v })} errorLine={errorLine} readOnly={!canEdit} />
                <p className="text-[11px] text-slate-500">
                  Arduino-style JavaScript: setup() runs once, loop() repeats. pinMode, digitalWrite, digitalRead, analogRead, analogWrite, delay, millis, tone, servoWrite, Serial.println. Runs in a safe sandbox.
                </p>
              </div>
            )}

            {tab === "tests" && (
              <div className="space-y-2">
                {shown.tests.length === 0 && <p className="text-sm text-slate-500">No behaviour tests yet. Ask the AI: “add a test that checks the lights cycle”.</p>}
                <Button size="sm" onClick={runTests} disabled={!shown.tests.length}>
                  <FlaskConical className="h-4 w-4 mr-1" /> Run all tests
                </Button>
                {shown.tests.map((t) => {
                  const r = testResults.find((x) => x.id === t.id);
                  return (
                    <div key={t.id} className={cn("rounded-xl border p-2 text-sm", r ? (r.pass ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5") : "border-slate-200 dark:border-slate-800")}>
                      <p className="font-semibold">{r ? (r.pass ? "✅" : "❌") : "○"} {t.title}</p>
                      {r && <p className="text-xs text-slate-600 dark:text-slate-400">{r.message}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "history" && (
              <HistoryPanel designId={id} headCommitId={design.headCommitId} version={historyVersion} canEdit={!!data.canEdit} contributors={design.contributors} onRestore={restore} onPreview={previewCommit} />
            )}

            {tab === "share" && (
              <div className="space-y-4 text-sm">
                <div className="space-y-2">
                  <p className="font-bold">Who can see it</p>
                  {(["private", "public", "class"] as const)
                    .filter((v) => v !== "class" || design.classId)
                    .map((v) => (
                      <label key={v} className="flex items-center gap-2">
                        <input type="radio" name="vis" checked={design.visibility === v} disabled={!data.isOwner} onChange={() => setVisibility(v)} className="accent-teal-600" />
                        {v === "private" ? <Lock className="h-4 w-4" /> : v === "public" ? <Globe className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
                        {v === "private" ? "Only me and collaborators" : v === "public" ? "Everyone (shows in the Maker World gallery)" : "My class"}
                      </label>
                    ))}
                </div>
                <div>
                  <p className="font-bold flex items-center gap-1.5"><Users className="h-4 w-4" /> Collaborators</p>
                  <ul className="mt-1 space-y-1">
                    {data.members.map((m) => (
                      <li key={m.uid} className="flex items-center gap-2">
                        {m.displayName} {m.owner && <Badge variant="outline" className="text-[10px]">owner</Badge>}
                      </li>
                    ))}
                  </ul>
                  {data.isOwner && <CollaboratorPicker designId={id} members={data.members.map((m) => m.uid)} onChanged={() => load()} />}
                </div>
                <Button onClick={() => setSharing(true)}>
                  <Share2 className="h-4 w-4 mr-1" /> Post or send it
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {sharing && (
        <ShareSheet
          attachment={{ type: "design", id, title: design.title, subtitle: `${design.kind} · by ${design.ownerName}`, href: `/studio/${id}`, emoji: "🛠️" }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

function CollaboratorPicker({ designId, members, onChanged }: { designId: string; members: string[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Array<{ uid: string; displayName: string }> | null>(null);
  useEffect(() => {
    fetch("/api/friends")
      .then((r) => r.json())
      .then((j) => setFriends(j.ok ? asArray<{ uid: string; displayName: string }>(j.data.friends) : []))
      .catch(() => setFriends([]));
  }, []);
  const toggle = async (uid: string, add: boolean) => {
    const j = await fetch(`/api/studio/designs/${designId}/collaborators`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, action: add ? "add" : "remove" }) }).then((r) => r.json());
    if (j.ok) onChanged();
    else toast({ title: "Couldn't update", description: j.error?.message, variant: "destructive" });
  };
  if (!friends) return null;
  if (friends.length === 0) return <p className="text-xs text-slate-500 mt-1">Add friends to build together.</p>;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-slate-500">Friends who can edit (every change is credited in History):</p>
      {friends.map((f) => {
        const isMember = members.includes(f.uid);
        return (
          <div key={f.uid} className="flex items-center gap-2 text-xs">
            <span className="flex-1">{f.displayName}</span>
            <button type="button" onClick={() => toggle(f.uid, !isMember)} className={cn("rounded-lg px-2 py-1 font-semibold", isMember ? "text-rose-600" : "text-teal-600")}>
              {isMember ? "Remove" : "Add"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
