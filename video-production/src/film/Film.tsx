import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color, font, sec } from "../theme";
import { PLANS, VO_DELAY, cues, type PlanId, type SceneDef } from "./config";
import { useLayout } from "./parts";
import { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11 } from "./scenes";

const SCENE_COMPONENTS = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11];

/** a short fade at each end of a scene, so cuts between scenes are soft but quick */
const Fade: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(interpolate(f, [0, 6], [0, 1], { extrapolateRight: "clamp" }), interpolate(f, [len - 8, len], [1, 0], { extrapolateLeft: "clamp" }));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const Captions: React.FC<{ plan: readonly SceneDef[] }> = ({ plan }) => {
  const f = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const now = f / 30;
  const cue = cues(plan).find((c) => now >= c.start && now < c.end);
  if (!cue) return null;
  return (
    <div style={{ position: "absolute", left: width * 0.07, width: vertical ? width * 0.86 : width * 0.5, top: vertical ? height * 0.25 : undefined, bottom: vertical ? undefined : height * 0.07, textAlign: "left" }}>
      <span style={{ fontFamily: font.sans, fontWeight: 500, fontSize: (vertical ? 40 : 34) * u, lineHeight: 1.25, color: "#fff", background: "rgba(7,9,20,0.78)", padding: `${6 * u}px ${12 * u}px`, borderRadius: 6 * u, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{cue.text}</span>
    </div>
  );
};

/** music ducks under the voice */
const musicVolume = (plan: readonly SceneDef[]) => (frame: number) => {
  const t = frame / 30;
  const end = plan.reduce((n, s) => n + s.len, 0);
  let v = 0.3;
  for (const s of plan) if (t >= s.at + VO_DELAY - 0.15 && t <= s.at + VO_DELAY + s.voLen + 0.25) v = 0.13;
  const fadeOut = interpolate(t, [end - 2.5, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return v * fadeOut;
};

export const Film: React.FC<{ captions?: boolean; voice?: boolean; music?: boolean; plan?: PlanId }> = ({ captions = false, voice = true, music = true, plan: planId = "60" }) => {
  const plan = PLANS[planId];
  return (
  <AbsoluteFill style={{ background: color.bg }}>
    {plan.map((s) => {
      const Scene = SCENE_COMPONENTS[s.scene - 1];
      return (
        <Sequence key={s.id} from={sec(s.at)} durationInFrames={sec(s.len)}>
          <Fade len={sec(s.len)}>
            <Scene />
          </Fade>
        </Sequence>
      );
    })}
    {captions && <Captions plan={plan} />}
    {voice && plan.map((s) => (
      <Sequence key={`vo${s.id}`} from={sec(s.at + VO_DELAY)}>
        <Audio src={staticFile(s.vo)} volume={1} />
      </Sequence>
    ))}
    {music && <Audio src={staticFile("vo/music.mp3")} volume={musicVolume(plan)} />}
  </AbsoluteFill>
  );
};
