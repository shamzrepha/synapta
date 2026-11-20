"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, History, Sparkles, X } from "lucide-react";
import { MathDisplay } from "@/components/calculator/math-display";
import { KEYS, type KeyAction, type KeyDef, type Tone } from "@/components/calculator/keys";
import "@/components/calculator/calculator.css";
import { actionForKey, applyAction, prepareAfterResult, type Action } from "@/lib/calculator/actions";
import { evaluateRow, hasExactForm, resultLatex, resultText, type Num } from "@/lib/calculator/eval";
import { rowFromText } from "@/lib/calculator/from-text";
import { toLatex } from "@/lib/calculator/latex";
import { atEnd, cloneState, emptyState, toPlainText, type EditorState, type Row } from "@/lib/calculator/model";
import { CALC_EVENT, type CalcEventDetail } from "@/lib/pet/calc-intent";
import { cn } from "@/lib/utils";

interface HistoryEntry { root: Row; value: Num }
type Shown = { kind: "value"; value: Num } | { kind: "error"; message: string } | null;

const ASK_EVENT = "sunroot:ask-ai";
const NAV = new Set(["left", "right", "up", "down", "del", "close"]);

const TONE: Record<Tone, string> = {
  digit: "bg-slate-100 text-foreground hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-lg font-semibold",
  op: "bg-brand-100 text-brand-800 hover:bg-brand-200 dark:bg-brand-900/60 dark:text-brand-200 dark:hover:bg-brand-800/70 text-xl font-semibold",
  fn: "bg-slate-200/70 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-200 dark:hover:bg-slate-700 text-sm font-medium",
  eq: "bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 text-xl font-bold",
  danger: "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/60 text-sm font-semibold",
  mode: "border border-border bg-transparent text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold",
};

export function OverlayCalculator() {
  const [open, setOpen] = useState(false);
  const [ed, setEd] = useState<EditorState>(emptyState);
  const [shown, setShown] = useState<Shown>(null);
  const [justEval, setJustEval] = useState(false);
  const [shift, setShift] = useState(false);
  const [radians, setRadians] = useState(false);
  const [exact, setExact] = useState(true);
  const [ans, setAns] = useState<Num | null>(null);
  const [mem, setMem] = useState<Num | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const evaluate = useCallback(
    (root: Row): Num | null => {
      const out = evaluateRow(root, { radians, ans, mem });
      if (out.kind === "empty") { setShown(null); return null; }
      if (out.kind === "error") { setShown({ kind: "error", message: out.message }); setJustEval(false); return null; }
      setShown({ kind: "value", value: out.value });
      setAns(out.value);
      setJustEval(true);
      setHistory((h) => [{ root: cloneState({ root, caret: { path: [], idx: 0 } }).root, value: out.value }, ...h].slice(0, 30));
      return out.value;
    },
    [radians, ans, mem]
  );

  const press = (a: KeyAction): void => {
    {
      if (a.k === "ui") {
        switch (a.v) {
          case "shift": setShift((s) => !s); return;
          case "deg": setRadians((r) => !r); return;
          case "mode": setExact((x) => !x); return;
          case "eval": evaluate(ed.root); return;
          case "ans": press({ k: "const", v: "ans" }); return;
          case "mr": press({ k: "const", v: "mem" }); return;
          case "mc": setMem(null); setShift(false); return;
          case "mplus":
          case "mminus": {
            const sign = a.v === "mplus" ? 1 : -1;
            const cur = shown && shown.kind === "value" && justEval ? shown.value : null;
            const out = cur ? { kind: "value" as const, value: cur } : evaluateRow(ed.root, { radians, ans, mem });
            if (out.kind === "value") {
              const base = mem ?? { v: 0, ex: null };
              const sumRow = evaluateRow(
                [{ t: "const", v: "mem" }, { t: "ch", v: sign > 0 ? "+" : "-" }, { t: "const", v: "ans" }],
                { radians, ans: out.value, mem: base }
              );
              if (sumRow.kind === "value") setMem(sumRow.value);
            } else if (out.kind === "error") setShown({ kind: "error", message: out.message });
            setShift(false);
            return;
          }
        }
        return;
      }
      const act: Action = a;
      setShift(false);
      let st = ed;
      if (justEval && !NAV.has(act.k)) st = prepareAfterResult(ed, act);
      if (!NAV.has(act.k) || act.k === "clear") { setShown(null); setJustEval(false); }
      else if (act.k !== "close") setJustEval(false);
      setEd(applyAction(st, act));
    }
  };

  useEffect(() => {
    const onCalcEvent = (ev: Event) => {
      const detail = ((ev as CustomEvent<CalcEventDetail>).detail || {}) as CalcEventDetail;
      setOpen(detail.toggle ? (p) => !p : (detail.open ?? true));
      if (detail.label) setContextLabel(detail.label);
      if (typeof detail.expr === "string" && detail.expr.trim()) {
        const row = rowFromText(detail.expr);
        if (row) {
          setEd(atEnd({ root: row, caret: { path: [], idx: 0 } }));
          evaluate(row);
        } else {
          setEd(emptyState());
          setShown({ kind: "error", message: "Syntax error" });
        }
      }
    };
    window.addEventListener(CALC_EVENT, onCalcEvent);
    return () => window.removeEventListener(CALC_EVENT, onCalcEvent);
  }, [evaluate]);

  useEffect(() => {
    if (open) boxRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    try {
      boxRef.current?.querySelector(".calc-caret")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch { /* older browsers */ }
  }, [ed]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key === "Enter" || e.key === "=") { e.preventDefault(); evaluate(ed.root); return; }
    const a = actionForKey(e.key);
    if (a) { e.preventDefault(); press(a); }
  };

  const askSprout = () => {
    const cur = toPlainText(ed.root);
    const got = shown && shown.kind === "value" ? ` (got ${resultText(shown.value, false)})` : "";
    const question = cur
      ? `Sprout, explain how to solve or check this calculation step by step: ${cur}${got}`
      : "Sprout, can you help me pick the right formula to calculate this problem?";
    window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question } }));
  };

  const keyView = (k: KeyDef) => {
    const useShift = shift && k.shift;
    const label = useShift ? k.shift!.label : k.label === "DEG" && radians ? "RAD" : k.label;
    const aria = useShift ? k.shift!.aria : k.label === "DEG" ? `angle mode ${radians ? "radians" : "degrees"}` : k.aria;
    const action = useShift ? k.shift!.action : k.action;
    const active = (k.label === "2nd" && shift) || (k.label === "S⇔D" && !exact);
    return (
      <button
        key={k.label}
        type="button"
        aria-label={aria}
        aria-pressed={k.label === "2nd" ? shift : undefined}
        onClick={() => { press(action); boxRef.current?.focus({ preventScroll: true }); }}
        className={cn(
          "relative flex h-12 min-w-0 items-center justify-center rounded-lg px-0.5 transition-colors active:brightness-95",
          TONE[k.tone],
          k.span === 2 && "col-span-2",
          active && "!border-brand-500 !bg-brand-600 !text-white",
          useShift && "ring-1 ring-brand-500/60"
        )}
      >
        {!useShift && k.shift && <span aria-hidden className="absolute right-1 top-0.5 text-[9px] font-medium leading-none text-brand-600 dark:text-brand-300">{k.shift.label}</span>}
        <span aria-hidden>{label}</span>
      </button>
    );
  };

  const exprLatex = toLatex(ed.root, ed.caret);
  const canToggle = shown?.kind === "value" && hasExactForm(shown.value);

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Sprout calculator"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="fixed inset-x-0 bottom-0 z-[80] max-h-[100dvh] overflow-y-auto rounded-t-2xl border border-border bg-card text-foreground shadow-elevated outline-none pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[360px] sm:rounded-2xl"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <Calculator className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
          <p className="truncate text-sm font-semibold">{contextLabel || "Calculator"}</p>
          {mem && <span className="rounded bg-brand-100 px-1.5 text-[10px] font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200" aria-label="Memory in use">M</span>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="History" aria-pressed={showHistory} onClick={() => setShowHistory((s) => !s)} className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800", showHistory && "bg-slate-100 dark:bg-slate-800")}>
            <History className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Close calculator" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="px-3 pt-2">
        <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900/70">
          <div className="min-h-[3.25rem] overflow-x-auto overflow-y-hidden text-xl" aria-live="off">
            <MathDisplay latex={exprLatex} label={`Expression ${toPlainText(ed.root) || "empty"}`} className="ml-auto block w-max" />
          </div>
          <div className="mt-1 flex min-h-[2.5rem] items-end justify-between gap-2">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{radians ? "rad" : "deg"}{canToggle ? (exact ? " · exact" : " · decimal") : ""}</span>
            <div className="min-w-0 overflow-x-auto text-right text-2xl font-semibold" aria-live="polite">
              {shown?.kind === "error" ? (
                <span className="text-base text-rose-600 dark:text-rose-400">{shown.message}</span>
              ) : shown?.kind === "value" ? (
                <MathDisplay latex={`= ${resultLatex(shown.value, exact)}`} label={`Result ${resultText(shown.value, exact)}`} className="block w-max ml-auto text-brand-700 dark:text-brand-200" />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showHistory ? (
        <div className="px-3 pt-2">
          <div className="flex items-center justify-between pb-1 text-xs text-muted-foreground">
            <span>History, tap to reuse</span>
            {history.length > 0 && <button type="button" onClick={() => setHistory([])} className="rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800">Clear</button>}
          </div>
          <ul className="max-h-[21rem] min-h-[10rem] space-y-1 overflow-y-auto">
            {history.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nothing calculated yet.</li>}
            {history.map((h, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-label={`Reuse ${toPlainText(h.root)}`}
                  onClick={() => { setEd(atEnd({ root: h.root, caret: { path: [], idx: 0 } })); setShown({ kind: "value", value: h.value }); setJustEval(true); setShowHistory(false); }}
                  className="flex min-h-12 w-full items-center justify-between gap-3 overflow-x-auto rounded-lg bg-slate-100 px-3 py-1.5 text-left hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-800"
                >
                  <MathDisplay latex={toLatex(h.root)} className="text-sm text-muted-foreground" />
                  <MathDisplay latex={`= ${resultLatex(h.value, exact)}`} className="shrink-0 font-semibold text-brand-700 dark:text-brand-200" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-1.5 px-3 pt-2.5" onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
          {KEYS.map(keyView)}
        </div>
      )}

      <div className="px-3 pt-2">
        <button type="button" onClick={askSprout} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-900/30">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Ask Sprout to explain this step
        </button>
      </div>
    </div>
  );
}
