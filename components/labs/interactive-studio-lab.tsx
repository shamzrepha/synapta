"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  CheckCircle2,
  Code2,
  Columns2,
  Cpu,
  FlaskConical,
  Loader2,
  Play,
  RotateCw,
  Sliders,
  Square,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Viewer3D } from "@/components/studio/deferred-viewer3d";
import { CircuitBench, type CircuitValue } from "@/components/studio/circuit-bench";
import { CodeEditor } from "@/components/studio/code-editor";
import { MechPanel } from "@/components/studio/mech-panel";
import { TrackView } from "@/components/studio/track-view";
import { useStudioSim } from "@/components/studio/use-studio-sim";
import { TutorBubble, type TutorMessage } from "@/components/labs/tutor-bubble";
import { liveFaultIssues } from "@/lib/studio/circuit/checker";
import { compileBlocks } from "@/lib/studio/blocks";
import { emptyBlockly } from "@/lib/studio/blockly/convert";
import { cppProblems, looksLikeCpp } from "@/lib/studio/cpp";
import { parseSpec, type DesignSpec } from "@/lib/studio/spec";
import { cn } from "@/lib/utils";

const BlocklyEditor = dynamic(
  () => import("@/components/studio/blockly-editor").then((m) => m.BlocklyEditor),
  { ssr: false, loading: () => <Skeleton className="h-[360px] rounded-xl" /> }
);

export interface InteractiveStudioLabProps {
  spec: DesignSpec;
  /** Increment to force-reset the local sandbox back to `spec`. */
  resetKey?: number;
  /** True when rendered inside the parent fullscreen container. */
  full?: boolean;
  /** Compact height when embedded inside a narrower pane (e.g. PiecesLab). */
  compact?: boolean;
  onGoalComplete?: (detail?: { score?: number }) => void;
  onRuntimeError?: (message: string) => void;
}

type LabView = "circuit" | "code" | "3d" | "track" | "controls";

function safeParseSpec(raw: DesignSpec): DesignSpec {
  try {
    return parseSpec(JSON.parse(JSON.stringify(raw)));
  } catch {
    return raw;
  }
}

/**
 * Interactive SunRoot Maker Studio workbench embedded inside Classroom Simulations & Piece Labs:
 * supports live DC & microcontroller wiring, hardware-synced Scratch Blockly / Arduino C++,
 * 3D / mechanism / line-follower simulation, live behavior tests, and one-click local reset.
 */
export function InteractiveStudioLab(props: InteractiveStudioLabProps) {
  const [localReset, setLocalReset] = useState(0);
  const specKey = useMemo(() => JSON.stringify(props.spec), [props.spec]);
  return (
    <InteractiveStudioLabInner
      key={`${props.resetKey ?? 0}-${localReset}-${specKey}`}
      {...props}
      onResetLocal={() => setLocalReset((k) => k + 1)}
    />
  );
}

function InteractiveStudioLabInner({
  spec,
  full = false,
  compact = false,
  onGoalComplete,
  onRuntimeError,
  onResetLocal,
}: InteractiveStudioLabProps & { onResetLocal: () => void }) {
  const { toast } = useToast();
  const [work, setWork] = useState<DesignSpec>(() => safeParseSpec(spec));
  const [selected, setSelected] = useState<string | null>(null);
  const [explode, setExplode] = useState(0.35);
  const [follow, setFollow] = useState(false);
  const [split, setSplit] = useState(true);
  const [activeView, setActiveView] = useState<LabView>("circuit");

  const completedRef = useRef(false);
  const onGoalRef = useRef(onGoalComplete);
  const onErrRef = useRef(onRuntimeError);
  useEffect(() => {
    onGoalRef.current = onGoalComplete;
  }, [onGoalComplete]);
  useEffect(() => {
    onErrRef.current = onRuntimeError;
  }, [onRuntimeError]);

  const sim = useStudioSim(work, {
    onTestsDone: (results) => {
      const passed = results.filter((r) => r.pass).length;
      toast({
        title: `${passed}/${results.length} tests passed`,
        variant: passed === results.length ? "success" : "amber",
      });
      if (results.length > 0 && passed === results.length && !completedRef.current) {
        completedRef.current = true;
        onGoalRef.current?.({ score: 100 });
      }
    },
  });

  const { stopSim, runError, running, issues, testResults } = sim;

  useEffect(() => {
    if (runError) onErrRef.current?.(runError);
  }, [runError]);

  // For open-ended explorer labs without scripted behavior tests, award goal completion once
  // the circuit/mechanism runs cleanly with no error-severity wiring issues.
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const liveFault = !!(work.circuit && running && liveFaultIssues(work.circuit, sim.liveOutputs).some((i) => i.severity === "error"));
  useEffect(() => {
    if (!running || runError || completedRef.current || work.tests.length > 0 || errorCount > 0 || liveFault) return;
    const t = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onGoalRef.current?.({ score: 100 });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [running, runError, errorCount, liveFault, work.tests.length]);

  // Physics verdict as a short tutor bubble: it never blocks the bench, can be dismissed and fades by itself.
  // The same fault is not re-announced until it has gone away and come back.
  const [warnKey, setWarnKey] = useState({ text: "", id: 0 });
  const warnText = useMemo(() => {
    if (!running || !work.circuit) return "";
    const top = liveFaultIssues(work.circuit, sim.liveOutputs)[0] ?? issues.find((i) => i.severity === "error");
    return top ? `${top.message} ${top.why}` : "";
  }, [running, work.circuit, sim.liveOutputs, issues]);
  if (warnText !== warnKey.text) setWarnKey({ text: warnText, id: warnKey.id + 1 });
  const warning: TutorMessage | null = warnText ? { id: warnKey.id, text: warnText, tone: "warn" } : null;

  const edit = (patch: Partial<DesignSpec>) => {
    setWork((cur) => ({ ...cur, ...patch }));
    if (running) stopSim();
  };

  const resetLocal = () => {
    stopSim();
    completedRef.current = false;
    onResetLocal();
  };

  const has3d = sim.parts3d.length > 0 || !!work.mechanism;
  const hasBoard = !!work.circuit?.parts.some((p) => p.type === "board");
  const showCodeTab = !!(work.circuit && (hasBoard || (work.code || "").trim().length > 0));
  const pureWireCircuit = !!(work.circuit && !hasBoard && !work.parts.length && !work.robot && !work.mechanism);
  const canRun = !!(work.circuit || work.mechanism);

  const blankCode = !(work.code || "").replace(/void (?:setup|loop)\(\)\s*\{\s*\}|\s+/g, "").length;
  const codeMode = work.codeMode ?? (work.blocks || work.blockly || (hasBoard && blankCode) ? "blocks" : "text");
  const errorLine = runError ? Number(/^Line (\d+)/.exec(runError)?.[1]) || null : null;
  const sketchProblems = codeMode === "text" ? cppProblems(work.code || "") : [];

  const onBlocksChange = (state: object, code: string) =>
    edit({ blockly: { state: state as Record<string, unknown>, code }, blocks: undefined, code, codeMode: "blocks" });

  const switchCodeMode = (m: "blocks" | "text") => {
    if (m === "text") {
      edit({ codeMode: "text" });
      return;
    }
    const hasRaw = !work.blocks && !(work.blockly && work.blockly.code === work.code) && (work.code || "").replace(/\s+/g, "").length > 40;
    if (hasRaw && !window.confirm("Blocks start empty and will replace custom edits in Raw code. Continue?")) return;
    if (hasRaw || (!work.blocks && !work.blockly)) {
      const empty = "void setup() {\n}\n\nvoid loop() {\n}\n";
      edit({
        codeMode: "blocks",
        blocks: undefined,
        code: empty,
        blockly: { state: emptyBlockly() as unknown as Record<string, unknown>, code: empty },
      });
      return;
    }
    const code = work.blocks && !work.blockly ? compileBlocks(work.blocks) : work.code;
    edit({ codeMode: "blocks", ...(code !== work.code ? { code } : {}) });
  };

  const views: Array<{ key: LabView; label: string; icon: React.ReactNode }> = [
    ...(work.circuit ? [{ key: "circuit" as const, label: "Circuit", icon: <Cpu className="h-3.5 w-3.5" /> }] : []),
    ...(showCodeTab ? [{ key: "code" as const, label: codeMode === "blocks" ? "Blocks" : "Code", icon: <Code2 className="h-3.5 w-3.5" /> }] : []),
    ...(has3d ? [{ key: "3d" as const, label: "3D", icon: <Wrench className="h-3.5 w-3.5" /> }] : []),
    ...(sim.activeDrive ? [{ key: "track" as const, label: "Track", icon: <Play className="h-3.5 w-3.5" /> }] : []),
    { key: "controls" as const, label: errorCount > 0 ? `Controls (${errorCount})` : "Controls", icon: <Sliders className="h-3.5 w-3.5" /> },
  ];

  const primaryView = views.some((v) => v.key === activeView) ? activeView : views[0].key;
  const secondaryCandidate: LabView | null = showCodeTab && primaryView !== "code"
    ? "code"
    : has3d && primaryView !== "3d"
    ? "3d"
    : work.circuit && primaryView !== "circuit"
    ? "circuit"
    : "controls";
  const canSplit = views.length > 1;
  const showSplit = split && canSplit && !pureWireCircuit;

  const benchNode = work.circuit ? (
    <div className={cn("relative h-full flex flex-col gap-2", full ? "min-h-0" : compact ? "min-h-[340px]" : "min-h-[420px]")}>
      <div className="flex-1 min-h-0">
        <CircuitBench
          circuit={work.circuit}
          onChange={(c: CircuitValue) => edit({ circuit: c })}
          outputs={sim.liveOutputs}
          running={running}
          pressed={sim.pressed}
          onPress={sim.press}
          sensorValues={sim.sensorValues}
          onSensor={sim.setSensor}
          highlight={sim.gaps[0]?.parts || []}
          fit={full}
        />
      </div>
      <TutorBubble message={warning} className="absolute left-2 right-2 bottom-2 z-10 max-w-none sm:max-w-xl" />
      {runError && (
        <p className="rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs px-3 py-2 font-mono">{runError}</p>
      )}
      {work.circuit && (running || sim.serial) && (
        <pre className="rounded-xl bg-black text-emerald-300 text-xs p-2.5 max-h-28 overflow-auto whitespace-pre-wrap" aria-label="Serial monitor">
          {sim.serial || "Serial monitor (Serial.println output appears here)"}
        </pre>
      )}
    </div>
  ) : null;

  const codeNode = showCodeTab ? (
    <div className="space-y-2.5 p-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => switchCodeMode("blocks")}
            className={cn("px-3 py-1 rounded-lg", codeMode === "blocks" ? "bg-brand-600 text-white" : "text-slate-500")}
          >
            Blocks
          </button>
          <button
            type="button"
            onClick={() => switchCodeMode("text")}
            className={cn("px-3 py-1 rounded-lg", codeMode === "text" ? "bg-brand-600 text-white" : "text-slate-500")}
          >
            Raw code
          </button>
        </div>
        {codeMode === "text" && (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold">
            {looksLikeCpp(work.code || "") ? "Arduino C++ (.ino)" : "Arduino JS"}
          </span>
        )}
      </div>

      {codeMode === "blocks" ? (
        <>
          <BlocklyEditor state={sim.blocklyState} circuit={work.circuit || undefined} onChange={onBlocksChange} />
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-slate-500">Generated Arduino code</summary>
            <pre className="mt-1 rounded-xl bg-[#0b1220] text-slate-100 p-3 overflow-auto font-mono text-[11px]">{work.code}</pre>
          </details>
        </>
      ) : (
        <>
          <CodeEditor value={work.code || ""} onChange={(v) => edit({ code: v })} errorLine={errorLine} />
          {sketchProblems.map((q) => (
            <p key={`${q.line}${q.message}`} className="text-[11px] text-amber-600">
              Line {q.line}: {q.message}
            </p>
          ))}
        </>
      )}
    </div>
  ) : null;

  const view3dNode = has3d ? (
    <div className="space-y-2">
      <div className="relative">
        <Viewer3D
          parts={sim.parts3d}
          mechanism={work.mechanism}
          explode={explode}
          selectedId={selected}
          onSelect={setSelected}
          mechState={sim.mechState}
          links={sim.links}
          live={{ outputs: sim.liveOutputs, pressed: sim.pressed }}
          onPress={sim.press}
          world={sim.activeDrive ? { track: sim.activeDrive.track, pose: sim.activeDrive.pose } : undefined}
          follow={follow}
          joints={sim.activeRig ? { defs: work.joints, values: sim.activeRig.values } : undefined}
          wires={sim.wires3d}
          className={cn("w-full rounded-xl border border-slate-200 dark:border-slate-800", full ? "h-full min-h-[360px]" : compact ? "h-[360px]" : "h-[420px]")}
        />
        {sim.activeDrive && (
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            className={cn(
              "absolute right-2 top-2 z-10 rounded-lg px-2.5 py-1.5 text-xs font-bold",
              follow ? "bg-brand-600 text-white" : "bg-black/55 text-white hover:bg-black/75"
            )}
          >
            {follow ? "Following robot" : "Follow robot"}
          </button>
        )}
      </div>
      {sim.parts3d.some((p) => p.explode) && (
        <label className="flex items-center gap-2 text-xs font-semibold px-1">
          Explode
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(explode * 100)}
            onChange={(e) => setExplode(Number(e.target.value) / 100)}
            className="flex-1 accent-brand-600"
          />
        </label>
      )}
    </div>
  ) : null;

  const trackNode = sim.activeDrive ? (
    <div className="space-y-1.5">
      <TrackView
        drive={sim.activeDrive}
        running={running}
        className={cn("w-full rounded-xl border border-slate-200 dark:border-slate-800", full ? "h-full min-h-[320px]" : "h-[360px]")}
      />
      <p className="text-[11px] text-slate-500">Top-down robot arena: code reads sensors and drives both motors in real time.</p>
    </div>
  ) : null;

  const controlsNode = (
    <div className="space-y-3 p-2">
      {work.params.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Parameters</p>
          {work.params.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-xs">
              <span className="w-28 font-semibold">{p.label}</span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={p.value}
                onChange={(e) => edit({ params: work.params.map((x) => (x.key === p.key ? { ...x, value: Number(e.target.value) } : x)) })}
                className="flex-1 accent-brand-600"
              />
              <span className="font-mono w-20 text-right">
                {p.value} {p.unit}
              </span>
            </label>
          ))}
        </div>
      )}

      {work.mechanism && (
        <MechPanel mechanism={work.mechanism} onChange={(m) => edit({ mechanism: m })} onAnimate={sim.setMechState} />
      )}

      {work.tests.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Checks & tests</p>
            <Button size="sm" variant="outline" onClick={sim.runTests}>
              <FlaskConical className="h-3.5 w-3.5 mr-1" /> Run tests
            </Button>
          </div>
          {work.tests.map((t) => {
            const r = testResults.find((x) => x.id === t.id);
            return (
              <div
                key={t.id}
                className={cn(
                  "rounded-xl border p-2 text-xs",
                  r ? (r.pass ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5") : "border-slate-200 dark:border-slate-800"
                )}
              >
                <p className="font-semibold">
                  {r ? (r.pass ? "✅" : "❌") : "○"} {t.title}
                </p>
                {r && <p className="text-slate-600 dark:text-slate-400">{r.message}</p>}
              </div>
            );
          })}
        </div>
      )}

      {work.circuit && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Wiring diagnostics</p>
          {issues.length === 0 ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Wiring looks clean.
            </p>
          ) : (
            issues.slice(0, 6).map((i, idx) => (
              <div
                key={idx}
                className={cn(
                  "rounded-xl p-2 text-xs",
                  i.severity === "error" ? "bg-rose-500/10" : i.severity === "warning" ? "bg-amber-500/10" : "bg-slate-100 dark:bg-slate-900"
                )}
              >
                <p className="font-semibold">
                  {i.system} · {i.message}
                </p>
                {i.why && <p className="text-slate-600 dark:text-slate-400">{i.why}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderView = (k: LabView) => {
    switch (k) {
      case "circuit":
        return benchNode;
      case "code":
        return codeNode;
      case "3d":
        return view3dNode;
      case "track":
        return trackNode;
      case "controls":
        return controlsNode;
    }
  };

  const passedTests = testResults.filter((r) => r.pass).length;

  return (
    <div
      className={cn(
        "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col",
        full ? "h-full" : "rounded-2xl"
      )}
    >
      {/* Top interactive toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 px-3 py-2">
        {canRun && (
          !running ? (
            <Button size="sm" onClick={sim.runAll} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Play className="h-3.5 w-3.5 mr-1" /> Run
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={stopSim}>
              <Square className="h-3.5 w-3.5 mr-1" /> Stop
            </Button>
          )
        )}

        {work.circuit && work.tests.length > 0 && (
          <Button size="sm" variant="outline" onClick={sim.runTests}>
            <FlaskConical className="h-3.5 w-3.5 mr-1" />
            Tests{testResults.length ? ` ${passedTests}/${work.tests.length}` : ""}
          </Button>
        )}

        <Button size="sm" variant="ghost" onClick={resetLocal} title="Reset lab to initial setup">
          <RotateCw className="h-3.5 w-3.5 mr-1" /> Reset
        </Button>

        {running && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Running
          </span>
        )}

        {errorCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setSplit(false);
              setActiveView("controls");
            }}
            className="focus:outline-none"
          >
            <Badge variant="destructive" className="text-[10px] cursor-pointer">
              {errorCount} wiring error{errorCount === 1 ? "" : "s"}
            </Badge>
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setActiveView(v.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                primaryView === v.key
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
              )}
            >
              {v.icon}
              <span>{v.label}</span>
            </button>
          ))}
          {canSplit && !pureWireCircuit && (
            <button
              type="button"
              onClick={() => setSplit((s) => !s)}
              title={split ? "Single view" : "Split view"}
              className={cn(
                "hidden lg:inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold border border-slate-200 dark:border-slate-700",
                showSplit ? "bg-slate-100 dark:bg-slate-800" : "text-slate-500"
              )}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive stage area */}
      <div className={cn("p-3", full ? "flex-1 min-h-0 overflow-auto" : compact ? "max-h-[70vh] overflow-auto" : "")}>
        {showSplit && secondaryCandidate ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-stretch h-full">
            <div className="min-w-0">{renderView(primaryView)}</div>
            <div className="min-w-0 max-h-[68vh] overflow-y-auto rounded-xl border border-slate-200/80 dark:border-slate-800 p-2">
              {renderView(secondaryCandidate)}
            </div>
          </div>
        ) : pureWireCircuit && (work.params.length > 0 || work.tests.length > 0 || issues.length > 0) && primaryView === "circuit" ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.75fr)] items-start">
            <div className="min-w-0">{benchNode}</div>
            <div className="min-w-0 rounded-xl border border-slate-200/80 dark:border-slate-800 p-2">
              {controlsNode}
            </div>
          </div>
        ) : (
          <div className="min-w-0">{renderView(primaryView)}</div>
        )}
      </div>
    </div>
  );
}
