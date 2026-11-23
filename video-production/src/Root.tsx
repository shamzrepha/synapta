import React from "react";
import { Composition } from "remotion";
import { Proof } from "./Proof";
import { FPS, sec } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="Proof" component={Proof} durationInFrames={sec(8)} fps={FPS} width={1920} height={1080} />
    <Composition id="ProofVertical" component={Proof} durationInFrames={sec(8)} fps={FPS} width={1080} height={1920} />
  </>
);
