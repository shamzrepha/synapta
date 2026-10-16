"use client";

import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { BLOCK_TYPES, newBlock, pinName, type Block, type BlockProgram, type Cond } from "@/lib/studio/blocks";
import { cn } from "@/lib/utils";

/**
 * Block coding: stack blocks instead of typing. The result compiles to the same program the raw code
 * editor shows, so blocks and code run on the same simulated board.
 */
const PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

const sel = "h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs text-slate-900 dark:text-slate-100";
const numCls = "h-8 w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs text-slate-900 dark:text-slate-100";

function PinSelect({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className={sel} aria-label="Pin">
      {PINS.map((n) => (
        <option key={n} value={n}>{pinName(n)}</option>
      ))}
    </select>
  );
}

function Num({ value, onChange, min, max, disabled, label }: { value: number; onChange: (n: number) => void; min: number; max: number; disabled?: boolean; label: string }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      className={numCls}
    />
  );
}

const VAR_RE = /^[A-Za-z_][A-Za-z0-9_]{0,15}$/;

function VarName({ value, onChange, disabled, label = "Variable name" }: { value: string; onChange: (v: string) => void; disabled?: boolean; label?: string }) {
  return (
    <input
      value={value}
      disabled={disabled}
      maxLength={16}
      aria-label={label}
      onChange={(e) => {
        const v = e.target.value.replace(/[^A-Za-z0-9_]/g, "");
        if (v === "" || VAR_RE.test(v)) onChange(v);
      }}
      onBlur={() => {
        if (!VAR_RE.test(value)) onChange("value");
      }}
      className={cn(numCls, "w-24 font-mono")}
    />
  );
}

/** A number, or (for knobs and sensors) a variable / maths like `level` or `knob / 4`. */
function ValueOrVar({ num, expr, onNum, onExpr, min, max, disabled, label, unit }: { num: number; expr?: string; onNum: (n: number) => void; onExpr: (e: string | undefined) => void; min: number; max: number; disabled?: boolean; label: string; unit: string }) {
  const useVar = expr !== undefined;
  return (
    <>
      {useVar ? (
        <input
          value={expr}
          disabled={disabled}
          maxLength={80}
          aria-label={`${label} (variable or maths)`}
          placeholder="level"
          onChange={(e) => onExpr(e.target.value.replace(/[^A-Za-z0-9_\s+\-*/%().,<>=!&|?:]/g, ""))}
          className={cn(numCls, "w-32 font-mono")}
        />
      ) : (
        <Num value={num} min={min} max={max} disabled={disabled} label={label} onChange={onNum} />
      )}
      <button type="button" disabled={disabled} onClick={() => onExpr(useVar ? undefined : "level")} className="rounded-lg border border-slate-200 dark:border-slate-700 px-1.5 h-8 text-[10px] font-semibold text-slate-600 dark:text-slate-300" title="Switch between a fixed number and a variable">
        {useVar ? "use number" : "use variable"}
      </button>
      <span className="text-[10px] text-slate-500">{unit}</span>
    </>
  );
}

function CondEditor({ cond, onChange, disabled }: { cond: Cond; onChange: (c: Cond) => void; disabled?: boolean }) {
  return (
    <>
      {cond.kind !== "expr" && <PinSelect value={cond.pin} disabled={disabled} onChange={(pin) => onChange({ ...cond, pin })} />}
      {cond.kind === "expr" && (
        <input
          value={cond.expr}
          disabled={disabled}
          maxLength={80}
          aria-label="Test, e.g. level > 300"
          placeholder="level > 300"
          onChange={(e) => onChange({ ...cond, expr: e.target.value.replace(/[^A-Za-z0-9_\s+\-*/%().,<>=!&|?:]/g, "") })}
          className={cn(numCls, "w-40 font-mono")}
        />
      )}
      <select
        value={cond.kind === "analog" ? `analog${cond.op}` : cond.kind}
        data-kind={cond.kind}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "expr") onChange({ kind: "expr", pin: 2, expr: "level > 300" });
          else if (v.startsWith("analog")) onChange({ kind: "analog", pin: cond.pin >= 14 ? cond.pin : 14, op: v.endsWith("<") ? "<" : ">", value: cond.kind === "analog" ? cond.value : 500 });
          else onChange({ kind: v as "pressed", pin: cond.kind === "analog" || cond.kind === "expr" ? 2 : cond.pin });
        }}
        className={sel}
        aria-label="Condition"
      >
        <option value="pressed">button pressed / switch ON</option>
        <option value="released">button released / switch OFF</option>
        <option value="high">is HIGH</option>
        <option value="low">is LOW</option>
        <option value="analog>">sensor is above</option>
        <option value="analog<">sensor is below</option>
        <option value="expr">variable test (e.g. level &gt; 300)</option>
      </select>
      {cond.kind === "analog" && <Num value={cond.value} min={0} max={1023} disabled={disabled} label="Sensor value" onChange={(value) => onChange({ ...cond, value })} />}
    </>
  );
}

const COLOR: Record<Block["type"], string> = {
  write: "border-l-amber-500",
  pwm: "border-l-orange-500",
  readAnalog: "border-l-fuchsia-500",
  set: "border-l-fuchsia-500",
  map: "border-l-fuchsia-500",
  wait: "border-l-sky-500",
  tone: "border-l-pink-500",
  noTone: "border-l-pink-500",
  servo: "border-l-violet-500",
  print: "border-l-slate-500",
  waitUntil: "border-l-sky-500",
  if: "border-l-emerald-500",
  repeat: "border-l-emerald-500",
};

function BlockRow({ block, onChange, onMove, onDelete, disabled }: { block: Block; onChange: (b: Block) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; disabled?: boolean }) {
  const text = "text-xs font-semibold text-slate-700 dark:text-slate-200";
  let body: React.ReactNode = null;
  switch (block.type) {
    case "write":
      body = (
        <>
          <span className={text}>Turn</span>
          <PinSelect value={block.pin} disabled={disabled} onChange={(pin) => onChange({ ...block, pin })} />
          <select value={block.value} disabled={disabled} onChange={(e) => onChange({ ...block, value: e.target.value as "HIGH" | "LOW" })} className={sel} aria-label="On or off">
            <option value="HIGH">ON</option>
            <option value="LOW">OFF</option>
          </select>
        </>
      );
      break;
    case "pwm":
      body = (
        <>
          <span className={text}>Set</span>
          <PinSelect value={block.pin} disabled={disabled} onChange={(pin) => onChange({ ...block, pin })} />
          <span className={text}>to power</span>
          <ValueOrVar num={block.value} expr={block.expr} min={0} max={255} disabled={disabled} label="Power 0 to 255" unit="0–255" onNum={(value) => onChange({ ...block, value })} onExpr={(expr) => onChange({ ...block, expr })} />
        </>
      );
      break;
    case "wait":
      body = (
        <>
          <span className={text}>Wait</span>
          <ValueOrVar num={block.ms} expr={block.expr} min={0} max={600000} disabled={disabled} label="Milliseconds" unit="ms" onNum={(ms) => onChange({ ...block, ms })} onExpr={(expr) => onChange({ ...block, expr })} />
        </>
      );
      break;
    case "tone":
      body = (
        <>
          <span className={text}>Play sound on</span>
          <PinSelect value={block.pin} disabled={disabled} onChange={(pin) => onChange({ ...block, pin })} />
          <ValueOrVar num={block.hz} expr={block.expr} min={20} max={20000} disabled={disabled} label="Hertz" unit="Hz" onNum={(hz) => onChange({ ...block, hz })} onExpr={(expr) => onChange({ ...block, expr })} />
        </>
      );
      break;
    case "noTone":
      body = (
        <>
          <span className={text}>Stop sound on</span>
          <PinSelect value={block.pin} disabled={disabled} onChange={(pin) => onChange({ ...block, pin })} />
        </>
      );
      break;
    case "servo":
      body = (
        <>
          <span className={text}>Turn servo on</span>
          <PinSelect value={block.pin} disabled={disabled} onChange={(pin) => onChange({ ...block, pin })} />
          <span className={text}>to</span>
          <ValueOrVar num={block.angle} expr={block.expr} min={0} max={180} disabled={disabled} label="Angle" unit="°" onNum={(angle) => onChange({ ...block, angle })} onExpr={(expr) => onChange({ ...block, expr })} />
        </>
      );
      break;
    case "readAnalog":
      body = (
        <>
          <span className={text}>Read</span>
          <PinSelect value={block.pin} disabled={disabled} onChange={(pin) => onChange({ ...block, pin })} />
          <span className={text}>(0–1023) into</span>
          <VarName value={block.name} disabled={disabled} onChange={(name) => onChange({ ...block, name })} />
        </>
      );
      break;
    case "set":
      body = (
        <>
          <span className={text}>Set</span>
          <VarName value={block.name} disabled={disabled} onChange={(name) => onChange({ ...block, name })} />
          <span className={text}>=</span>
          <input
            value={block.expr}
            disabled={disabled}
            maxLength={80}
            aria-label="Maths, e.g. knob / 4"
            onChange={(e) => onChange({ ...block, expr: e.target.value.replace(/[^A-Za-z0-9_\s+\-*/%().,<>=!&|?:]/g, "") })}
            className={cn(numCls, "w-40 font-mono")}
          />
        </>
      );
      break;
    case "map":
      body = (
        <>
          <span className={text}>Set</span>
          <VarName value={block.name} disabled={disabled} onChange={(name) => onChange({ ...block, name })} />
          <span className={text}>= rescale</span>
          <VarName value={block.src} disabled={disabled} label="Source variable" onChange={(src) => onChange({ ...block, src })} />
          <span className={text}>from</span>
          <Num value={block.inLow} min={-100000} max={100000} disabled={disabled} label="From low" onChange={(inLow) => onChange({ ...block, inLow })} />
          <span className="text-[10px] text-slate-500">–</span>
          <Num value={block.inHigh} min={-100000} max={100000} disabled={disabled} label="From high" onChange={(inHigh) => onChange({ ...block, inHigh })} />
          <span className={text}>to</span>
          <Num value={block.outLow} min={-100000} max={100000} disabled={disabled} label="To low" onChange={(outLow) => onChange({ ...block, outLow })} />
          <span className="text-[10px] text-slate-500">–</span>
          <Num value={block.outHigh} min={-100000} max={100000} disabled={disabled} label="To high" onChange={(outHigh) => onChange({ ...block, outHigh })} />
        </>
      );
      break;
    case "print":
      body = (
        <>
          <span className={text}>Print</span>
          <input value={block.text} disabled={disabled} maxLength={80} onChange={(e) => onChange({ ...block, text: e.target.value })} className={cn(numCls, "w-40")} aria-label="Message" />
        </>
      );
      break;
    case "waitUntil":
      body = (
        <>
          <span className={text}>Wait until</span>
          <CondEditor cond={block.cond} disabled={disabled} onChange={(cond) => onChange({ ...block, cond })} />
        </>
      );
      break;
    case "if":
      body = (
        <>
          <span className={text}>If</span>
          <CondEditor cond={block.cond} disabled={disabled} onChange={(cond) => onChange({ ...block, cond })} />
        </>
      );
      break;
    case "repeat":
      body = (
        <>
          <span className={text}>Repeat</span>
          <Num value={block.times} min={1} max={100} disabled={disabled} label="Times" onChange={(times) => onChange({ ...block, times })} />
          <span className="text-[10px] text-slate-500">times</span>
        </>
      );
      break;
  }
  return (
    <div className={cn("rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 bg-white/60 dark:bg-slate-900/60 p-2 space-y-1.5", COLOR[block.type])}>
      <div className="flex flex-wrap items-center gap-1.5">
        {body}
        {!disabled && (
          <span className="ml-auto flex items-center">
            <button type="button" aria-label="Move up" onClick={() => onMove(-1)} className="p-1 text-slate-400 hover:text-slate-700"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Move down" onClick={() => onMove(1)} className="p-1 text-slate-400 hover:text-slate-700"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Delete block" onClick={onDelete} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
          </span>
        )}
      </div>
      {block.type === "if" && (
        <div className="space-y-1.5 pl-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">then</p>
          <BlockList blocks={block.then} onChange={(then) => onChange({ ...block, then })} disabled={disabled} />
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">otherwise</p>
          <BlockList blocks={block.else} onChange={(els) => onChange({ ...block, else: els })} disabled={disabled} />
        </div>
      )}
      {block.type === "repeat" && (
        <div className="pl-2">
          <BlockList blocks={block.body} onChange={(body) => onChange({ ...block, body })} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

function BlockList({ blocks, onChange, disabled }: { blocks: Block[]; onChange: (b: Block[]) => void; disabled?: boolean }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) => (
        <BlockRow key={b.id} block={b} disabled={disabled} onChange={(nb) => onChange(blocks.map((x, k) => (k === i ? nb : x)))} onMove={(d) => move(i, d)} onDelete={() => onChange(blocks.filter((_, k) => k !== i))} />
      ))}
      {!disabled && (
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <Plus className="h-3.5 w-3.5" />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onChange([...blocks, newBlock(e.target.value as Block["type"])]);
            }}
            className={cn(sel, "max-w-[14rem]")}
            aria-label="Add a block"
          >
            <option value="">Add a block…</option>
            {BLOCK_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function BlockEditor({ program, onChange, readOnly }: { program: BlockProgram; onChange: (p: BlockProgram) => void; readOnly?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 space-y-1.5">
        <p className="text-xs font-extrabold text-amber-600">▶ When it starts (once)</p>
        <BlockList blocks={program.setup} disabled={readOnly} onChange={(setup) => onChange({ ...program, setup })} />
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 space-y-1.5">
        <p className="text-xs font-extrabold text-emerald-600">↻ Forever</p>
        <BlockList blocks={program.loop} disabled={readOnly} onChange={(loop) => onChange({ ...program, loop })} />
      </div>
      <p className="text-[11px] text-slate-500">Pins are set up for you. Button pins use pull-ups, so wire the button between the pin and GND. To dim an LED with a knob: Read A0 into knob → Rescale knob 0–1023 to 0–255 into level → Set pin to power “use variable” level.</p>
    </div>
  );
}
