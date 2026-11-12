"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Maximize2, Minus, Plus, Sparkles } from "lucide-react";
import { displayTitle, layoutTree, NODE_H, pathTo, type MapNode } from "@/lib/mindmap/tree";

// Fixed colours (not theme classes) so the exported PNG looks the same as the screen.
const DEPTH_FILL = ["#0f766e", "#0d9488", "#2563eb", "#7c3aed", "#db2777"];
const LINK = "#94a3b8";

interface View {
  x: number;
  y: number;
  k: number;
}

const clampK = (k: number) => Math.min(2.5, Math.max(0.2, k));

/** Interactive SVG mind map: drag to pan, pinch/wheel/buttons to zoom, tap a node to select, +/- to fold. */
export function MindMapView({
  tree,
  title,
  selectedId,
  onSelect,
  onExplain,
  nodeStyle,
  renderActions,
  hereId,
  height,
}: {
  tree: MapNode;
  title: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onExplain?: (path: string[]) => void;
  /** colours for a node (default: by depth). Fixed colours, so the exported picture matches the screen. */
  nodeStyle?: (id: string, depth: number) => { fill: string; text: string; dash?: boolean };
  /** replaces the "Explain this" bar under the map for the selected node */
  renderActions?: (node: { id: string; title: string }) => React.ReactNode;
  /** the node to ring as "you are here" */
  hereId?: string | null;
  height?: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, startDist: 0, startK: 1 });

  const layout = useMemo(() => layoutTree(tree, collapsed), [tree, collapsed]);
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // on a phone, keep the text readable (not shrunk to fit the whole tree) and start at the root; the learner pans from there
    if (r.width < 600) {
      const kw = clampK(Math.max(0.55, Math.min(1, (r.width - 16) / layout.width)));
      setView({ k: kw, x: 8, y: Math.max(8, (r.height - layout.height * kw) / 2) });
      return;
    }
    const k = clampK(Math.min(1, r.width / layout.width, r.height / layout.height));
    setView({ k, x: (r.width - layout.width * k) / 2, y: Math.max(0, (r.height - layout.height * k) / 2) });
  }, [layout.width, layout.height]);

  // Fit when a different map is shown
  useEffect(() => {
    const t = setTimeout(fit, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = wrapRef.current;
    const r = el?.getBoundingClientRect();
    const px = cx ?? (r ? r.width / 2 : 0);
    const py = cy ?? (r ? r.height / 2 : 0);
    setView((v) => {
      const k = clampK(v.k * factor);
      const f = k / v.k;
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    });
  }, []);

  // Wheel zoom needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current.moved = 0;
    if (pointers.current.size === 2) {
      gesture.current.startDist = dist();
      gesture.current.startK = view.k;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current.moved += Math.abs(dx) + Math.abs(dy);
    if (gesture.current.moved > 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // pointer already released
      }
    }
    if (pointers.current.size === 2) {
      const r = wrapRef.current?.getBoundingClientRect();
      const pts = [...pointers.current.values()];
      const cx = (pts[0].x + pts[1].x) / 2 - (r?.left ?? 0);
      const cy = (pts[0].y + pts[1].y) / 2 - (r?.top ?? 0);
      const target = clampK(gesture.current.startK * (dist() / (gesture.current.startDist || 1)));
      setView((v) => {
        const f = target / v.k;
        return { k: target, x: cx - (cx - v.x) * f + dx / 2, y: cy - (cy - v.y) * f + dy / 2 };
      });
    } else if (pointers.current.size === 1 && gesture.current.moved > 6) {
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const wasDrag = () => gesture.current.moved > 6;

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const downloadPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const scale = 2;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(layout.width * scale));
    clone.setAttribute("height", String(layout.height * scale));
    clone.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    clone.removeAttribute("style");
    clone.querySelector("[data-pan]")?.setAttribute("transform", "");
    clone.querySelectorAll("[data-ui]").forEach((n) => n.remove());
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * scale;
      canvas.height = layout.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(title || "mind-map").replace(/[^\w-]+/g, "-").slice(0, 40)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  };

  const selected = selectedId ? pos.get(selectedId) : null;

  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white overflow-hidden">
        <div
          ref={wrapRef}
          className={`${height || "h-[min(60dvh,520px)]"} w-full cursor-grab active:cursor-grabbing`}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <svg ref={svgRef} width="100%" height="100%" role="img" aria-label={`Mind map: ${title}`} style={{ display: "block" }}>
            <g data-pan transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {layout.links.map((l) => {
                const a = pos.get(l.from)!;
                const b = pos.get(l.to)!;
                const x1 = a.x + a.w;
                const x2 = b.x;
                const mx = (x1 + x2) / 2;
                return <path key={`${l.from}>${l.to}`} d={`M${x1} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`} fill="none" stroke={LINK} strokeWidth={2} />;
              })}
              {layout.nodes.map((n) => {
                const st = nodeStyle?.(n.id, n.depth);
                const fill = st?.fill ?? DEPTH_FILL[Math.min(n.depth, DEPTH_FILL.length - 1)];
                const textFill = st?.text ?? "#ffffff";
                const isSel = n.id === selectedId;
                const isHere = n.id === hereId;
                return (
                  <g key={n.id}>
                    <g
                      onClick={() => {
                        if (!wasDrag()) onSelect(isSel ? null : n.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {isHere && <rect x={n.x - 5} y={n.y - n.h / 2 - 5} width={n.w + 10} height={n.h + 10} rx={n.h / 2 + 5} fill="none" stroke="#2563eb" strokeWidth={3} strokeDasharray="6 4" />}
                      <rect x={n.x} y={n.y - n.h / 2} width={n.w} height={n.h} rx={n.h / 2} fill={fill} stroke={isSel ? "#f59e0b" : st?.dash ? "#64748b" : "none"} strokeWidth={isSel ? 3 : st?.dash ? 1.5 : 0} strokeDasharray={st?.dash && !isSel ? "4 3" : undefined} />
                      <text x={n.x + n.w / 2} y={n.y} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={n.depth === 0 ? 700 : 500} fill={textFill} fontFamily="system-ui, sans-serif">
                        {displayTitle(n.title)}
                      </text>
                    </g>
                    {n.hasChildren && (
                      <g
                        data-ui
                        onClick={() => {
                          if (!wasDrag()) toggle(n.id);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <circle cx={n.x + n.w + 2} cy={n.y} r={11} fill="#ffffff" stroke={LINK} strokeWidth={2} />
                        <text x={n.x + n.w + 2} y={n.y} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={700} fill="#475569" fontFamily="system-ui, sans-serif">
                          {n.collapsed ? "+" : "−"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          <MapBtn label="Zoom in" onClick={() => zoomAt(1.25)}><Plus className="h-4 w-4" /></MapBtn>
          <MapBtn label="Zoom out" onClick={() => zoomAt(0.8)}><Minus className="h-4 w-4" /></MapBtn>
          <MapBtn label="Fit to screen" onClick={fit}><Maximize2 className="h-4 w-4" /></MapBtn>
          <MapBtn label="Download PNG" onClick={downloadPng}><Download className="h-4 w-4" /></MapBtn>
        </div>
        <div className="absolute left-3 bottom-2 text-[10px] text-slate-400 pointer-events-none">Drag to move · pinch to zoom · tap a bubble</div>
      </div>

      {selected && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2.5">
          <div className="min-w-0 flex-1 text-sm font-semibold truncate">{selected.title}</div>
          {renderActions ? (
            renderActions({ id: selected.id, title: selected.title })
          ) : (
            onExplain && (
              <button
                type="button"
                onClick={() => onExplain(pathTo(tree, selected.id))}
                className="h-9 px-3 shrink-0 rounded-lg bg-brand-600 text-white text-xs font-semibold flex items-center gap-1.5"
                style={{ minHeight: NODE_H }}
              >
                <Sparkles className="h-3.5 w-3.5" /> Explain this
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function MapBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="h-9 w-9 rounded-lg bg-white/95 border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center"
    >
      {children}
    </button>
  );
}
