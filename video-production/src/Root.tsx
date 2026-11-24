import React from "react";
import { Composition } from "remotion";
import { Proof } from "./Proof";
import { Film } from "./film/Film";
import { TOTAL_FRAMES, planFrames } from "./film/config";
import { FPS, sec } from "./theme";
import { Long, LONG_FRAMES } from "./film2/Long";

export const Root: React.FC = () => (
  <>
    <Composition id="Proof" component={Proof} durationInFrames={sec(8)} fps={FPS} width={1920} height={1080} />
    <Composition id="ProofVertical" component={Proof} durationInFrames={sec(8)} fps={FPS} width={1080} height={1920} />
    {/* the 60-second master: clean (no burned-in captions) and captioned, in both shapes */}
    <Composition id="Film" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ captions: false }} />
    <Composition id="FilmCaptioned" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ captions: true }} />
    <Composition id="FilmVertical" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{ captions: false }} />
    <Composition id="FilmVerticalCaptioned" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{ captions: true }} />
    {/* cutdowns: the same story re-edited, not sped up */}
    <Composition id="Film30" component={Film} durationInFrames={planFrames("30")} fps={FPS} width={1920} height={1080} defaultProps={{ captions: true, plan: "30" as const }} />
    <Composition id="Film30Vertical" component={Film} durationInFrames={planFrames("30")} fps={FPS} width={1080} height={1920} defaultProps={{ captions: true, plan: "30" as const }} />
    <Composition id="Film15" component={Film} durationInFrames={planFrames("15")} fps={FPS} width={1920} height={1080} defaultProps={{ captions: true, plan: "15" as const }} />
    <Composition id="Film15Vertical" component={Film} durationInFrames={planFrames("15")} fps={FPS} width={1080} height={1920} defaultProps={{ captions: true, plan: "15" as const }} />
    {/* the 2-minute film */}
    <Composition id="Long" component={Long} durationInFrames={LONG_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ captions: false }} />
    <Composition id="LongCaptioned" component={Long} durationInFrames={LONG_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ captions: true }} />
    <Composition id="LongVertical" component={Long} durationInFrames={LONG_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{ captions: false }} />
    <Composition id="LongVerticalCaptioned" component={Long} durationInFrames={LONG_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{ captions: true }} />
  </>
);
