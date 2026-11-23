import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { color, ease, easeInOut, font } from "../theme";

export const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Responsive layout from the shorter side, so 16:9 and 9:16 are composed, not cropped. */
export const useLayout = () => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const u = Math.min(width, height) / 1080;
  // where the phone sits and how big it is
  const phoneH = vertical ? height * 0.67 : height * 0.86;
  const phoneW = phoneH * (780 / 1688);
  const phoneX = vertical ? width / 2 : width * 0.74;
  const phoneY = vertical ? height * 0.655 : height * 0.5;
  return { width, height, vertical, u, phoneH, phoneW, phoneX, phoneY };
};

export const Label: React.FC<{ children: React.ReactNode; at?: number; tone?: "brand" | "coral" | "good" }> = ({ children, at = 4, tone = "brand" }) => {
  const f = useCurrentFrame();
  const { u } = useLayout();
  const t = interpolate(f, [at, at + 14], [0, 1], { easing: ease, ...clampOpts });
  const c = tone === "coral" ? color.coral : tone === "good" ? color.good : color.brandPale;
  return (
    <div style={{ fontFamily: font.mono, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 24 * u, color: c, opacity: t, transform: `translateY(${(1 - t) * 14 * u}px)` }}>
      {children}
    </div>
  );
};

export const Headline: React.FC<{ lead: string; accent?: string; tail?: string; at?: number; size?: number; maxW?: number }> = ({ lead, accent, tail = "", at = 10, size = 84, maxW }) => {
  const f = useCurrentFrame();
  const { u, vertical, width } = useLayout();
  const t = interpolate(f, [at, at + 20], [0, 1], { easing: ease, ...clampOpts });
  return (
    <div style={{ fontFamily: font.sans, fontWeight: 500, fontSize: size * u * (vertical ? 1.05 : 1), lineHeight: 1.05, letterSpacing: "-0.03em", color: color.text, maxWidth: maxW ?? width * (vertical ? 0.86 : 0.5), opacity: t, transform: `translateY(${(1 - t) * 24 * u}px)`, textShadow: "0 2px 24px rgba(7,9,20,0.8)" }}>
      {lead}
      {accent ? <> <span style={{ fontFamily: font.serif, fontStyle: "italic", fontWeight: 400, color: color.brandPale }}>{accent}</span></> : null}
      {tail}
    </div>
  );
};

/** The text block that sits top-left in landscape and top in vertical. */
export const TextBlock: React.FC<{ label: string; tone?: "brand" | "coral" | "good"; children: React.ReactNode }> = ({ label, tone, children }) => {
  const { width, height, vertical, u } = useLayout();
  return (
    <div style={{ position: "absolute", left: width * 0.07, top: vertical ? height * 0.06 : height * 0.14, display: "flex", flexDirection: "column", gap: 18 * u }}>
      <Label tone={tone}>{label}</Label>
      {children}
    </div>
  );
};

/** A phone showing real captured Sunroot footage or a real screenshot. Nothing inside it is redrawn. */
export const Phone: React.FC<{ children: React.ReactNode; enter?: number; scale?: number; tilt?: number }> = ({ children, enter = 0, scale = 1, tilt = 0 }) => {
  const f = useCurrentFrame();
  const { phoneH, phoneW, phoneX, phoneY, u, vertical, height } = useLayout();
  const t = interpolate(f, [enter, enter + 22], [0, 1], { easing: ease, ...clampOpts });
  const slide = (1 - t) * (vertical ? height * 0.25 : 160 * u);
  return (
    <div style={{ position: "absolute", left: phoneX - phoneW / 2, top: phoneY - phoneH / 2 + (vertical ? slide : 0), width: phoneW, height: phoneH, opacity: t, transform: `translateX(${vertical ? 0 : slide}px) scale(${scale}) rotate(${tilt}deg)`, transformOrigin: "50% 60%" }}>
      <div style={{ position: "absolute", inset: -10 * u, borderRadius: 54 * u, background: "#05070f", boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.6), 0 0 0 ${2 * u}px #20283f` }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 44 * u, overflow: "hidden", background: "#fff" }}>{children}</div>
    </div>
  );
};

/** real footage, filling the phone */
export const Clip: React.FC<{ src: string; start?: number; rate?: number }> = ({ src, start = 0, rate = 1 }) => (
  <OffthreadVideo src={staticFile(src)} startFrom={Math.round(start * 30)} playbackRate={rate} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
);

/** a real screenshot with a slow vertical pan and a slight push, so a still reads as a camera move */
export const Still: React.FC<{ src: string; from?: number; to?: number; dur: number; zoom?: [number, number] }> = ({ src, from = 0, to = 0, dur, zoom = [1, 1.04] }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, dur], [0, 1], { easing: easeInOut, ...clampOpts });
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ width: "100%", display: "block", transform: `translateY(${(from + (to - from) * p).toFixed(2)}%) scale(${zoom[0] + (zoom[1] - zoom[0]) * p})`, transformOrigin: "50% 0%" }} />
    </div>
  );
};

/** a finger tap on the phone: a soft ring that opens and fades */
export const Tap: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const f = useCurrentFrame();
  const { phoneW, phoneH, u } = useLayout();
  const t = interpolate(f, [at, at + 16], [0, 1], { ...clampOpts });
  if (f < at || f > at + 18) return null;
  return (
    <div style={{ position: "absolute", left: x * phoneW - 30 * u, top: y * phoneH - 30 * u, width: 60 * u, height: 60 * u, borderRadius: "50%", border: `${3 * u}px solid ${color.brandPale}`, background: `${color.brand}33`, opacity: 1 - t, transform: `scale(${0.6 + t * 1.2})`, pointerEvents: "none" }} />
  );
};

/** a vector tag that points at part of the phone */
export const Callout: React.FC<{ at: number; text: string; x: number; y: number; side?: "left" | "right" }> = ({ at, text, x, y, side = "left" }) => {
  const f = useCurrentFrame();
  const { u } = useLayout();
  const t = interpolate(f, [at, at + 14], [0, 1], { easing: ease, ...clampOpts });
  const w = 150 * u;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: t, transform: `translateX(${(side === "left" ? -1 : 1) * (1 - t) * 20 * u}px)`, display: "flex", alignItems: "center", gap: 10 * u, flexDirection: side === "left" ? "row-reverse" : "row" }}>
      <div style={{ width: w * t * 0.5, height: 2 * u, background: color.brandSoft }} />
      <div style={{ fontFamily: font.mono, fontWeight: 500, fontSize: 21 * u, letterSpacing: "0.16em", textTransform: "uppercase", color: color.text, background: color.card, border: `${1.5 * u}px solid ${color.brandSoft}`, borderRadius: 6 * u, padding: `${8 * u}px ${14 * u}px`, whiteSpace: "nowrap" }}>{text}</div>
    </div>
  );
};

/** Sprout, drawn as a still vector pose (the same character as the app's). He guides; he is small. */
export const SproutMark: React.FC<{ size: number; look?: number }> = ({ size, look = 0 }) => (
  <svg width={size} height={size * 1.12} viewBox="0 0 100 112">
    <ellipse cx="50" cy="104" rx="26" ry="5" fill="rgba(15,23,42,0.25)" />
    <path d="M50 36 C50 26 49 20 47 14" stroke="#0d9488" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <path d="M47 15 C36 8 28 13 27 21 C36 24 44 22 47 15 Z" fill="#14b8a6" />
    <path d="M48 16 C58 6 70 9 72 18 C62 22 52 21 48 16 Z" fill="#0d9488" />
    <rect x="14" y="62" width="14" height="9" rx="4.5" fill="#2f5fe0" />
    <rect x="72" y="62" width="14" height="9" rx="4.5" fill="#2f5fe0" />
    <rect x="22" y="34" width="56" height="62" rx="26" fill="#3b6df6" />
    <rect x="28" y="42" width="44" height="34" rx="15" fill="#eef3ff" />
    <ellipse cx={41 + look} cy="58" rx="4.6" ry="5.4" fill="#0f172a" />
    <ellipse cx={59 + look} cy="58" rx="4.6" ry="5.4" fill="#0f172a" />
    <circle cx={42.6 + look} cy="56" r="1.5" fill="#fff" />
    <circle cx={60.6 + look} cy="56" r="1.5" fill="#fff" />
    <circle cx="35" cy="66" r="3.4" fill="#fda4af" opacity="0.6" />
    <circle cx="65" cy="66" r="3.4" fill="#fda4af" opacity="0.6" />
    <path d="M44 67 Q50 72 56 67" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    <ellipse cx="38" cy="97" rx="9" ry="5" fill="#2f5fe0" />
    <ellipse cx="62" cy="97" rx="9" ry="5" fill="#2f5fe0" />
  </svg>
);

/** notebook page, drawn from vector shapes */
export const NotePage: React.FC<{ seed: string; w: number; h: number; lines?: number }> = ({ seed, w, h, lines = 13 }) => {
  const rows = Array.from({ length: lines }, (_, i) => i);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <rect width={w} height={h} rx={6} fill={color.paper} />
      <line x1={w * 0.075} y1={0} x2={w * 0.075} y2={h} stroke="#E9A9A0" strokeWidth={1.5} opacity={0.7} />
      {rows.map((i) => {
        const y = ((i + 1.4) / (lines + 1)) * h;
        const len = 0.45 + random(`${seed}-len-${i}`) * 0.5;
        const steps = Math.floor(len * 18);
        let d = `M ${w * 0.1} ${y}`;
        for (let s = 1; s <= steps; s++) d += ` L ${w * 0.1 + (s / steps) * w * 0.8 * len} ${y + (random(`${seed}-j-${i}-${s}`) - 0.5) * h * 0.022}`;
        return (
          <g key={i}>
            <line x1={0} y1={y + h * 0.012} x2={w} y2={y + h * 0.012} stroke={color.paperLine} strokeWidth={1.2} />
            <path d={d} fill="none" stroke={color.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          </g>
        );
      })}
    </svg>
  );
};

export const Backdrop: React.FC<{ glowX?: number; glowY?: number }> = ({ glowX = 70, glowY = 50 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 70% at ${glowX}% ${glowY}%, #1B2140 0%, ${color.bg} 58%, ${color.bgDeep} 100%)` }} />
);
