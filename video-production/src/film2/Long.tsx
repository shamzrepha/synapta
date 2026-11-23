import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color, ease, font, sec } from "../theme";
import { LONG, LONG_SECONDS, LONG_VO_DELAY } from "./script";
import { End, N12, N13, N14, N3, N4, N5, N6, N7, N8, N9, SceneLen } from "./scenes2";
import { S1, S2, S7, S8 } from "../film/scenes";
import { useLayout } from "../film/parts";

const SCENES: Record<string, React.FC> = { S1, S2, S7, S8, N3, N4, N5, N6, N7, N8, N9, N12, N13, N14, S11: End };

/** how long a transition between two scenes lasts (frames); the outgoing scene stays on screen this long over the next one */
const TR = 16;
type Kind = "push" | "iris" | "zoom" | "wipe" | "rise" | "split";
const KINDS: Kind[] = ["push", "iris", "zoom", "wipe", "rise", "split", "iris", "push", "wipe", "zoom", "rise", "split", "iris", "push"];

/** the incoming scene's style for the transition into it */
const enterStyle = (kind: Kind, p: number, w: number, h: number): React.CSSProperties => {
  const e = ease(p);
  switch (kind) {
    case "push": return { transform: `translateX(${(1 - e) * w}px)` };
    case "iris": return { clipPath: `circle(${e * 80}% at 50% 56%)` };
    case "zoom": return { opacity: e, transform: `scale(${0.88 + e * 0.12})` };
    case "wipe": return { clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` };
    case "rise": return { transform: `translateY(${(1 - e) * h}px)` };
    case "split": return { clipPath: `polygon(0 0, ${e * 100}% 0, ${Math.max(0, e * 100 - 22)}% 100%, 0 100%)` };
  }
};
/** the outgoing scene's style while the next one covers it */
const exitStyle = (kind: Kind, p: number, w: number, h: number): React.CSSProperties => {
  const e = ease(p);
  switch (kind) {
    case "push": return { transform: `translateX(${-e * w * 0.35}px)`, opacity: 1 - e * 0.5 };
    case "iris": return { transform: `scale(${1 + e * 0.04})` };
    case "zoom": return { opacity: 1 - e, transform: `scale(${1 + e * 0.2})` };
    case "wipe": return { transform: `translateX(${-e * w * 0.08}px)` };
    case "rise": return { transform: `translateY(${-e * h * 0.3}px)`, opacity: 1 - e * 0.6 };
    case "split": return { opacity: 1 - e * 0.7 };
  }
};

const Layer: React.FC<{ index: number; children: React.ReactNode }> = ({ index, children }) => {
  const f = useCurrentFrame();
  const { width, height } = useLayout();
  const len = sec(LONG[index].len);
  const inKind = index === 0 ? null : KINDS[(index - 1) % KINDS.length];
  const outKind = index === LONG.length - 1 ? null : KINDS[index % KINDS.length];
  let style: React.CSSProperties = {};
  if (inKind && f < TR) style = { ...style, ...enterStyle(inKind, f / TR, width, height) };
  if (outKind && f >= len) style = { ...style, ...exitStyle(outKind, Math.min(1, (f - len) / TR), width, height) };
  if (!inKind && f < 6) style = { opacity: f / 6 };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const now = f / 30;
  // one caption per sentence, shared across the length of the voice
  let cue: string | null = null;
  for (const s of LONG) {
    const start = s.at + LONG_VO_DELAY;
    if (now < start || now > start + s.voLen) continue;
    const parts = s.text.split(/(?<=[.?!])\s+/);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let cur = start;
    for (const p of parts) {
      const d = (p.length / total) * s.voLen;
      if (now >= cur && now < cur + d) cue = p;
      cur += d;
    }
  }
  if (!cue) return null;
  return (
    <div style={{ position: "absolute", left: width * 0.07, width: vertical ? width * 0.86 : width * 0.5, top: vertical ? height * 0.25 : undefined, bottom: vertical ? undefined : height * 0.07 }}>
      <span style={{ fontFamily: font.sans, fontWeight: 500, fontSize: (vertical ? 40 : 34) * u, lineHeight: 1.25, color: "#fff", background: "rgba(7,9,20,0.78)", padding: `${6 * u}px ${12 * u}px`, borderRadius: 6 * u, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{cue}</span>
    </div>
  );
};

const musicVolume = (frame: number) => {
  const t = frame / 30;
  let v = 0.3;
  for (const s of LONG) if (t >= s.at + LONG_VO_DELAY - 0.15 && t <= s.at + LONG_VO_DELAY + s.voLen + 0.25) v = 0.12;
  return v * interpolate(t, [LONG_SECONDS - 3, LONG_SECONDS], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

export const LONG_FRAMES = sec(LONG_SECONDS);

export const Long: React.FC<{ captions?: boolean }> = ({ captions = false }) => (
  <AbsoluteFill style={{ background: color.bg }}>
    {LONG.map((s, i) => {
      const Scene = SCENES[s.scene];
      const extra = i === LONG.length - 1 ? 0 : TR;
      return (
        <Sequence key={s.id} from={sec(s.at)} durationInFrames={sec(s.len) + extra}>
          <SceneLen.Provider value={sec(s.len)}>
            <Layer index={i}>
              <Scene />
            </Layer>
          </SceneLen.Provider>
        </Sequence>
      );
    })}
    {captions && <Captions />}
    {LONG.map((s) => (
      <Sequence key={`vo${s.id}`} from={sec(s.at + LONG_VO_DELAY)}>
        <Audio src={staticFile(s.vo)} volume={1} />
      </Sequence>
    ))}
    <Audio src={staticFile("vo/music-long.mp3")} volume={musicVolume} />
  </AbsoluteFill>
);
