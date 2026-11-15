"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, X, Minus, Maximize2, Delete, Sparkles, LineChart, RotateCcw } from "lucide-react";
import { evaluate } from "@/lib/studio/expr";
import { sampleFunction } from "@/lib/teach/math";
import { CALC_EVENT, type CalcEventDetail } from "@/lib/pet/calc-intent";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  expr: string;
  result: string;
  numeric: number;
}

const ASK_EVENT = "sunroot:ask-ai";

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  if (Math.abs(n) < 1e-12) return "0";
  if (Math.abs(n) >= 1e10 || (Math.abs(n) > 0 && Math.abs(n) < 1e-6)) {
    return n.toExponential(6).replace(/\.?0+e/, "e");
  }
  return Number(n.toPrecision(12)).toString();
}

export function OverlayCalculator() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expr, setExpr] = useState("");
  const [resultText, setResultText] = useState<string>("0");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [ans, setAns] = useState<number>(0);
  const [radians, setRadians] = useState<boolean>(false);
  const [showGraph, setShowGraph] = useState<boolean>(false);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const runEval = useCallback(
    (raw: string, record = true) => {
      const target = raw.trim();
      if (!target) {
        setResultText("0");
        setErrorText(null);
        return;
      }
      if (/\bx\b/i.test(target)) {
        setShowGraph(true);
        setErrorText(null);
        setResultText("f(x) plotted");
        return;
      }
      const val = evaluate(target, { ans, Ans: ans, ANS: ans }, { radians });
      if (!Number.isFinite(val)) {
        setErrorText("Check syntax or domain");
        return;
      }
      const formatted = formatNumber(val);
      setErrorText(null);
      setResultText(formatted);
      setAns(val);
      if (record) {
        setHistory((prev) => [{ expr: target, result: formatted, numeric: val }, ...prev.slice(0, 14)]);
      }
    },
    [ans, radians]
  );

  useEffect(() => {
    const onCalcEvent = (ev: Event) => {
      const detail = ((ev as CustomEvent<CalcEventDetail>).detail || {}) as CalcEventDetail;
      if (detail.toggle) {
        setOpen((prev) => !prev);
        setMinimized(false);
      } else {
        setOpen(detail.open ?? true);
        setMinimized(false);
      }
      if (detail.label) setContextLabel(detail.label);
      if (typeof detail.expr === "string" && detail.expr.trim()) {
        const nextExpr = detail.expr.trim();
        setExpr(nextExpr);
        setTimeout(() => runEval(nextExpr, true), 0);
      }
    };
    window.addEventListener(CALC_EVENT, onCalcEvent);
    return () => window.removeEventListener(CALC_EVENT, onCalcEvent);
  }, [runEval]);

  useEffect(() => {
    if (open && !minimized) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [open, minimized]);

  // Drag handler (header pointer down) with viewport clamping
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
    const onMove = (mv: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = mv.clientX - dragRef.current.startX;
      const dy = mv.clientY - dragRef.current.startY;
      const maxLeft = -(window.innerWidth - 260);
      const maxUp = -(window.innerHeight - 240);
      setOffset({
        x: Math.max(maxLeft, Math.min(24, dragRef.current.origX + dx)),
        y: Math.max(maxUp, Math.min(24, dragRef.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Live SVG curve when expression contains x or graph toggle is active
  const graphData = useMemo(() => {
    if (!showGraph) return null;
    const candidate = expr.trim() || "sin(x)";
    const pts = sampleFunction(candidate, { ans }, -10, 10, 80);
    const valid = pts.filter((p): p is { x: number; y: number } => p.y !== null && Number.isFinite(p.y));
    if (valid.length < 2) return null;
    const ys = valid.map((p) => p.y);
    let yMin = Math.min(...ys, -1);
    let yMax = Math.max(...ys, 1);
    if (yMax - yMin < 1e-6) {
      yMin -= 1;
      yMax += 1;
    }
    const W = 280;
    const H = 96;
    const mapX = (x: number) => ((x + 10) / 20) * W;
    const mapY = (y: number) => H - ((y - yMin) / (yMax - yMin)) * H;

    let path = "";
    let penDown = false;
    for (const p of pts) {
      if (p.y === null || !Number.isFinite(p.y)) {
        penDown = false;
        continue;
      }
      const cx = mapX(p.x).toFixed(1);
      const cy = Math.max(-10, Math.min(H + 10, mapY(p.y))).toFixed(1);
      path += `${penDown ? "L" : "M"}${cx},${cy}`;
      penDown = true;
    }
    const zeroX = mapX(0);
    const zeroY = mapY(0);
    return { path, zeroX, zeroY, yMin, yMax, exprUsed: candidate };
  }, [showGraph, expr, ans]);

  if (!open) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-20 right-4 z-[80] max-w-[calc(100vw-2rem)]">
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-slate-950/95 px-3.5 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur-md">
          <Calculator className="h-4 w-4 text-emerald-400 shrink-0" />
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex items-center gap-2 hover:text-emerald-300 transition"
          >
            <span>Sprout Calc</span>
            <span className="font-mono text-emerald-300">= {resultText}</span>
            <Maximize2 className="h-3.5 w-3.5 opacity-75" />
          </button>
          <button
            type="button"
            aria-label="Close calculator"
            onClick={() => setOpen(false)}
            className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const appendToken = (tok: string) => {
    setErrorText(null);
    setExpr((prev) => `${prev}${tok}`);
    inputRef.current?.focus();
  };

  const askSproutAboutCalc = () => {
    const current = expr.trim();
    const prompt = current
      ? `Sprout, explain how to solve or check this calculation step by step: ${current}${resultText !== "Error" && !/\bx\b/i.test(current) ? ` (got ${resultText})` : ""}`
      : "Sprout, can you help me pick the right formula to calculate this problem?";
    window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question: prompt } }));
  };

  const keys: Array<{ label: string; token?: string; action?: () => void; tone?: "op" | "eq" | "fn" | "danger" }> = [
    { label: "sin", token: "sin(", tone: "fn" },
    { label: "cos", token: "cos(", tone: "fn" },
    { label: "tan", token: "tan(", tone: "fn" },
    { label: "√", token: "sqrt(", tone: "fn" },
    { label: "log", token: "log10(", tone: "fn" },

    { label: "ln", token: "ln(", tone: "fn" },
    { label: "π", token: "pi", tone: "fn" },
    { label: "e", token: "e", tone: "fn" },
    { label: "^", token: "^", tone: "op" },
    { label: "Ans", token: "ans", tone: "fn" },

    { label: "(", token: "(", tone: "fn" },
    { label: ")", token: ")", tone: "fn" },
    { label: "C", action: () => { setExpr(""); setResultText("0"); setErrorText(null); }, tone: "danger" },
    { label: "⌫", action: () => setExpr((p) => p.slice(0, -1)), tone: "danger" },
    { label: "÷", token: "/", tone: "op" },

    { label: "7", token: "7" },
    { label: "8", token: "8" },
    { label: "9", token: "9" },
    { label: "x", token: "x", tone: "fn" },
    { label: "×", token: "*", tone: "op" },

    { label: "4", token: "4" },
    { label: "5", token: "5" },
    { label: "6", token: "6" },
    { label: "abs", token: "abs(", tone: "fn" },
    { label: "−", token: "-", tone: "op" },

    { label: "1", token: "1" },
    { label: "2", token: "2" },
    { label: "3", token: "3" },
    { label: ".", token: "." },
    { label: "+", token: "+", tone: "op" },

    { label: "0", token: "0" },
    { label: "00", token: "00" },
    { label: "%", token: "/100", tone: "fn" },
    { label: "=", action: () => runEval(expr, true), tone: "eq" },
  ];

  return (
    <div
      role="dialog"
      aria-label="Sprout Overlay Calculator"
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      className="fixed bottom-4 right-4 z-[80] w-[336px] max-w-[calc(100vw-1rem)] max-h-[85dvh] overflow-y-auto rounded-2xl border border-emerald-500/35 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur-xl"
    >
      {/* Draggable Sprout Header */}
      <div
        onPointerDown={onDragStart}
        className="flex items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 px-3.5 py-2.5 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 shrink-0">
            <Calculator className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white leading-tight truncate">Sprout Calculator</p>
            <p className="text-[10px] text-emerald-300/80 truncate">
              {contextLabel || "Scientific · Graph · Tutor Linked"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setRadians((r) => !r)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-bold border transition",
              radians
                ? "border-amber-400/50 bg-amber-500/15 text-amber-300"
                : "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
            )}
            title="Toggle Degrees / Radians"
          >
            {radians ? "RAD" : "DEG"}
          </button>
          <button
            type="button"
            onClick={() => setShowGraph((g) => !g)}
            className={cn(
              "rounded-md p-1 transition",
              showGraph ? "bg-sky-500/25 text-sky-300" : "text-slate-400 hover:bg-white/10 hover:text-white"
            )}
            title="Toggle 2D f(x) mini-graph"
          >
            <LineChart className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Minimize calculator"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close calculator"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Display + Direct Formula Input */}
        <div className="rounded-xl border border-white/10 bg-slate-900/90 p-2.5 space-y-1">
          <input
            ref={inputRef}
            type="text"
            value={expr}
            onChange={(e) => {
              setExpr(e.target.value);
              setErrorText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runEval(expr, true);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Type e.g. 9.8 * sin(30) + x^2"
            className="w-full bg-transparent text-right font-mono text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none"
          />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-mono text-slate-500">Ans {formatNumber(ans)}</span>
            <p className={cn("font-mono text-xl font-bold truncate", errorText ? "text-rose-400 text-xs" : "text-emerald-300")}>
              {errorText || `= ${resultText}`}
            </p>
          </div>
        </div>

        {/* Mini Graph Preview */}
        {showGraph && (
          <div className="rounded-xl border border-sky-500/30 bg-slate-900/80 p-2 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-sky-300 font-mono">
              <span>y = {graphData?.exprUsed || "sin(x)"}</span>
              <span>x ∈ [-10, 10]</span>
            </div>
            {graphData ? (
              <svg viewBox="0 0 280 96" className="w-full h-24 rounded-lg bg-slate-950/80 border border-white/5">
                {graphData.zeroX >= 0 && graphData.zeroX <= 280 && (
                  <line x1={graphData.zeroX} y1={0} x2={graphData.zeroX} y2={96} stroke="#334155" strokeWidth="1" />
                )}
                {graphData.zeroY >= 0 && graphData.zeroY <= 96 && (
                  <line x1={0} y1={graphData.zeroY} x2={280} y2={graphData.zeroY} stroke="#334155" strokeWidth="1" />
                )}
                <path d={graphData.path} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <p className="text-[11px] text-slate-400 py-3 text-center">Enter an expression in `x` (e.g. `x^2 - 4`) to graph.</p>
            )}
          </div>
        )}

        {/* Scientific Keypad */}
        <div className="grid grid-cols-5 gap-1.5">
          {keys.map((k, idx) => (
            <button
              key={`${k.label}-${idx}`}
              type="button"
              onClick={() => (k.action ? k.action() : k.token && appendToken(k.token))}
              className={cn(
                "h-9 rounded-lg text-xs font-semibold transition active:scale-95 flex items-center justify-center",
                k.label === "=" && "col-span-2",
                k.tone === "eq" && "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/20",
                k.tone === "op" && "bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-white/10",
                k.tone === "fn" && "bg-slate-900 hover:bg-slate-800 text-sky-300 border border-white/10 text-[11px]",
                k.tone === "danger" && "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25",
                !k.tone && "bg-slate-800/75 hover:bg-slate-700 text-white border border-white/5"
              )}
            >
              {k.label === "⌫" ? <Delete className="h-3.5 w-3.5" /> : k.label}
            </button>
          ))}
        </div>

        {/* History Tape */}
        {history.length > 0 && (
          <div className="max-h-20 overflow-y-auto rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Tape</span>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="inline-flex items-center gap-1 hover:text-white"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Clear
              </button>
            </div>
            {history.slice(0, 4).map((h, i) => (
              <button
                key={`${h.expr}-${i}`}
                type="button"
                onClick={() => {
                  setExpr(h.expr);
                  setResultText(h.result);
                  setAns(h.numeric);
                }}
                className="w-full flex items-center justify-between text-[11px] font-mono text-left hover:bg-white/5 rounded px-1 py-0.5"
              >
                <span className="text-slate-400 truncate pr-2">{h.expr}</span>
                <span className="text-emerald-300 font-semibold shrink-0">= {h.result}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sprout Tutor Link Footer */}
        <button
          type="button"
          onClick={askSproutAboutCalc}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 py-1.5 text-xs font-semibold text-emerald-200 transition"
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
          Ask Sprout to explain this step
        </button>
      </div>
    </div>
  );
}
