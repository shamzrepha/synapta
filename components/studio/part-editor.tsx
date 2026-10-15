"use client";

import React, { useState } from "react";
import { Plus, Copy, Trash2 } from "lucide-react";
import { evaluate } from "@/lib/studio/expr";
import { SHAPE_FIELDS, SHAPE_LABELS, defaultSize, paramValues, type DesignSpec, type Part3D, type Shape } from "@/lib/studio/spec";
import { cn } from "@/lib/utils";

type Value = number | string;

/** A number box that also accepts formulas using the design's settings (e.g. "W / 2 + 10"). */
function FormulaInput({ label, value, vars, onCommit, disabled }: { label: string; value: Value; vars: Record<string, number>; onCommit: (v: Value) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  let bad = false;
  if (typeof value === "string") {
    try {
      evaluate(value, vars);
    } catch {
      bad = true;
    }
  }
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t === "") {
      setDraft(null);
      return;
    }
    onCommit(/^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t);
    setDraft(null);
  };
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-semibold text-slate-500 min-w-0">
      {label}
      <input
        value={text}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), commit())}
        inputMode="decimal"
        className={cn("h-8 w-full rounded-lg border bg-white dark:bg-slate-900 px-2 text-sm font-normal text-slate-900 dark:text-slate-100", bad ? "border-rose-500" : "border-slate-200 dark:border-slate-700")}
      />
    </label>
  );
}

function newId(parts: Part3D[], shape: string): string {
  const taken = new Set(parts.map((p) => p.id));
  let i = 1;
  while (taken.has(`${shape}${i}`)) i++;
  return `${shape}${i}`;
}

/**
 * Hand-edit a 3D model: add shapes (box, cylinder, gear, ring, tube…), then select one to change its
 * size, position, rotation, colour and exploded-view offset. Numbers can be formulas of the settings.
 */
export function PartEditor({
  spec,
  selectedId,
  onSelect,
  onChange,
  readOnly,
}: {
  spec: DesignSpec;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (parts: Part3D[]) => void;
  readOnly?: boolean;
}) {
  const parts = spec.parts;
  const vars = paramValues(spec);
  const sel = parts.find((p) => p.id === selectedId) || null;

  const update = (id: string, patch: Partial<Part3D>) => onChange(parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = (shape: Shape) => {
    const id = newId(parts, shape);
    const top = parts.reduce((m, p) => Math.max(m, typeof p.pos[1] === "number" ? p.pos[1] : 0), 0);
    const part: Part3D = { id, name: `${SHAPE_LABELS[shape]} ${id.replace(/\D/g, "")}`, shape, size: defaultSize(shape), pos: [0, top + 40, 0], color: "#8fd3ff", opacity: 0.2, ...(shape === "gear" ? { teeth: 20 } : {}) };
    onChange([...parts, part]);
    onSelect(id);
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div>
          <p className="text-sm font-bold mb-1.5">Add a shape</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SHAPE_LABELS) as Shape[]).map((s) => (
              <button key={s} type="button" onClick={() => add(s)} className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold hover:border-teal-500">
                <Plus className="h-3 w-3" /> {SHAPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {sel ? (
        <div className="rounded-xl border border-dashed border-sky-400 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={sel.name} disabled={readOnly} onChange={(e) => update(sel.id, { name: e.target.value.slice(0, 80) })} aria-label="Part name" className="flex-1 min-w-0 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm font-bold" />
            {!readOnly && (
              <>
                <button
                  type="button"
                  aria-label="Duplicate part"
                  title="Duplicate"
                  onClick={() => {
                    const id = newId(parts, sel.shape);
                    onChange([...parts, { ...sel, id, name: `${sel.name} copy`.slice(0, 80), pos: [sel.pos[0], sel.pos[1], typeof sel.pos[2] === "number" ? sel.pos[2] + 20 : sel.pos[2]] }]);
                    onSelect(id);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Delete part"
                  title="Delete"
                  onClick={() => {
                    onChange(parts.filter((p) => p.id !== sel.id));
                    onSelect(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5 text-[10px] font-semibold text-slate-500">
              Shape
              <select
                value={sel.shape}
                disabled={readOnly}
                onChange={(e) => {
                  const shape = e.target.value as Shape;
                  update(sel.id, { shape, size: defaultSize(shape), ...(shape === "gear" ? { teeth: sel.teeth ?? 20 } : {}) });
                }}
                className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-sm font-normal text-slate-900 dark:text-slate-100"
              >
                {(Object.keys(SHAPE_LABELS) as Shape[]).map((s) => (
                  <option key={s} value={s}>{SHAPE_LABELS[s]}</option>
                ))}
              </select>
            </label>
            {sel.shape === "gear" && (
              <FormulaInput label="Teeth" value={sel.teeth ?? 20} vars={vars} disabled={readOnly} onCommit={(v) => update(sel.id, { teeth: typeof v === "string" ? v : Math.max(6, Math.min(120, Math.round(v || 20))) })} />
            )}
          </div>

          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Size (mm)</p>
          <div className="grid grid-cols-3 gap-2">
            {SHAPE_FIELDS[sel.shape].map((label, i) => (
              <FormulaInput
                key={`${sel.shape}-${label}`}
                label={label}
                value={sel.size[i] ?? defaultSize(sel.shape)[i]}
                vars={vars}
                disabled={readOnly}
                onCommit={(v) => update(sel.id, { size: SHAPE_FIELDS[sel.shape].map((_, k) => (k === i ? v : sel.size[k] ?? defaultSize(sel.shape)[k])) })}
              />
            ))}
          </div>

          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Position (mm, centre · Y is up)</p>
          <div className="grid grid-cols-3 gap-2">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <FormulaInput key={axis} label={axis} value={sel.pos[i]} vars={vars} disabled={readOnly} onCommit={(v) => update(sel.id, { pos: sel.pos.map((x, k) => (k === i ? v : x)) as Part3D["pos"] })} />
            ))}
          </div>

          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Rotation (degrees)</p>
          <div className="grid grid-cols-3 gap-2">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <FormulaInput
                key={axis}
                label={axis}
                value={(sel.rot || [0, 0, 0])[i]}
                vars={vars}
                disabled={readOnly}
                onCommit={(v) => update(sel.id, { rot: (sel.rot || [0, 0, 0]).map((x, k) => (k === i ? v : x)) as Part3D["rot"] })}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              Colour
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(sel.color || "") ? sel.color : "#8fd3ff"} disabled={readOnly} onChange={(e) => update(sel.id, { color: e.target.value })} className="h-8 w-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent" />
            </label>
            <label className="flex flex-1 items-center gap-2 text-[11px] font-semibold text-slate-500">
              Solidity
              <input type="range" min={5} max={100} value={Math.round((sel.opacity ?? 0.15) * 100)} disabled={readOnly} onChange={(e) => update(sel.id, { opacity: Number(e.target.value) / 100 })} className="flex-1 accent-teal-600" />
            </label>
          </div>

          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Pulls apart by (exploded view)</p>
          <div className="grid grid-cols-3 gap-2">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <FormulaInput
                key={axis}
                label={axis}
                value={(sel.explode || [0, 0, 0])[i]}
                vars={vars}
                disabled={readOnly}
                onCommit={(v) => update(sel.id, { explode: (sel.explode || [0, 0, 0]).map((x, k) => (k === i ? Number(v) || 0 : x)) as [number, number, number] })}
              />
            ))}
          </div>
          <p className="text-[10px] text-slate-500">Tip: use a setting name in a box, like <code>W / 2</code>, so the part resizes when you move the setting slider.</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Tap a part in the 3D view or in the list below to edit it.</p>
      )}

      {parts.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-100 dark:border-slate-800">
          {parts.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onSelect(p.id === selectedId ? null : p.id)} className={cn("w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm", p.id === selectedId && "bg-teal-500/10 text-teal-700 dark:text-teal-300")}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: p.color || "#8fd3ff" }} />
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="text-[10px] text-slate-500 shrink-0">{SHAPE_LABELS[p.shape]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
