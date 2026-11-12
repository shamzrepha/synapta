import { describe, expect, it } from "vitest";
import { playCuteVoice, playPageFlipSound, playPopSound, playPopUpHaulSound, playRopeSwingSound } from "./sfx";

describe("sfx audio effects", () => {
  it("exports safe sound functions that do not throw even in node/server environments", () => {
    expect(() => playPageFlipSound()).not.toThrow();
    expect(() => playRopeSwingSound()).not.toThrow();
    expect(() => playPopUpHaulSound()).not.toThrow();
    expect(() => playCuteVoice("happy")).not.toThrow();
    expect(() => playCuteVoice("curious")).not.toThrow();
    expect(() => playCuteVoice("cheer")).not.toThrow();
    expect(() => playPopSound()).not.toThrow();
  });
});
