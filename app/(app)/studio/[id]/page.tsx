"use client";

import React, { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Square, Save, Sparkles, GitFork, Star, Share2, FlaskConical, Loader2, Wand2, Undo2, Redo2, Maximize2, Box, Cpu, Cog, Users, Globe, Lock, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ShareSheet } from "@/components/social/share-sheet";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { Viewer3D } from "@/components/studio/deferred-viewer3d";
import { CircuitBench, type CircuitValue } from "@/components/studio/circuit-bench";
import { CodeEditor } from "@/components/studio/code-editor";
import { MechPanel } from "@/components/studio/mech-panel";
import { GuidePanel, type GuideMode } from "@/components/studio/guide-panel";
import { HistoryPanel } from "@/components/studio/history-panel";
import { TrackView } from "@/components/studio/track-view";
import { DriveSim } from "@/lib/studio/drive/physics";
import { JointRig } from "@/lib/studio/twin/joints";
import { resolveTrack } from "@/lib/studio/drive/track";
import { PartEditor } from "@/components/studio/part-editor";
import { SourcesPanel } from "@/components/studio/sources-panel";
import { BlockEditor } from "@/components/studio/block-editor";
import { SimStage, type StageLab } from "@/components/studio/sim-stage";
import { compileBlocks, type BlockProgram } from "@/lib/studio/blocks";
import { sceneParts } from "@/lib/studio/circuit/to3d";
import { analyzeMechanism } from "@/lib/studio/mech/gears";
import { playLift } from "@/lib/studio/mech/playback";
import { parseSpec, type DesignSpec } from "@/lib/studio/spec";
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

type Tab = "guide" | "build" | "code" | "tests" | "sources" | "history" | "share";

async function fetchDesign(id: string): Promise<{ ok: true; data: Payload } | { ok: false; message: string }> {
  try {
    const j = await fetch(`/api/studio/designs/${id}`).then((r) => r.json());
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: j.error?.message || "Couldn't open design" };
  } catch {
    return { ok: false, message: "Couldn't open design" };
  }
}

const clock = () => Date.now();

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
  // fullscreen stage (also opened by ?stage=1 when you switch labs from inside it)
  const [stageOpen, setStageOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("stage") === "1");
  const [stageView, setStageView] = useState("3d");
  const [stageSplit, setStageSplit] = useState(true);
  const [labs, setLabs] = useState<StageLab[]>([]);
  const [drive, setDrive] = useState<DriveSim | null>(null);
  const [follow, setFollow] = useState(false);
  const [rig, setRig] = useState<JointRig | null>(null);
  const typesRef = useRef<Record<string, string>>({});
  const runningRef = useRef(false);
  const mechStopRef = useRef<(() => void) | null>(null);
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

  // undo / redo of unsaved edits (saved versions live in History)
  const workRef = useRef<DesignSpec | null>(null);
  const hist = useRef({ past: [] as DesignSpec[], future: [] as DesignSpec[], lastAt: 0, lastKey: "" });
  const [histCount, setHistCount] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHistCount({ undo: hist.current.past.length, redo: hist.current.future.length });
  useEffect(() => {
    workRef.current = work;
  }, [work]);

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
          if (opts.force) {
            markDirty(false);
            hist.current = { past: [], future: [], lastAt: 0, lastKey: "" };
            setHistCount({ undo: 0, redo: 0 });
          }
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

  useEffect(() => {
    if (!stageOpen) return;
    fetch("/api/studio/designs?scope=mine")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setLabs(asArray<StageLab>(j.data.designs).map((d) => ({ id: d.id, title: d.title, kind: d.kind })));
      })
      .catch(() => undefined);
  }, [stageOpen]);

  const edit = (patch: Partial<DesignSpec>) => {
    const cur = workRef.current;
    if (!cur) return;
    const h = hist.current;
    const key = Object.keys(patch).sort().join(",");
    const now = clock();
    // typing / dragging a slider in quick succession is one undo step
    if (!(h.past.length && key === h.lastKey && now - h.lastAt < 800)) {
      h.past.push(cur);
      if (h.past.length > 100) h.past.shift();
    }
    h.lastKey = key;
    h.lastAt = now;
    h.future = [];
    const next = { ...cur, ...patch };
    workRef.current = next;
    setWork(next);
    markDirty(true);
    syncHist();
    // Editing stops the simulation so it never runs stale wiring/code
    if (running) stopSim();
  };

  const undo = useCallback(() => {
    const h = hist.current;
    const prev = h.past.pop();
    const cur = workRef.current;
    if (!prev || !cur) return;
    h.future.push(cur);
    h.lastKey = "";
    workRef.current = prev;
    setWork(prev);
    markDirty(true);
    syncHist();
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
  }, [markDirty]);

  const redo = useCallback(() => {
    const h = hist.current;
    const next = h.future.pop();
    const cur = workRef.current;
    if (!next || !cur) return;
    h.past.push(cur);
    h.lastKey = "";
    workRef.current = next;
    setWork(next);
    markDirty(true);
    syncHist();
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
  }, [markDirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const shown = preview || work;
  const design = data?.design;
  // Challenge entries are always Socratic
  const guideMode: GuideMode = design?.challengeId ? "challenge" : mode;
  const canEdit = !!data?.canEdit && !preview;

  const parts3d = useMemo(() => (shown ? sceneParts(shown) : []), [shown]);
  const idleDrive = useMemo(() => (shown?.robot && shown.world ? new DriveSim(shown.robot, resolveTrack(shown.world)) : null), [shown]);
  const idleRig = useMemo(() => (shown && shown.joints.length ? new JointRig(shown.joints) : null), [shown]);
  const activeRig = rig && shown && rig.joints === shown.joints ? rig : idleRig;
  const activeDrive = drive && shown?.robot === drive.robot ? drive : idleDrive;
  const links = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of shown?.circuit?.parts || []) out[p.id] = p.type;
    return out;
  }, [shown]);
  useEffect(() => {
    typesRef.current = links;
  }, [links]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
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
    mechStopRef.current?.();
    mechStopRef.current = null;
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
    const robot = shown.robot;
    const sim = robot && shown.world ? new DriveSim(robot, resolveTrack(shown.world)) : null;
    setDrive(sim);
    const jr = shown.joints.length ? new JointRig(shown.joints) : null;
    setRig(jr);
    // a mechanism in the same design turns with the circuit's motor, so one Run drives everything
    const mech = shown.mechanism;
    const radPerMetre = mech ? analyzeMechanism(mech).radPerMetre : 0;
    let shaft = 0;
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (sim && robot) for (const sn of robot.sensors) inputsRef.current.values[sn.id] = sim.read(sn);
      rt.advance(rt.now + dt, 150_000);
      const key = Array.from(inputsRef.current.pressed).sort().join(",");
      if (key !== lastKey) {
        lastKey = key;
        nl = new Netlist(circuit, inputsRef.current.pressed);
      }
      const outs = evaluateOutputs(nl, rt.pins);
      setOutputs(outs);
      if (sim && robot) {
        let rem = dt / 1000;
        while (rem > 1e-6) {
          const h = Math.min(0.02, rem);
          sim.step(h, outs[robot.left], outs[robot.right]);
          rem -= h;
        }
      }
      if (jr) {
        jr.step(dt / 1000, outs);
        if (jr.applyTriggers(shown.triggers, inputsRef.current)) setPressed(new Set(inputsRef.current.pressed));
      }
      if (mech) {
        const m = Object.entries(outs).find(([pid, o]) => typesRef.current[pid] === "dc_motor" && o.on)?.[1];
        if (m) {
          shaft += (m.direction || 1) * (0.5 + m.level * 9) * (dt / 1000);
          const lift = radPerMetre > 0 ? Math.max(0, Math.min(mech.liftHeight, shaft / radPerMetre)) : 0;
          setMechState({ inputAngle: shaft, loadHeight: lift });
        }
      }
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

  /** One Run for everything: the circuit + code (which drive the 3D parts and any mechanism), or just the gear rig. */
  const runAll = () => {
    if (!shown) return;
    if (shown.circuit) return startSim();
    if (shown.mechanism) {
      stopSim();
      setRunning(true);
      mechStopRef.current = playLift(shown.mechanism, setMechState, () => setRunning(false));
    }
  };

  /** Buttons are momentary; switches latch. Used by the bench and by clicking the 3D parts. */
  const press = (pid: string, down: boolean) => {
    const isSwitch = typesRef.current[pid] === "switch";
    if (isSwitch && !down) return;
    if (!runningRef.current && shown?.circuit && down) startSim();
    const next = new Set(inputsRef.current.pressed);
    if (isSwitch) {
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
    } else if (down) next.add(pid);
    else next.delete(pid);
    inputsRef.current.pressed = next;
    setPressed(next);
  };

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
      if (j.ok && j.data.changed === false) {
        toast({ title: "The AI couldn't do that", description: j.data.note || "Try describing the change differently.", variant: "amber" });
      } else if (j.ok) {
        setAiText("");
        await load({ force: true });
        setHistoryVersion((v) => v + 1);
        toast({ title: "AI updated the design", description: [...asArray<string>(j.data.diff?.lines).slice(0, 3), j.data.note].filter(Boolean).join(" · "), variant: "success" });
      } else toast({ title: "AI couldn't change it", description: j.error?.message || "The AI service didn't answer. Try again in a moment.", variant: "destructive" });
    } catch {
      toast({ title: "AI couldn't change it", description: "Couldn't reach the AI service. Check your connection and try again.", variant: "destructive" });
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
    { key: "sources", label: "Sources", show: !!shown.circuit || !!shown.research },
    { key: "history", label: `History (${design.commitCount})`, show: true },
    { key: "share", label: "Share", show: true },
  ];
  const errorLine = runError ? Number(/^Line (\d+)/.exec(runError)?.[1]) || null : null;
  const selectedPart = parts3d.find((p) => p.id === selected);

  const liveOutputs = running ? outputs : {};
  const canRun = !!(shown.circuit || shown.mechanism);
  const mode3 = shown.codeMode ?? "text";
  const blocksProgram: BlockProgram = shown.blocks ?? { setup: [], loop: [] };
  const setBlocks = (b: BlockProgram) => edit({ blocks: b, code: compileBlocks(b), codeMode: "blocks" });
  const switchCodeMode = (m: "blocks" | "text") => {
    if (m === "text") return edit({ codeMode: "text" });
    const hasRaw = !shown.blocks && (shown.code || "").replace(/\s+/g, "").length > 40;
    if (hasRaw && !window.confirm("Blocks start empty and will replace the code. Your current code stays in History. Continue?")) return;
    setBlocks(blocksProgram);
  };

  const runBar = (
    <div className="flex flex-wrap items-center gap-2">
      {!running ? (
        <Button size="sm" onClick={runAll} className="bg-emerald-600 hover:bg-emerald-700">
          <Play className="h-4 w-4 mr-1" /> Run
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={stopSim}>
          <Square className="h-4 w-4 mr-1" /> Stop
        </Button>
      )}
      {shown.circuit && (
        <Button size="sm" variant="outline" onClick={runTests} disabled={!shown.tests.length}>
          <FlaskConical className="h-4 w-4 mr-1" /> Run tests
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setStageOpen(true)} title="Full screen, landscape-friendly simulation">
        <Maximize2 className="h-4 w-4 mr-1" /> Full screen
      </Button>
      {issues.filter((i) => i.severity === "error").length > 0 && (
        <Badge variant="destructive" className="text-[10px]">{issues.filter((i) => i.severity === "error").length} wiring error(s)</Badge>
      )}
      {running && <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> simulating</span>}
    </div>
  );

  const serialBlock =
    shown.circuit && (running || serial) ? (
      <pre className="rounded-xl bg-black text-emerald-300 text-xs p-3 max-h-40 overflow-auto whitespace-pre-wrap" aria-label="Serial monitor">{serial || "Serial monitor (Serial.println output appears here)"}</pre>
    ) : null;

  const benchEl = (fit: boolean) =>
    shown.circuit ? (
      <CircuitBench
        circuit={shown.circuit}
        onChange={(c: CircuitValue) => edit({ circuit: c })}
        outputs={liveOutputs}
        running={running}
        readOnly={!canEdit}
        pressed={pressed}
        onPress={press}
        sensorValues={sensorValues}
        onSensor={(pid, v) => {
          inputsRef.current.values[pid] = v;
          setSensorValues((s) => ({ ...s, [pid]: v }));
        }}
        highlight={gaps[0]?.parts || []}
        fit={fit}
      />
    ) : null;

  const trackBlock = activeDrive ? (
    <div className="space-y-1.5">
      <TrackView drive={activeDrive} running={running} className="h-[34vh] min-h-[220px] w-full rounded-2xl border border-slate-200 dark:border-slate-800" />
      <p className="text-[11px] text-slate-500">Top-down view with real physics: the code reads the line sensors, the motors turn the wheels, and the robot moves. Wire both drivers the same way so positive power means forward.</p>
    </div>
  ) : null;

  const benchBlock = shown.circuit ? (
    <div className="space-y-2">
      {runError && <p className="rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm px-3 py-2 font-mono">{runError}</p>}
      {benchEl(false)}
      {serialBlock}
    </div>
  ) : null;

  const viewerEl = (cls: string) => (
    <Viewer3D
      parts={parts3d}
      mechanism={shown.mechanism}
      explode={explode}
      selectedId={selected}
      onSelect={setSelected}
      mechState={mechState}
      links={links}
      live={{ outputs: liveOutputs, pressed }}
      onPress={press}
      world={activeDrive ? { track: activeDrive.track, pose: activeDrive.pose } : undefined}
      follow={follow}
      joints={activeRig && shown ? { defs: shown.joints, values: activeRig.values } : undefined}
      className={cls}
    />
  );

  const selectedCard = selectedPart ? (
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
  ) : null;

  const explodeSlider = parts3d.some((p) => p.explode) ? (
    <label className="flex items-center gap-2 text-xs font-semibold">
      Explode
      <input type="range" min={0} max={100} value={Math.round(explode * 100)} onChange={(e) => setExplode(Number(e.target.value) / 100)} className="flex-1 accent-teal-600" />
    </label>
  ) : null;

  const followButton = activeDrive ? (
    <button type="button" onClick={() => setFollow((f) => !f)} className={cn("absolute right-2 top-2 z-10 rounded-lg px-2.5 py-1.5 text-xs font-bold", follow ? "bg-teal-600 text-white" : "bg-black/50 text-white hover:bg-black/70")}>
      {follow ? "Following robot" : "Follow robot"}
    </button>
  ) : null;

  const viewerBlock = (
    <div className="space-y-2">
      <div className="relative">
        {viewerEl("h-[48vh] min-h-[320px] w-full rounded-2xl border border-slate-200 dark:border-slate-800")}
        {followButton}
      </div>
      {parts3d.some((p) => p.bind) && shown.circuit && <p className="text-[11px] text-slate-500">Tap a switch or button on the 3D model to use it — it works the same as on the circuit bench.</p>}
      {explodeSlider}
      {selectedCard}
    </div>
  );

  const codePanel = shown.circuit ? (
    <div className="space-y-2">
      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 text-xs font-semibold">
        <button type="button" disabled={!canEdit} onClick={() => switchCodeMode("blocks")} className={cn("px-3 py-1.5 rounded-lg", mode3 === "blocks" ? "bg-teal-600 text-white" : "text-slate-500")}>Blocks</button>
        <button type="button" disabled={!canEdit} onClick={() => switchCodeMode("text")} className={cn("px-3 py-1.5 rounded-lg", mode3 === "text" ? "bg-teal-600 text-white" : "text-slate-500")}>Raw code</button>
      </div>
      {mode3 === "blocks" ? (
        <>
          <BlockEditor program={blocksProgram} onChange={setBlocks} readOnly={!canEdit} />
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-slate-500">See the code your blocks make</summary>
            <pre className="mt-1 rounded-xl bg-[#0b1220] text-slate-100 p-3 overflow-auto font-mono text-[12px]">{shown.code}</pre>
          </details>
        </>
      ) : (
        <>
          <CodeEditor value={shown.code || ""} onChange={(v) => edit({ code: v })} errorLine={errorLine} readOnly={!canEdit} />
          <p className="text-[11px] text-slate-500">
            Arduino-style JavaScript: setup() runs once, loop() repeats. pinMode, digitalWrite, digitalRead, analogRead, analogWrite, delay, millis, tone, servoWrite, Serial.println. Runs in a safe sandbox.
          </p>
        </>
      )}
    </div>
  ) : null;

  const controlsPanel = (
    <div className="space-y-3 p-3 text-slate-900 dark:text-slate-100">
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
      {explodeSlider}
      {shown.mechanism && <MechPanel mechanism={shown.mechanism} onChange={(m) => edit({ mechanism: m })} readOnly={!canEdit} onAnimate={setMechState} />}
      {shown.circuit && (
        <div className="space-y-2">
          <Button size="sm" variant="outline" onClick={runTests} disabled={!shown.tests.length}>
            <FlaskConical className="h-4 w-4 mr-1" /> Run tests
          </Button>
          {testResults.map((t) => (
            <p key={t.id} className="text-xs">{t.pass ? "✅" : "❌"} {t.title}{t.pass ? "" : ` — ${t.message}`}</p>
          ))}
          {runError && <p className="rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs px-3 py-2 font-mono">{runError}</p>}
          {issues.slice(0, 6).map((i, k) => (
            <p key={k} className={cn("rounded-xl p-2 text-xs", i.severity === "error" ? "bg-rose-500/10" : "bg-amber-500/10")}>{i.system} · {i.message}</p>
          ))}
          {serialBlock}
        </div>
      )}
      {selectedCard}
    </div>
  );

  const stageViews = [
    ...(has3d ? [{ key: "3d", label: "3D", node: <div className="relative h-full w-full">{viewerEl("h-full w-full")}{followButton}</div> }] : []),
    ...(activeDrive ? [{ key: "track", label: "Track", node: <TrackView drive={activeDrive} running={running} className="h-full w-full" /> }] : []),
    ...(shown.circuit ? [{ key: "circuit", label: "Circuit", node: <div className="h-full p-1.5">{benchEl(true)}</div> }] : []),
    ...(shown.circuit ? [{ key: "code", label: "Code", node: <div className="p-2 text-slate-900 dark:text-slate-100">{codePanel}</div> }] : []),
    { key: "controls", label: "Controls", node: controlsPanel },
  ];

  const openLab = async (labId: string) => {
    if (labId === id) return;
    if (dirty && !(await save("Saved before switching lab"))) return;
    router.push(`/studio/${labId}?stage=1`);
  };

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
          <>
            <Button size="sm" variant="outline" onClick={undo} disabled={histCount.undo === 0} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={redo} disabled={histCount.redo === 0} aria-label="Redo" title="Redo (Ctrl+Y)">
              <Redo2 className="h-4 w-4" />
            </Button>
          </>
        )}
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
          {!stageOpen && (
            <>
              {(shown.circuit || shown.mechanism) && runBar}
              {shown.parts.length > 0 || !shown.circuit || shown.robot ? (
                <>
                  {has3d && viewerBlock}
                  {trackBlock}
                  {benchBlock}
                </>
              ) : (
                <>
                  {trackBlock}
                  {benchBlock}
                  {has3d && viewerBlock}
                </>
              )}
            </>
          )}
          {stageOpen && (
            <button type="button" onClick={() => setStageOpen(true)} className="w-full rounded-2xl border border-dashed border-teal-500/50 p-6 text-sm text-slate-500">
              Simulation is open full screen.
            </button>
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

            {tab === "code" && codePanel}

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

            {tab === "sources" && <SourcesPanel spec={shown} />}

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

      {stageOpen && (
        <SimStage
          title={design.title}
          views={stageViews}
          view={stageViews.some((v) => v.key === stageView) ? stageView : stageViews[0].key}
          onView={setStageView}
          split={stageSplit}
          onSplit={setStageSplit}
          running={running}
          canRun={canRun}
          onRun={runAll}
          onStop={stopSim}
          labs={labs}
          labId={id}
          onLab={openLab}
          onClose={() => setStageOpen(false)}
        />
      )}

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
