"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Flame,
  FlaskConical,
  Microscope,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  Thermometer,
  Droplets,
  Eye,
  Award,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";
import {
  REAGENTS,
  LAB_VERIFICATION_ORDERS,
  evaluateWorkbench,
  type ReagentId,
  type BurnerSetting,
  type VesselState,
} from "@/lib/experiments/workbench";
import { cn } from "@/lib/utils";

export function ScienceWorkbenchGame() {
  const { toast } = useToast();
  const { user, updateUser } = useUserStore();

  const [reagents, setReagents] = useState<ReagentId[]>([]);
  const [burner, setBurner] = useState<BurnerSetting>("off");
  const [heatingSeconds, setHeatingSeconds] = useState(0);
  const [flameLoopActive, setFlameLoopActive] = useState(false);
  const [microscopeSlideTaken, setMicroscopeSlideTaken] = useState(false);
  const [microscopeZoom, setMicroscopeZoom] = useState<40 | 100 | 400>(100);

  const [activeOrderIdx, setActiveOrderIdx] = useState(0);
  const [completedOrders, setCompletedOrders] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Continuous heating timer when Bunsen burner is lit
  useEffect(() => {
    if (burner === "off") return;
    const interval = setInterval(() => {
      setHeatingSeconds((s) => Math.min(60, s + 0.5));
    }, 500);
    return () => clearInterval(interval);
  }, [burner]);

  const vesselState: VesselState = useMemo(
    () => ({
      reagents,
      burner,
      heatingSeconds,
      flameLoopActive,
      microscopeSlideTaken,
      microscopeZoom,
    }),
    [reagents, burner, heatingSeconds, flameLoopActive, microscopeSlideTaken, microscopeZoom]
  );

  const result = useMemo(() => evaluateWorkbench(vesselState), [vesselState]);
  const activeOrder = LAB_VERIFICATION_ORDERS[activeOrderIdx] || LAB_VERIFICATION_ORDERS[0];
  const orderCheck = useMemo(
    () => activeOrder.verify(vesselState, result),
    [activeOrder, vesselState, result]
  );

  // Live 60fps Canvas Renderer for Beaker + Bunsen Burner Fire + Optical Microscope Eyepiece
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let tick = 0;

    const render = () => {
      tick += 0.04;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      const W = rect.width;
      const H = rect.height;

      // Dark laboratory slate backdrop
      ctx.fillStyle = "#091326";
      ctx.fillRect(0, 0, W, H);

      // Lab bench surface
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, H - 34, W, 34);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H - 34);
      ctx.lineTo(W, H - 34);
      ctx.stroke();

      // ============================================================
      // LEFT STATION: BUNSEN BURNER, TRIPOD & REACTION BEAKER
      // ============================================================
      const benchCenterX = W * 0.28;
      const benchY = H - 34;

      // Tripod Stand & Wire Gauze
      const gauzeY = benchY - 78;
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(benchCenterX - 58, gauzeY);
      ctx.lineTo(benchCenterX - 70, benchY);
      ctx.moveTo(benchCenterX + 58, gauzeY);
      ctx.lineTo(benchCenterX + 70, benchY);
      ctx.stroke();

      // Wire gauze
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(benchCenterX - 64, gauzeY);
      ctx.lineTo(benchCenterX + 64, gauzeY);
      ctx.stroke();

      // Bunsen Burner Base & Chimney
      ctx.fillStyle = "#475569";
      ctx.fillRect(benchCenterX - 24, benchY - 10, 48, 10);
      ctx.fillStyle = "#64748b";
      ctx.fillRect(benchCenterX - 6, benchY - 46, 12, 36);

      // Animated Bunsen Burner Flame (when lit)
      if (burner !== "off") {
        const flameTopY = gauzeY + 2 + Math.sin(tick * 7) * 3;
        const flameBaseY = benchY - 46;
        const outerColor = result.flameTest.active
          ? result.flameTest.colorHex
          : burner === "roaring"
          ? "#38bdf8"
          : "#f59e0b";
        const innerColor = burner === "roaring" ? "#e0f2fe" : "#fef08a";

        // Outer flame cone
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = outerColor;
        ctx.beginPath();
        ctx.moveTo(benchCenterX - 14, flameBaseY);
        ctx.quadraticCurveTo(
          benchCenterX - 22 + Math.sin(tick * 9) * 4,
          (flameBaseY + flameTopY) / 2,
          benchCenterX + Math.cos(tick * 6) * 3,
          flameTopY - 4
        );
        ctx.quadraticCurveTo(
          benchCenterX + 22 + Math.cos(tick * 8) * 4,
          (flameBaseY + flameTopY) / 2,
          benchCenterX + 14,
          flameBaseY
        );
        ctx.closePath();
        ctx.fill();

        // Inner cone
        ctx.fillStyle = innerColor;
        ctx.beginPath();
        ctx.moveTo(benchCenterX - 6, flameBaseY);
        ctx.lineTo(benchCenterX, flameTopY + 10);
        ctx.lineTo(benchCenterX + 6, flameBaseY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Nichrome wire loop in flame if flame test is active
        if (flameLoopActive) {
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(benchCenterX - 65, flameTopY + 8);
          ctx.lineTo(benchCenterX - 4, flameTopY + 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(benchCenterX, flameTopY + 8, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Glass Beaker sitting on the gauze
      const beakerW = 96;
      const beakerH = 110;
      const beakerLeft = benchCenterX - beakerW / 2;
      const beakerTop = gauzeY - beakerH - 2;
      const beakerBottom = gauzeY - 2;

      // Liquid inside beaker
      const fillFraction = Math.min(0.82, reagents.length * 0.18);
      if (fillFraction > 0) {
        const liqH = beakerH * fillFraction;
        const liqTop = beakerBottom - liqH;
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = result.liquidColorHex;
        ctx.fillRect(beakerLeft + 3, liqTop, beakerW - 6, liqH);
        ctx.restore();

        // Precipitate layer settled at bottom of beaker
        if (result.precipitate.present) {
          ctx.fillStyle = result.precipitate.colorHex;
          ctx.fillRect(beakerLeft + 4, beakerBottom - 16, beakerW - 8, 15);
          // Suspended precipitate particles
          for (let i = 0; i < 18; i++) {
            const px = beakerLeft + 10 + ((i * 37) % (beakerW - 20));
            const py = beakerBottom - 18 - Math.abs(Math.sin(tick + i)) * 18;
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Effervescence / Boiling Gas Bubbles
        if (result.gasEvolved.present) {
          ctx.strokeStyle = "#f8fafc";
          ctx.lineWidth = 1.3;
          for (let i = 0; i < 14; i++) {
            const bx = beakerLeft + 12 + ((i * 29) % (beakerW - 24));
            const prog = ((tick * 1.4 + i * 0.23) % 1);
            const by = beakerBottom - 8 - prog * (liqH - 8);
            ctx.beginPath();
            ctx.arc(bx + Math.sin(tick * 3 + i) * 2, by, 2.5 + prog * 1.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Beaker outline & graduation ticks
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(beakerLeft - 4, beakerTop);
      ctx.lineTo(beakerLeft, beakerTop + 6);
      ctx.lineTo(beakerLeft, beakerBottom);
      ctx.lineTo(beakerLeft + beakerW, beakerBottom);
      ctx.lineTo(beakerLeft + beakerW, beakerTop + 6);
      ctx.lineTo(beakerLeft + beakerW + 4, beakerTop);
      ctx.stroke();

      ctx.strokeStyle = "rgba(226,232,240,0.45)";
      ctx.lineWidth = 1;
      for (let m = 1; m <= 3; m++) {
        const my = beakerBottom - (beakerH * m) / 4;
        ctx.beginPath();
        ctx.moveTo(beakerLeft + beakerW - 18, my);
        ctx.lineTo(beakerLeft + beakerW - 4, my);
        ctx.stroke();
      }

      // Live Sensor Readouts above Beaker
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `Temp: ${result.temperatureC}°C   •   pH: ${result.pH.toFixed(1)}`,
        benchCenterX,
        beakerTop - 10
      );
      if (result.flameTest.active) {
        ctx.fillStyle = result.flameTest.colorHex;
        ctx.fillText(`Flame Emission: ${result.flameTest.label}`, benchCenterX, 18);
      }

      // ============================================================
      // RIGHT STATION: OPTICAL MICROSCOPE VIEWPORT (40x / 100x / 400x)
      // ============================================================
      const scopeCenterX = W * 0.73;
      const scopeCenterY = H * 0.46;
      const scopeRadius = Math.min(76, W * 0.19, H * 0.35);

      // Microscope outer housing ring
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(scopeCenterX, scopeCenterY, scopeRadius + 6, 0, Math.PI * 2);
      ctx.fill();

      // Illuminated slide field
      ctx.save();
      ctx.beginPath();
      ctx.arc(scopeCenterX, scopeCenterY, scopeRadius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = microscopeSlideTaken ? "#ecfeff" : "#1e293b";
      ctx.fillRect(
        scopeCenterX - scopeRadius,
        scopeCenterY - scopeRadius,
        scopeRadius * 2,
        scopeRadius * 2
      );

      if (microscopeSlideTaken) {
        const scaleFactor = microscopeZoom === 400 ? 1.8 : microscopeZoom === 100 ? 1.15 : 0.75;
        const jitter = Math.min(3.5, Math.sqrt(result.temperatureC / 25) * 0.8);

        // If onion epidermis & starch cells are present, draw plant cell lattice + nuclei/amyloplasts
        if (reagents.includes("starch_cells")) {
          const stained = reagents.includes("iodine");
          ctx.strokeStyle = stained ? "#312e81" : "#047857";
          ctx.lineWidth = 1.8;
          const cellW = 28 * scaleFactor;
          const cellH = 18 * scaleFactor;
          for (let gx = -3; gx <= 3; gx++) {
            for (let gy = -3; gy <= 3; gy++) {
              const cx = scopeCenterX + gx * cellW + (gy % 2 === 0 ? cellW * 0.5 : 0);
              const cy = scopeCenterY + gy * cellH;
              ctx.strokeRect(cx - cellW / 2, cy - cellH / 2, cellW - 2, cellH - 2);
              // Nucleus or stained blue-black starch amyloplasts
              ctx.fillStyle = stained ? "#1e1b4b" : "#10b981";
              ctx.beginPath();
              ctx.arc(cx, cy, stained ? 4.2 * scaleFactor : 2.5 * scaleFactor, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (result.precipitate.present) {
          // Render precipitate micro-crystals (needles, curdy clusters, or granules)
          ctx.fillStyle = result.precipitate.colorHex === "#f8fafc" ? "#64748b" : result.precipitate.colorHex;
          ctx.strokeStyle = ctx.fillStyle;
          for (let i = 0; i < 24; i++) {
            const angle = (i * 137.5 * Math.PI) / 180;
            const dist = ((i * 19) % Math.max(10, scopeRadius - 12));
            const px =
              scopeCenterX +
              Math.cos(angle) * dist +
              Math.sin(tick * 2 + i) * jitter;
            const py =
              scopeCenterY +
              Math.sin(angle) * dist +
              Math.cos(tick * 2 + i) * jitter;

            if (result.precipitate.crystalShape === "needles") {
              ctx.lineWidth = 2 * scaleFactor;
              ctx.beginPath();
              ctx.moveTo(px - 7 * scaleFactor, py - 4 * scaleFactor);
              ctx.lineTo(px + 7 * scaleFactor, py + 4 * scaleFactor);
              ctx.stroke();
            } else if (result.precipitate.crystalShape === "rhombic") {
              ctx.fillRect(px - 4 * scaleFactor, py - 4 * scaleFactor, 8 * scaleFactor, 6 * scaleFactor);
            } else {
              ctx.beginPath();
              ctx.arc(px, py, 3.6 * scaleFactor, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (reagents.length > 0) {
          // Dissolved electrolyte ions in Brownian motion
          ctx.fillStyle = "#0284c7";
          for (let i = 0; i < 20; i++) {
            const px =
              scopeCenterX +
              Math.cos(i * 2.1 + tick * 1.5) * (scopeRadius * 0.65 * ((i % 5) / 5 + 0.2));
            const py =
              scopeCenterY +
              Math.sin(i * 1.7 + tick * 1.5) * (scopeRadius * 0.65 * ((i % 4) / 4 + 0.2));
            ctx.beginPath();
            ctx.arc(px, py, 2.2 * scaleFactor, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Crosshair reticle inside microscope
        ctx.strokeStyle = "rgba(15,23,42,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(scopeCenterX - scopeRadius, scopeCenterY);
        ctx.lineTo(scopeCenterX + scopeRadius, scopeCenterY);
        ctx.moveTo(scopeCenterX, scopeCenterY - scopeRadius);
        ctx.lineTo(scopeCenterX, scopeCenterY + scopeRadius);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Tap 'Inspect Slide'", scopeCenterX, scopeCenterY - 4);
        ctx.fillText("to view at 40x–400x", scopeCenterX, scopeCenterY + 10);
      }
      ctx.restore();

      // Microscope outer bezel
      ctx.strokeStyle = microscopeSlideTaken ? "#38bdf8" : "#475569";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(scopeCenterX, scopeCenterY, scopeRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `OPTICAL MICROSCOPE (${microscopeZoom}x)`,
        scopeCenterX,
        scopeCenterY + scopeRadius + 18
      );

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [burner, flameLoopActive, microscopeSlideTaken, microscopeZoom, reagents, result]);

  const addReagent = (id: ReagentId) => {
    setReagents((prev) => [...prev.slice(-7), id]);
  };

  const resetVessel = () => {
    setReagents([]);
    setBurner("off");
    setHeatingSeconds(0);
    setFlameLoopActive(false);
    setMicroscopeSlideTaken(false);
  };

  const handleCompleteOrder = () => {
    if (!orderCheck.passed) {
      toast({
        title: "Order not yet verified",
        description: orderCheck.progressNote,
        variant: "amber",
      });
      return;
    }
    if (!completedOrders.includes(activeOrder.id)) {
      setCompletedOrders((prev) => [...prev, activeOrder.id]);
      if (user) {
        updateUser({ xp: (user.xp || 0) + activeOrder.xpReward });
      }
    }
    toast({
      title: `Verified! +${activeOrder.xpReward} XP Earned`,
      description: `${activeOrder.title} completed and verified!`,
      variant: "success",
    });
    if (activeOrderIdx < LAB_VERIFICATION_ORDERS.length - 1) {
      setActiveOrderIdx((i) => i + 1);
      resetVessel();
    }
  };

  return (
    <Card className="p-4 sm:p-6 space-y-5 border-2 border-brand-500/35 bg-gradient-to-br from-brand-500/10 via-card to-card">
      {/* Header & Active "Cooking Fever"-Style Verification Order */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-600 text-white inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Interactive Chemistry, Fire & Microscope Workbench
            </span>
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <Award className="h-3.5 w-3.5" /> {completedOrders.length}/{LAB_VERIFICATION_ORDERS.length} Lab Orders Verified
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-foreground">
            Mix Reagents, Heat in Fire, Test Flames & Verify Under the Microscope
          </h2>
          <p className="text-xs text-muted-foreground">
            Pour real acids, bases, and metal salts into the vessel, ignite the Bunsen burner, dip the flame-test loop, and inspect precipitates or stained cells at 400x magnification.
          </p>
        </div>

        {/* Order Selector Pills */}
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {LAB_VERIFICATION_ORDERS.map((ord, idx) => {
            const done = completedOrders.includes(ord.id);
            const active = idx === activeOrderIdx;
            return (
              <button
                key={ord.id}
                type="button"
                onClick={() => setActiveOrderIdx(idx)}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1",
                  active
                    ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                    : done
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {done && <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>Order #{idx + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Order Ticket */}
      <div className="p-3.5 rounded-xl border border-amber-500/35 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500 text-slate-950">
              {activeOrder.client} • +{activeOrder.xpReward} XP
            </span>
            <h3 className="text-xs sm:text-sm font-extrabold text-foreground truncate">{activeOrder.title}</h3>
          </div>
          <p className="text-xs text-muted-foreground">{activeOrder.brief}</p>
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{orderCheck.progressNote}</p>
        </div>
        <Button
          size="sm"
          onClick={handleCompleteOrder}
          className={cn(
            "shrink-0 text-xs font-extrabold",
            orderCheck.passed
              ? "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
              : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          )}
        >
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          {orderCheck.passed ? `Verify & Claim +${activeOrder.xpReward} XP!` : "Check Order"}
        </Button>
      </div>

      {/* Main Split: Live Canvas + Station Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left 7 Cols: Live Animated Workbench & Microscope Canvas + Equation Readout */}
        <div className="lg:col-span-7 space-y-3">
          <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
            <canvas ref={canvasRef} className="w-full h-64 sm:h-72 block" />
          </div>

          {/* Live Reaction Equation & Microscope Observation Log */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl border border-border bg-card space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 flex items-center gap-1">
                <FlaskConical className="h-3 w-3" /> Chemical Equation & Observation
              </span>
              <p className="text-xs font-mono font-bold text-foreground break-words">{result.equation}</p>
              <p className="text-[11px] text-muted-foreground">{result.observation}</p>
            </div>

            <div className="p-3 rounded-xl border border-border bg-card space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-600 flex items-center gap-1">
                <Microscope className="h-3 w-3" /> Microscope & Spectroscopy Log
              </span>
              <p className="text-[11px] text-foreground font-medium">{result.microscopeSummary}</p>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Reagent Shelf + Bunsen Burner Fire + Microscope Station Controls */}
        <div className="lg:col-span-5 space-y-3.5">
          {/* Station 1: Reagent Shelf */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                <Droplets className="h-3.5 w-3.5 text-brand-600" /> 1. Tap Reagents to Pour into Beaker
              </span>
              <button
                type="button"
                onClick={resetVessel}
                className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Wash Beaker
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {REAGENTS.map((r) => {
                const count = reagents.filter((x) => x === r.id).length;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addReagent(r.id)}
                    title={r.description}
                    className={cn(
                      "p-2 rounded-lg border text-left transition flex items-center justify-between gap-1.5",
                      count > 0
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-border bg-slate-50/70 dark:bg-slate-900/50 hover:border-brand-500/50"
                    )}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-extrabold font-mono text-foreground block truncate">
                        {r.formula}
                      </span>
                      <span className="text-[10px] text-muted-foreground block truncate">{r.name}</span>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-brand-600 text-white shrink-0">
                        {count}x
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Station 2: Bunsen Burner Fire & Flame Test */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-amber-500" /> 2. Bunsen Burner Fire & Flame Test
              </span>
              <span className="text-xs font-mono font-bold text-amber-600 flex items-center gap-1">
                <Thermometer className="h-3.5 w-3.5" /> {result.temperatureC}°C
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "off", label: "Flame Off" },
                { id: "safety", label: "Yellow (450°C)" },
                { id: "roaring", label: "Roaring Blue" },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBurner(b.id as BurnerSetting)}
                  className={cn(
                    "py-1.5 px-2 rounded-lg text-[11px] font-bold border transition",
                    burner === b.id
                      ? "bg-amber-500 text-slate-950 border-amber-500"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={burner === "off"}
                onClick={() => setHeatingSeconds((s) => Math.min(60, s + 4))}
                className="flex-1 h-8 text-[11px] font-semibold"
              >
                <Flame className="mr-1 h-3.5 w-3.5 text-amber-500" /> Heat +50°C Faster
              </Button>
              <Button
                type="button"
                size="sm"
                variant={flameLoopActive ? "default" : "outline"}
                disabled={burner === "off"}
                onClick={() => setFlameLoopActive((v) => !v)}
                className="flex-1 h-8 text-[11px] font-semibold"
              >
                {flameLoopActive ? "Flame Loop: ON" : "Dip Flame Test Loop"}
              </Button>
            </div>
          </div>

          {/* Station 3: Optical Microscope Station */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                <Microscope className="h-3.5 w-3.5 text-sky-500" /> 3. Optical Microscope Station
              </span>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-slate-100 dark:bg-slate-900">
                {([40, 100, 400] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setMicroscopeZoom(z)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-extrabold",
                      microscopeZoom === z ? "bg-sky-600 text-white" : "text-muted-foreground"
                    )}
                  >
                    {z}x
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => setMicroscopeSlideTaken(true)}
              className="w-full h-9 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold"
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              {microscopeSlideTaken ? "Slide Loaded in Microscope (Refresh)" : "Inspect Sample Slide in Microscope"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
