import React from "react";
import { AbsoluteFill, Sequence, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { color, ease, easeInOut, font, sec } from "./theme";

/** A responsive unit: layouts are computed from the shorter side so 16:9 and 9:16 are composed, not cropped. */
const useLayout = () => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const u = Math.min(width, height) / 1080; // 1 at the design size
  return { width, height, vertical, u };
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** A page of lecture notes: ruled lines and a few lines of handwriting-like marks, drawn from vector shapes. */
const Page: React.FC<{ seed: string; w: number; h: number }> = ({ seed, w, h }) => {
  const lines = 13;
  const scribbles = Array.from({ length: lines }, (_, i) => {
    const len = 0.45 + random(`${seed}-len-${i}`) * 0.5;
    const y = ((i + 1.4) / (lines + 1)) * h;
    let d = `M ${w * 0.1} ${y}`;
    const steps = Math.floor(len * 18);
    for (let s = 1; s <= steps; s++) {
      const x = w * 0.1 + (s / steps) * w * 0.8 * len;
      d += ` L ${x} ${y + (random(`${seed}-j-${i}-${s}`) - 0.5) * h * 0.022}`;
    }
    return d;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <rect width={w} height={h} rx={6} fill={color.paper} />
      <line x1={w * 0.075} y1={0} x2={w * 0.075} y2={h} stroke="#E9A9A0" strokeWidth={1.5} opacity={0.7} />
      {scribbles.map((d, i) => (
        <g key={i}>
          <line x1={0} y1={((i + 1.4) / (lines + 1)) * h + h * 0.012} x2={w} y2={((i + 1.4) / (lines + 1)) * h + h * 0.012} stroke={color.paperLine} strokeWidth={1.2} />
          <path d={d} fill="none" stroke={color.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        </g>
      ))}
    </svg>
  );
};

/** Scene 1: pages slide in and multiply into a tall, slightly absurd stack under a lamp. */
const DeskScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { vertical, u, width, height } = useLayout();
  const PAGES = 16;
  const pw = (vertical ? 560 : 400) * u;
  const ph = pw * 1.32;
  const cx = vertical ? width / 2 : width * 0.7;
  const cy = height * (vertical ? 0.58 : 0.55);

  const push = interpolate(frame, [0, sec(5)], [1, 1.14], { easing: easeInOut, ...clamp });
  const lift = interpolate(frame, [0, sec(5)], [0, -40 * u], { easing: easeInOut, ...clamp });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at ${vertical ? 50 : 66}% ${vertical ? 56 : 52}%, #1B2140 0%, ${color.bg} 55%, ${color.bgDeep} 100%)` }}>
      {/* the pool of lamp light: still, so nothing flickers */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${vertical ? 50 : 66}% ${vertical ? 52 : 48}%, ${color.lamp}2E 0%, ${color.lamp}12 28%, transparent 56%)` }} />
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push}) translateY(${lift}px)`, transformOrigin: "50% 60%" }}>
        {Array.from({ length: PAGES }, (_, i) => {
          const start = 6 + i * 4.2;
          const t = interpolate(frame, [start, start + 18], [0, 1], { easing: ease, ...clamp });
          const fromSide = i % 2 === 0 ? -1 : 1;
          const rot = (random(`rot-${i}`) - 0.5) * 9;
          const dx = (random(`dx-${i}`) - 0.5) * 36 * u;
          const stackY = -i * 13 * u;
          const x = cx - pw / 2 + dx + (1 - t) * fromSide * (width * 0.7);
          const y = cy - ph / 2 + stackY + (1 - t) * 60 * u;
          return (
            <div key={i} style={{ position: "absolute", left: x, top: y, width: pw, height: ph, transform: `rotate(${rot * t + (1 - t) * fromSide * 14}deg)`, opacity: t, boxShadow: `0 ${10 * u}px ${28 * u}px rgba(0,0,0,0.45)`, borderRadius: 6 }}>
              <Page seed={`p${i}`} w={pw} h={ph} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Label: React.FC<{ children: React.ReactNode; at: number; style?: React.CSSProperties }> = ({ children, at, style }) => {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const t = interpolate(frame, [at, at + 14], [0, 1], { easing: ease, ...clamp });
  return (
    <div style={{ fontFamily: font.mono, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 26 * u, color: color.brandPale, opacity: t, transform: `translateY(${(1 - t) * 14 * u}px)`, ...style }}>
      {children}
    </div>
  );
};

const Headline: React.FC<{ lead: string; accent: string; tail?: string; at: number; out?: number }> = ({ lead, accent, tail = "", at, out }) => {
  const frame = useCurrentFrame();
  const { u, vertical, width } = useLayout();
  const tIn = interpolate(frame, [at, at + 20], [0, 1], { easing: ease, ...clamp });
  const tOut = out === undefined ? 1 : interpolate(frame, [out, out + 14], [1, 0], { easing: ease, ...clamp });
  const size = (vertical ? 96 : 92) * u;
  return (
    <div style={{ fontFamily: font.sans, fontWeight: 500, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.03em", color: color.text, maxWidth: width * (vertical ? 0.86 : 0.5), opacity: tIn * tOut, transform: `translateY(${(1 - tIn) * 26 * u}px)`, textShadow: "0 2px 24px rgba(7,9,20,0.8)" }}>
      {lead} <span style={{ fontFamily: font.serif, fontStyle: "italic", fontWeight: 400, color: color.brandPale }}>{accent}</span>
      {tail}
    </div>
  );
};

/** Scene 2: the page becomes a path. Ruled lines lift off the paper and join the five steps of the learning loop. */
const PathScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { vertical, u, width, height } = useLayout();
  const t0 = 0;
  const steps = ["Capture", "Understand", "Retrieve", "Correct", "Revisit"];
  const pts = steps.map((_, i) => {
    const k = i / (steps.length - 1);
    return vertical
      ? { x: width * (0.22 + 0.56 * (i % 2 === 0 ? 0.15 : 0.85)) , y: height * (0.3 + 0.5 * k) }
      : { x: width * (0.12 + 0.76 * k), y: height * (0.66 - 0.18 * Math.sin(k * Math.PI * 1.15) + (i % 2 === 0 ? 0.03 : -0.03)) };
  });
  // a smooth path through the points
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    d += vertical ? ` C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}` : ` C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`;
  }
  const draw = interpolate(frame, [t0 + 8, t0 + 70], [0, 1], { easing: easeInOut, ...clamp });
  const bg = interpolate(frame, [0, 20], [0, 1], { ...clamp });
  const LEN = 4000;
  // faint ruled lines that the path rises out of
  const rules = Array.from({ length: 14 }, (_, i) => i);
  return (
    <AbsoluteFill style={{ background: color.bg, opacity: bg }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {rules.map((i) => {
          const y = (i + 1) * (height / 15);
          const fade = interpolate(frame, [10, 60], [0.5, 0.06], { ...clamp });
          return <line key={i} x1={0} x2={width} y1={y} y2={y} stroke={color.paperLine} strokeWidth={1.5 * u} opacity={fade} />;
        })}
        <path d={d} fill="none" stroke={color.brand} strokeWidth={10 * u} strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} opacity={0.95} />
        <path d={d} fill="none" stroke={color.brandPale} strokeWidth={3 * u} strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} opacity={0.9} />
        {pts.map((p, i) => {
          const at = t0 + 14 + i * 12;
          const s = interpolate(frame, [at, at + 16], [0, 1], { easing: ease, ...clamp });
          return (
            <g key={i} transform={`translate(${p.x} ${p.y}) scale(${s})`}>
              <circle r={26 * u} fill={color.card} stroke={color.brandSoft} strokeWidth={4 * u} />
              <circle r={9 * u} fill={color.brandPale} />
            </g>
          );
        })}
      </svg>
      {pts.map((p, i) => {
        const at = t0 + 18 + i * 12;
        const o = interpolate(frame, [at, at + 14], [0, 1], { easing: ease, ...clamp });
        return (
          <div key={i} style={{ position: "absolute", left: vertical ? (i % 2 === 0 ? p.x + 44 * u : p.x - 44 * u) : p.x, top: vertical ? p.y - 14 * u : p.y + 44 * u, transform: vertical ? (i % 2 === 0 ? "none" : "translateX(-100%)") : "translateX(-50%)", fontFamily: font.mono, fontWeight: 500, fontSize: 24 * u, letterSpacing: "0.16em", textTransform: "uppercase", color: color.text, opacity: o, whiteSpace: "nowrap" }}>
            {steps[i]}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: width * (vertical ? 0.07 : 0.07), top: height * (vertical ? 0.07 : 0.1), opacity: 1 }}>
        <Label at={4}>The page becomes a path</Label>
        <div style={{ height: 18 * u }} />
        <Headline lead="Your notes are the" accent="beginning." at={10} />
      </div>
    </AbsoluteFill>
  );
};

/**
 * Checkpoint B: a short proof of style (8 s). Scene 1 is the opening of the film; scene 2 is the "page becomes path" motif
 * that carries the rest of it. Everything is vector, so it renders crisp at any size. Product screens are NOT shown here.
 */
export const Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const { u, vertical, width, height } = useLayout();
  const sceneA = frame < sec(5.0);
  const crossIn = interpolate(frame, [sec(4.4), sec(5.2)], [0, 1], { easing: easeInOut, ...clamp });
  return (
    <AbsoluteFill style={{ background: color.bg }}>
      <DeskScene />
      {/* scene 1 type */}
      {sceneA && (
        <div style={{ position: "absolute", left: width * 0.07, top: vertical ? height * 0.07 : height * 0.13 }}>
          <Label at={10}>First week. Big notes.</Label>
          <div style={{ height: 18 * u }} />
          <Headline lead="The notes are already doing" accent="too much." at={22} out={sec(4.5)} />
        </div>
      )}
      {/* scene 2 */}
      <AbsoluteFill style={{ opacity: crossIn }}>
        <Sequence from={sec(4.4)} layout="none">
          <PathScene />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
