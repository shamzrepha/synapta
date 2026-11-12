"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

const StageVariantCtx = createContext<"card" | "textbook">("card");
import { motion, useReducedMotion } from "framer-motion";
import { Play, Pause, RotateCcw, Sparkles, StepForward, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluate } from "@/lib/studio/expr";
import { usePrefs } from "@/components/settings/use-prefs";
import { useBot } from "@/components/bot/bot-provider";
import {
  gcd,
  type ConceptFlowScene,
  type EquationStepsScene,
  type FormulaBreakdownScene,
  type FractionSlashScene,
  type KidCounterScene,
  type KineticScene,
} from "@/lib/study/kinetic-parser";

interface StageCommonProps {
  pageKey: string | number;
  reduceMotion: boolean;
  autoPlay: boolean;
}

const ACCENT_CYCLE = [
  "text-teal-600 dark:text-teal-300 border-teal-500/40 bg-teal-500/10",
  "text-amber-600 dark:text-amber-300 border-amber-500/40 bg-amber-500/10",
  "text-sky-600 dark:text-sky-300 border-sky-500/40 bg-sky-500/10",
  "text-rose-600 dark:text-rose-300 border-rose-500/40 bg-rose-500/10",
  "text-emerald-600 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  "text-violet-600 dark:text-violet-300 border-violet-500/40 bg-violet-500/10",
];

function StageShell({
  badge,
  title,
  controls,
  children,
}: {
  badge: string;
  title?: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const variant = useContext(StageVariantCtx);
  if (variant === "textbook") {
    return (
      <figure className="my-4 rounded-xl border border-border/50 border-l-[3px] border-l-brand-500/60 bg-brand-500/[0.028] dark:bg-brand-400/[0.04]">
        <div className="p-3.5 sm:p-4">{children}</div>
        <figcaption className="flex flex-wrap items-center justify-between gap-2 px-3.5 sm:px-4 py-2 border-t border-border/40 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3 text-brand-600 dark:text-brand-300 shrink-0" />
            <span className="font-semibold text-foreground/85">Interactive Figure</span>
            <span>· {badge}</span>
            {title && <span className="italic text-muted-foreground truncate max-w-[16rem] sm:max-w-xs">— {title}</span>}
          </span>
          {controls && <div className="flex items-center gap-1.5">{controls}</div>}
        </figcaption>
      </figure>
    );
  }
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-[#fbfaf6] dark:bg-[#0d1421] shadow-sm"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.16) 1px, transparent 0)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800/90 bg-white/75 dark:bg-slate-950/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-600/10 dark:bg-teal-400/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            <Sparkles className="h-3 w-3" /> {badge}
          </span>
          {title && (
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {title}
            </span>
          )}
        </div>
        {controls && <div className="flex items-center gap-1.5">{controls}</div>}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  );
}

/**
 * TikTok / Manim style procedural fraction cancellation animator:
 * draws the fraction bar, spotlights the shared divisor, slashes numerator
 * and denominator diagonally in sequence, pops the simplified fraction, and
 * morphs an equivalent segmented strip below.
 */
function FractionSlashStage({
  scene,
  reduceMotion,
  autoPlay,
}: StageCommonProps & { scene: FractionSlashScene }) {
  const uid = useId();
  const [num, setNum] = useState(scene.num);
  const [den, setDen] = useState(scene.den);
  const [slow, setSlow] = useState(false);

  // Beats: 1=num+bar, 2=den+strip, 3=factor badge, 4=slash num, 5=slash den, 6=reduced result
  const [rawBeat, setRawBeat] = useState(() => (reduceMotion || !autoPlay ? 6 : 1));
  const [rawPlaying, setRawPlaying] = useState(() => !reduceMotion && autoPlay);
  const timerRef = useRef<number | null>(null);

  const beat = reduceMotion ? 6 : rawBeat;
  const playing = !reduceMotion && rawPlaying && beat < 6;

  useEffect(() => {
    if (!playing) return;
    const ms = slow ? 1050 : 620;
    timerRef.current = window.setTimeout(() => {
      setRawBeat((b) => Math.min(6, b + 1));
    }, ms);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [playing, beat, slow]);

  const g = useMemo(() => gcd(num, den), [num, den]);
  const rNum = num / g;
  const rDen = den / g;
  const reducible = g > 1 && num !== den;

  const replay = (nextNum = num, nextDen = den) => {
    setNum(nextNum);
    setDen(nextDen);
    if (reduceMotion) {
      setRawBeat(6);
      setRawPlaying(false);
      return;
    }
    setRawBeat(1);
    setRawPlaying(true);
  };

  const stepForward = () => {
    setRawPlaying(false);
    setRawBeat((b) => (b >= 6 ? 1 : b + 1));
  };

  const visualDen = Math.min(16, Math.max(1, den));
  const visualNum = Math.min(visualDen, num);
  const reducedVisualDen = Math.min(16, Math.max(1, rDen));
  const reducedVisualNum = Math.min(reducedVisualDen, rNum);

  return (
    <StageShell
      badge="Live Math Motion"
      title={scene.title || (reducible ? `Simplifying ${num}/${den}` : `Fraction ${num}/${den}`)}
      controls={
        <>
          <button
            type="button"
            onClick={() => setSlow((s) => !s)}
            className={cn(
              "h-7 px-2 rounded-lg text-[11px] font-semibold border flex items-center gap-1 transition-colors",
              slow
                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
            )}
            title="Toggle slow motion"
          >
            <Gauge className="h-3 w-3" /> {slow ? "0.5×" : "1×"}
          </button>
          <button
            type="button"
            onClick={stepForward}
            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
            title="Next step"
          >
            <StepForward className="h-3 w-3" /> Step
          </button>
          <button
            type="button"
            onClick={() => {
              if (playing) setRawPlaying(false);
              else if (beat >= 6) replay();
              else setRawPlaying(true);
            }}
            className="h-7 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1"
          >
            {playing ? <Pause className="h-3 w-3" /> : beat >= 6 ? <RotateCcw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing ? "Pause" : beat >= 6 ? "Replay" : "Play"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center">
          <svg
            key={`${uid}-${num}-${den}-${beat === 1 ? "r" : "s"}`}
            viewBox="0 0 420 155"
            className="w-full max-w-[430px] overflow-visible select-none"
            role="img"
            aria-label={
              reducible
                ? `Animated fraction simplification: ${num} over ${den} equals ${rNum} over ${rDen}`
                : `Fraction ${num} over ${den}`
            }
          >
            {/* Beat 3: Shared Factor Pill above */}
            {reducible && beat >= 3 && (
              <motion.g
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32 }}
              >
                <rect
                  x="76"
                  y="4"
                  width="124"
                  height="24"
                  rx="12"
                  className="fill-amber-500/15 stroke-amber-500/60"
                  strokeWidth="1.2"
                />
                <text
                  x="138"
                  y="20"
                  textAnchor="middle"
                  className="fill-amber-700 dark:fill-amber-300 text-[12px] font-bold"
                >
                  Divide both ÷ {g}
                </text>
              </motion.g>
            )}

            {/* Original Numerator */}
            <motion.text
              x="110"
              y="68"
              textAnchor="middle"
              initial={reduceMotion ? false : { opacity: 0, y: 54 }}
              animate={{
                opacity: beat >= 1 ? (reducible && beat >= 4 ? 0.35 : 1) : 0,
                y: 68,
              }}
              transition={{ duration: 0.28 }}
              className="fill-slate-900 dark:fill-white text-[34px] font-extrabold font-mono"
            >
              {num}
            </motion.text>

            {/* Vinculum / Horizontal fraction bar */}
            <motion.path
              d="M 74 82 L 152 82"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-teal-600 dark:stroke-teal-400"
              initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: beat >= 1 ? 1 : 0, opacity: beat >= 1 ? 1 : 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />

            {/* Original Denominator */}
            <motion.text
              x="110"
              y="122"
              textAnchor="middle"
              initial={reduceMotion ? false : { opacity: 0, y: 132 }}
              animate={{
                opacity: beat >= 2 ? (reducible && beat >= 5 ? 0.35 : 1) : 0,
                y: 122,
              }}
              transition={{ duration: 0.28 }}
              className="fill-slate-900 dark:fill-white text-[34px] font-extrabold font-mono"
            >
              {den}
            </motion.text>

            {/* Beat 4: First Diagonal Slash across Numerator */}
            {reducible && beat >= 4 && (
              <g>
                <motion.line
                  x1="88"
                  y1="72"
                  x2="132"
                  y2="36"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                  className="stroke-rose-500"
                  initial={reduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.32, ease: "easeInOut" }}
                />
                <motion.text
                  x="154"
                  y="56"
                  textAnchor="start"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.2, duration: 0.26 }}
                  className="fill-rose-600 dark:fill-rose-400 text-[24px] font-black font-mono"
                >
                  {rNum}
                </motion.text>
              </g>
            )}

            {/* Beat 5: Second Diagonal Slash across Denominator */}
            {reducible && beat >= 5 && (
              <g>
                <motion.line
                  x1="88"
                  y1="126"
                  x2="132"
                  y2="92"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                  className="stroke-rose-500"
                  initial={reduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.32, ease: "easeInOut" }}
                />
                <motion.text
                  x="154"
                  y="124"
                  textAnchor="start"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.2, duration: 0.26 }}
                  className="fill-rose-600 dark:fill-rose-400 text-[24px] font-black font-mono"
                >
                  {rDen}
                </motion.text>
              </g>
            )}

            {/* Beat 6: Equals Arrow + Final Crisp Reduced Fraction */}
            {beat >= 6 && (
              <motion.g
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <text
                  x="218"
                  y="92"
                  textAnchor="middle"
                  className="fill-teal-600 dark:fill-teal-400 text-[30px] font-bold"
                >
                  =
                </text>
                <rect
                  x="256"
                  y="28"
                  width="116"
                  height="108"
                  rx="18"
                  className="fill-teal-500/10 stroke-teal-500/45"
                  strokeWidth="1.8"
                />
                <text
                  x="314"
                  y="70"
                  textAnchor="middle"
                  className="fill-teal-700 dark:fill-teal-300 text-[34px] font-black font-mono"
                >
                  {reducible ? rNum : num}
                </text>
                <line
                  x1="286"
                  y1="82"
                  x2="342"
                  y2="82"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="stroke-teal-600 dark:stroke-teal-400"
                />
                <text
                  x="314"
                  y="118"
                  textAnchor="middle"
                  className="fill-teal-700 dark:fill-teal-300 text-[34px] font-black font-mono"
                >
                  {reducible ? rDen : den}
                </text>
              </motion.g>
            )}
          </svg>

          {/* Morphing Equivalent Visual Strip */}
          <div className="w-full max-w-md space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>
                {beat >= 6 && reducible
                  ? `Same amount! ${num}/${den} equals ${rNum}/${rDen}`
                  : `${num} shaded out of ${den} equal slices`}
              </span>
              <span className="font-mono text-teal-700 dark:text-teal-300">
                {Math.round((num / den) * 100)}%
              </span>
            </div>
            <div
              className="grid gap-1 h-7"
              style={{
                gridTemplateColumns: `repeat(${beat >= 6 && reducible ? reducedVisualDen : visualDen}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({
                length: beat >= 6 && reducible ? reducedVisualDen : visualDen,
              }).map((_, idx) => {
                const filled =
                  idx < (beat >= 6 && reducible ? reducedVisualNum : visualNum);
                return (
                  <motion.div
                    key={idx}
                    layout={!reduceMotion}
                    transition={{ type: "spring", stiffness: 280, damping: 24 }}
                    className={cn(
                      "rounded-md border transition-colors",
                      filled
                        ? "bg-teal-500/80 dark:bg-teal-400/75 border-teal-600/60"
                        : "bg-slate-200/70 dark:bg-slate-800/80 border-slate-300/80 dark:border-slate-700",
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Interactive Lab Controls for Young Kids & Curious Minds */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/70 dark:border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Try:</span>
            {[
              [2, 4],
              [6, 8],
              [3, 9],
              [4, 12],
            ].map(([n, d]) => (
              <button
                key={`${n}/${d}`}
                type="button"
                onClick={() => replay(n, d)}
                className={cn(
                  "px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border transition-colors",
                  num === n && den === d
                    ? "border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
              >
                {n}/{d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              Top:
              <button
                type="button"
                aria-label="Decrease numerator"
                onClick={() => replay(Math.max(1, num - 1), den)}
                className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 font-bold"
              >
                -
              </button>
              <span className="w-5 text-center font-bold">{num}</span>
              <button
                type="button"
                aria-label="Increase numerator"
                onClick={() => replay(Math.min(den * 2, num + 1), den)}
                className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 font-bold"
              >
                +
              </button>
            </label>
            <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              Bottom:
              <button
                type="button"
                aria-label="Decrease denominator"
                onClick={() => replay(Math.min(num, Math.max(2, den - 1)), Math.max(2, den - 1))}
                className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 font-bold"
              >
                -
              </button>
              <span className="w-5 text-center font-bold">{den}</span>
              <button
                type="button"
                aria-label="Increase denominator"
                onClick={() => replay(num, Math.min(24, den + 1))}
                className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 font-bold"
              >
                +
              </button>
            </label>
          </div>
        </div>

        {scene.caption && (
          <p className="text-center text-xs text-slate-600 dark:text-slate-400">
            {scene.caption}
          </p>
        )}
      </div>
    </StageShell>
  );
}

/** Step-by-step animated equation derivation with optional term cancellation slashes. */
function EquationStepsStage({
  scene,
  reduceMotion,
  autoPlay,
}: StageCommonProps & { scene: EquationStepsScene }) {
  const [rawVisible, setRawVisible] = useState(() =>
    reduceMotion || !autoPlay ? scene.steps.length : 1,
  );
  const [rawPlaying, setRawPlaying] = useState(() => !reduceMotion && autoPlay);
  const visibleCount = reduceMotion ? scene.steps.length : rawVisible;
  const playing = !reduceMotion && rawPlaying && visibleCount < scene.steps.length;

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      setRawVisible((c) => Math.min(scene.steps.length, c + 1));
    }, 850);
    return () => window.clearTimeout(id);
  }, [playing, visibleCount, scene.steps.length]);

  const replay = () => {
    if (reduceMotion) {
      setRawVisible(scene.steps.length);
      return;
    }
    setRawVisible(1);
    setRawPlaying(true);
  };

  // Sprout hops to the term being crossed out and scribbles over it as the line draws
  const bot = useBot();
  const botRef = useRef(bot);
  useEffect(() => {
    botRef.current = bot;
  });
  const stageEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduceMotion) return;
    const el = stageEl.current?.querySelector('[data-cross="latest"]');
    if (!el || !botRef.current.enabled) return;
    let off = false;
    const id = window.setTimeout(() => {
      void botRef.current.hopTo(el, { anchor: "left", pose: "cross", duration: 340 }).then(() => {
        if (!off) window.setTimeout(() => void botRef.current.rest(), 1100);
      });
    }, 250);
    return () => {
      off = true;
      window.clearTimeout(id);
    };
  }, [visibleCount, reduceMotion]);

  return (
    <StageShell
      badge="Step Motion"
      title={scene.title || "Equation Walkthrough"}
      controls={
        <>
          <button
            type="button"
            onClick={() => {
              setRawPlaying(false);
              setRawVisible((c) => (c >= scene.steps.length ? 1 : c + 1));
            }}
            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1"
          >
            <StepForward className="h-3 w-3" /> Step
          </button>
          <button
            type="button"
            onClick={replay}
            className="h-7 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Replay
          </button>
        </>
      }
    >
      <div className="space-y-2.5" ref={stageEl}>
        {scene.steps.slice(0, visibleCount).map((step, i) => {
          const isLatest = i === visibleCount - 1;
          return (
            <motion.div
              key={`${i}-${step.expr}`}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className="flex flex-col items-start gap-1"
            >
              {i > 0 && (
                <div className="pl-5 flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
                  <span className="text-xs font-bold">↓</span>
                  {step.note && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10">
                      {step.note}
                    </span>
                  )}
                </div>
              )}
              <div
                className={cn(
                  "w-full rounded-xl border px-3.5 py-2.5 font-mono text-sm md:text-base flex flex-wrap items-center justify-between gap-2 transition-colors",
                  isLatest
                    ? "border-teal-500/60 bg-teal-500/10 text-slate-900 dark:text-white font-bold shadow-xs"
                    : "border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300",
                )}
              >
                <span className="break-all">
                  {step.slashTerm && step.expr.includes(step.slashTerm)
                    ? step.expr.split(step.slashTerm).map((chunk, ci, arr) => (
                        <span key={ci}>
                          {chunk}
                          {ci < arr.length - 1 && (
                            <span data-cross={isLatest ? "latest" : undefined} className={isLatest ? "kin-cross" : "relative inline-block px-0.5 text-rose-500/80 line-through decoration-2 decoration-rose-500"}>
                              {step.slashTerm}
                            </span>
                          )}
                        </span>
                      ))
                    : step.expr}
                </span>
                {i === 0 && step.note && (
                  <span className="text-[11px] font-sans font-semibold text-slate-500">
                    {step.note}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </StageShell>
  );
}

/** Animated formula breakdown with clickable symbol cards and live expr evaluator sliders. */
function FormulaBreakdownStage({
  scene,
  reduceMotion,
  autoPlay,
}: StageCommonProps & { scene: FormulaBreakdownScene }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [cycling, setCycling] = useState(() => !reduceMotion && autoPlay);
  const [vars, setVars] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const p of scene.parts) {
      if (p.varKey && typeof p.defaultVal === "number") out[p.varKey] = p.defaultVal;
    }
    return out;
  });

  useEffect(() => {
    if (!cycling || reduceMotion || scene.parts.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % scene.parts.length);
    }, 1700);
    return () => window.clearInterval(id);
  }, [cycling, reduceMotion, scene.parts.length]);

  const computedResult = useMemo(() => {
    if (!scene.formulaExpr) return null;
    try {
      const val = evaluate(scene.formulaExpr, vars);
      return Math.round(val * 100) / 100;
    } catch {
      return null;
    }
  }, [scene.formulaExpr, vars]);

  const interactiveParts = scene.parts.filter(
    (p) => p.varKey && typeof p.defaultVal === "number",
  );

  return (
    <StageShell
      badge="Symbol Spotlight"
      title={scene.title || `${scene.lhs} = ${scene.rhs}`}
      controls={
        <button
          type="button"
          onClick={() => setCycling((c) => !c)}
          className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1"
        >
          {cycling ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {cycling ? "Pause Tour" : "Tour"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-4 font-mono text-2xl md:text-3xl font-black">
          <span className="text-teal-600 dark:text-teal-300">{scene.lhs}</span>
          <span className="text-slate-400">=</span>
          <span className="text-slate-900 dark:text-white tracking-wide">{scene.rhs}</span>
          {computedResult !== null && (
            <span className="ml-2 rounded-lg bg-teal-500/15 px-2.5 py-0.5 text-base font-bold text-teal-700 dark:text-teal-300">
              = {computedResult}
            </span>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {scene.parts.map((part, idx) => {
            const active = idx === activeIdx;
            const palette = ACCENT_CYCLE[idx % ACCENT_CYCLE.length];
            return (
              <motion.button
                key={`${part.symbol}-${idx}`}
                type="button"
                onClick={() => {
                  setCycling(false);
                  setActiveIdx(idx);
                }}
                animate={
                  reduceMotion
                    ? undefined
                    : { scale: active ? 1.02 : 1 }
                }
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
                className={cn(
                  "text-left rounded-xl border p-2.5 transition-all",
                  active
                    ? `${palette} shadow-xs`
                    : "border-slate-200 dark:border-slate-800 bg-white/75 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 opacity-85 hover:opacity-100",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-base font-black">{part.symbol}</span>
                  {part.unit && (
                    <span className="text-[10px] font-semibold uppercase opacity-75">
                      {part.unit}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-snug font-medium">{part.meaning}</p>
              </motion.button>
            );
          })}
        </div>

        {interactiveParts.length > 0 && scene.formulaExpr && (
          <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
            {interactiveParts.map((part) => {
              const key = part.varKey!;
              const val = vars[key] ?? part.defaultVal ?? 1;
              return (
                <label key={key} className="text-xs flex flex-col gap-1">
                  <span className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                    <span>{part.symbol} ({part.meaning})</span>
                    <span className="font-mono text-teal-600 dark:text-teal-300">{val}</span>
                  </span>
                  <input
                    type="range"
                    min={part.min ?? 1}
                    max={part.max ?? 20}
                    step={part.step ?? 1}
                    value={val}
                    onChange={(e) => setVars((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="accent-teal-600"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>
    </StageShell>
  );
}

/** Sequential animated concept node pipeline with path arrows. */
function ConceptFlowStage({
  scene,
  pageKey,
  reduceMotion,
}: StageCommonProps & { scene: ConceptFlowScene }) {
  return (
    <StageShell badge="Flow Diagram" title={scene.title || "How It Connects"}>
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
        {scene.nodes.map((node, i) => (
          <div key={`${pageKey}-${node.label}-${i}`} className="flex items-center gap-2 md:gap-3">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : i * 0.22, duration: 0.3 }}
              className={cn(
                "rounded-xl border px-3 py-2 text-center min-w-[100px] max-w-[170px]",
                ACCENT_CYCLE[i % ACCENT_CYCLE.length],
              )}
            >
              {node.badge && (
                <span className="block text-[10px] font-bold uppercase opacity-75">
                  Step {node.badge}
                </span>
              )}
              <span className="block text-xs font-bold leading-snug">{node.label}</span>
              {node.detail && (
                <span className="block text-[11px] opacity-80 mt-0.5">{node.detail}</span>
              )}
            </motion.div>
            {i < scene.nodes.length - 1 && (
              <motion.svg
                width="26"
                height="16"
                viewBox="0 0 26 16"
                className="shrink-0 text-teal-600 dark:text-teal-400"
                aria-hidden="true"
              >
                <motion.path
                  d="M 2 8 L 21 8 M 16 3 L 22 8 L 16 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={reduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.22 + 0.14, duration: 0.24 }}
                />
              </motion.svg>
            )}
          </div>
        ))}
      </div>
    </StageShell>
  );
}

/** Playful visual counter blocks designed for younger students. */
function KidCounterStage({
  scene,
  reduceMotion,
}: StageCommonProps & { scene: KidCounterScene }) {
  const [left, setLeft] = useState(scene.left);
  const [right, setRight] = useState(scene.right);

  const token = scene.token || "⭐";
  const answer =
    scene.op === "+"
      ? left + right
      : scene.op === "-"
        ? Math.max(0, left - right)
        : left * right;

  return (
    <StageShell badge="Visual Counter" title={scene.title || `${left} ${scene.op} ${right}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {scene.op === "×" ? (
            <div className="space-y-1.5">
              {Array.from({ length: Math.min(8, left) }).map((_, row) => (
                <div key={row} className="flex items-center gap-1.5 justify-center">
                  {Array.from({ length: Math.min(10, right) }).map((__, col) => (
                    <motion.span
                      key={col}
                      initial={reduceMotion ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        delay: reduceMotion ? 0 : (row * right + col) * 0.03,
                        type: "spring",
                        stiffness: 350,
                      }}
                      className="text-lg select-none"
                    >
                      {token}
                    </motion.span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900 px-3 py-2">
                {Array.from({ length: left }).map((_, idx) => {
                  const takenAway = scene.op === "-" && idx >= left - right;
                  return (
                    <motion.span
                      key={`l-${idx}`}
                      initial={reduceMotion ? false : { scale: 0 }}
                      animate={{
                        scale: takenAway ? 0.85 : 1,
                        opacity: takenAway ? 0.3 : 1,
                      }}
                      transition={{ delay: reduceMotion ? 0 : idx * 0.04, type: "spring" }}
                      className={cn("text-xl select-none", takenAway && "line-through")}
                    >
                      {token}
                    </motion.span>
                  );
                })}
              </div>
              {scene.op === "+" && (
                <>
                  <span className="text-xl font-black text-teal-600 dark:text-teal-400">+</span>
                  <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900 px-3 py-2">
                    {Array.from({ length: right }).map((_, idx) => (
                      <motion.span
                        key={`r-${idx}`}
                        initial={reduceMotion ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: reduceMotion ? 0 : (left + idx) * 0.04, type: "spring" }}
                        className="text-xl select-none"
                      >
                        {token}
                      </motion.span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          <span className="text-xl font-black text-slate-400">=</span>
          <motion.span
            key={answer}
            initial={reduceMotion ? false : { scale: 0.7 }}
            animate={{ scale: 1 }}
            className="rounded-xl bg-teal-600 text-white font-mono text-2xl font-black px-3.5 py-1.5 shadow-sm"
          >
            {answer}
          </motion.span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1 font-mono">
            First:
            <button
              type="button"
              onClick={() => setLeft((v) => Math.max(scene.op === "-" ? right : 0, v - 1))}
              className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700 font-bold"
            >
              -
            </button>
            <strong className="w-5 text-center">{left}</strong>
            <button
              type="button"
              onClick={() => setLeft((v) => Math.min(10, v + 1))}
              className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700 font-bold"
            >
              +
            </button>
          </span>
          <span className="flex items-center gap-1 font-mono">
            Second:
            <button
              type="button"
              onClick={() => setRight((v) => Math.max(0, v - 1))}
              className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700 font-bold"
            >
              -
            </button>
            <strong className="w-5 text-center">{right}</strong>
            <button
              type="button"
              onClick={() => setRight((v) => Math.min(scene.op === "-" ? left : 10, v + 1))}
              className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700 font-bold"
            >
              +
            </button>
          </span>
        </div>
      </div>
    </StageShell>
  );
}

/** Renders up to two procedural Manim-inspired motion scenes inside a notebook page. */
export function KineticStage({
  scenes,
  pageKey,
  variant = "card",
  onInteract,
}: {
  scenes: KineticScene[];
  pageKey: string | number;
  variant?: "card" | "textbook";
  onInteract?: () => void;
}) {
  const [prefs] = usePrefs();
  const osReduced = useReducedMotion();
  const reduceMotion = Boolean(prefs.reduceMotion || osReduced);
  const autoPlay = !prefs.noAutoplay && !reduceMotion;

  if (!scenes.length) return null;

  return (
    <StageVariantCtx.Provider value={variant}>
      <div
        className={variant === "textbook" ? "space-y-2" : "space-y-3 my-4"}
        data-testid="kinetic-stage"
        onPointerDownCapture={() => onInteract?.()}
      >
      {scenes.map((scene, idx) => {
        const key = `${pageKey}-${scene.kind}-${idx}`;
        const common = { pageKey: key, reduceMotion, autoPlay };
        switch (scene.kind) {
          case "fraction_slash":
            return <FractionSlashStage key={key} scene={scene} {...common} />;
          case "equation_steps":
            return <EquationStepsStage key={key} scene={scene} {...common} />;
          case "formula_breakdown":
            return <FormulaBreakdownStage key={key} scene={scene} {...common} />;
          case "concept_flow":
            return <ConceptFlowStage key={key} scene={scene} {...common} />;
          case "kid_counter":
            return <KidCounterStage key={key} scene={scene} {...common} />;
        }
      })}
      </div>
    </StageVariantCtx.Provider>
  );
}
