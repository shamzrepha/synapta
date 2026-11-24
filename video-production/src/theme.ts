import { Easing } from "remotion";
import { continueRender, delayRender, staticFile } from "remotion";

/** One place for every colour, font, easing and timing value, so the whole film can be restyled from here. */
export const FPS = 30;

export const color = {
  bg: "#0B0E1A",
  bgDeep: "#070914",
  card: "#121629",
  hairline: "#1F2538",
  text: "#E7EAF5",
  muted: "#98A1BB",
  brand: "#4A6CF7",
  brandSoft: "#6F8DFF",
  brandPale: "#C5D3FF",
  paper: "#F4F1E8",
  paperLine: "#BFD0F5",
  ink: "#2A3350",
  lamp: "#FFD9A0",
  /** gold is reserved for rewards, so it is not used in this proof */
  gold: "#F5B83A",
  coral: "#FF7A66",
  good: "#3DDC97",
};

/**
 * Fonts are shipped with the project (public/fonts, all SIL Open Font License) so a render never depends on a network.
 * Instrument Sans is a variable font, so one file covers every weight.
 */
const FACES = [
  { family: "Instrument Sans", file: "sans-normal-500.woff2", weight: "400 700", style: "normal" },
  { family: "Instrument Serif", file: "serif-italic-400.woff2", weight: "400", style: "italic" },
  { family: "IBM Plex Mono", file: "mono-normal-500.woff2", weight: "500", style: "normal" },
] as const;

if (typeof document !== "undefined") {
  const handle = delayRender("Loading Sunroot fonts");
  Promise.all(
    FACES.map((f) =>
      new FontFace(f.family, `url(${staticFile("fonts/" + f.file)})`, { weight: f.weight, style: f.style })
        .load()
        .then((face) => document.fonts.add(face)),
    ),
  )
    .catch(() => null)
    .finally(() => continueRender(handle));
}

export const font = {
  sans: '"Instrument Sans", system-ui, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

/** the single primary easing curve (matches the app's) */
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

export const sec = (s: number) => Math.round(s * FPS);
