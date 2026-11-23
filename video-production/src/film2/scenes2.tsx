import React, { createContext, useContext } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color, ease, easeInOut, font, sec } from "../theme";
import { Backdrop, Callout, Clip, Headline, Phone, SproutMark, Still, Tap, TextBlock, clampOpts, useLayout } from "../film/parts";

const c = clampOpts;

/** how long (in frames) the scene on screen lasts, so a scene can pace itself */
export const SceneLen = createContext(150);
const useLen = () => useContext(SceneLen);

/* ---------- 3. what you actually remember: the exam is coming ---------- */
export const N3: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const { width, height, vertical, u } = useLayout();
  const cols = 7;
  const rows = 3;
  const cell = (vertical ? 110 : 120) * u;
  const gx = vertical ? width / 2 - (cols * (cell + 10 * u)) / 2 : width * 0.52;
  const gy = vertical ? height * 0.52 : height * 0.3;
  const total = cols * rows;
  // days tick off one by one until only the exam is left
  const done = Math.floor(interpolate(f, [20, len - 40], [0, total - 1], { easing: easeInOut, ...c }));
  const q = interpolate(f, [len * 0.55, len * 0.55 + 16], [0, 1], { easing: ease, ...c });
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label="Exam week" tone="coral">
        <Headline lead="What do you actually" accent="remember?" at={8} size={76} />
      </TextBlock>
      <div style={{ position: "absolute", left: gx, top: gy, display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap: 10 * u }}>
        {Array.from({ length: total }, (_, i) => {
          const last = i === total - 1;
          const passed = i < done;
          return (
            <div key={i} style={{ height: cell * 0.9, borderRadius: 8 * u, border: `${2 * u}px solid ${last ? color.coral : color.hairline}`, background: passed ? "#0F1424" : color.card, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, fontSize: 20 * u, letterSpacing: "0.12em", color: last ? color.coral : passed ? "#3a4263" : color.muted }}>
              {last ? "EXAM" : passed ? "" : String(i + 1)}
              {passed && <svg width={cell * 0.4} height={cell * 0.4} viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" stroke="#3a4263" strokeWidth="2" strokeLinecap="round" /></svg>}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: gx, top: gy + rows * (cell * 0.9 + 10 * u) + 24 * u, opacity: q, fontFamily: font.serif, fontStyle: "italic", fontSize: 54 * u, color: color.brandPale }}>
        What do I know? What don&apos;t I?
      </div>
    </AbsoluteFill>
  );
};

/* ---------- 4. that's why we built Sunroot ---------- */
export const N4: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const t = (a: number) => interpolate(f, [a, a + 18], [0, 1], { easing: ease, ...c });
  const drift = interpolate(f, [0, 200], [0, 1], c);
  const files = ["PDF", "SLIDES", "PHOTO", "NOTES"];
  return (
    <AbsoluteFill>
      <Backdrop glowX={50} glowY={48} />
      {/* the material you already have, gathering into one place */}
      {files.map((name, i) => {
        const a = (i / files.length) * Math.PI * 2 + 0.6;
        const rad = (vertical ? 330 : 380) * u * (1 - Math.min(1, drift * 1.6) * 0.62);
        const x = width / 2 + Math.cos(a) * rad * (vertical ? 0.9 : 1.5);
        const y = height * (vertical ? 0.52 : 0.5) + Math.sin(a) * rad * (vertical ? 1.3 : 0.7);
        return (
          <div key={name} style={{ position: "absolute", left: x - 70 * u, top: y - 34 * u, width: 140 * u, height: 68 * u, borderRadius: 8 * u, background: color.paper, color: color.ink, fontFamily: font.mono, fontSize: 22 * u, letterSpacing: "0.16em", display: "flex", alignItems: "center", justifyContent: "center", opacity: t(6 + i * 4) * (1 - t(34)), boxShadow: "0 14px 34px rgba(0,0,0,0.45)", transform: `rotate(${(i - 1.5) * 4}deg)` }}>
            {name}
          </div>
        );
      })}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 * u, textAlign: "center" }}>
        <div style={{ opacity: t(30), transform: `scale(${0.85 + t(30) * 0.15})` }}>
          <img src={staticFile("brand/logo-mark.svg")} width={150 * u} height={150 * u} alt="" />
        </div>
        <div style={{ opacity: t(44), fontFamily: font.sans, fontWeight: 500, fontSize: 120 * u, letterSpacing: "-0.04em", color: color.text, lineHeight: 1 }}>Sunroot</div>
        <div style={{ opacity: t(62), fontFamily: font.mono, fontSize: 24 * u, letterSpacing: "0.18em", textTransform: "uppercase", color: color.brandPale }}>Your material, turned into learning</div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- 5. your lecturer's class is already there ---------- */
export const N5: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const { phoneX, phoneY, phoneW, phoneH, vertical, u } = useLayout();
  const split = Math.round(len * 0.42);
  const px = phoneX - phoneW / 2;
  const py = phoneY - phoneH / 2;
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={f < split ? "Find your class" : "Ready to read"}>
        <Headline lead="Your class might already be" accent="there." at={8} size={74} />
      </TextBlock>
      <Phone enter={0}>
        {f < split ? <Still src="capture/still-explore.png" dur={split} from={0} to={-2} zoom={[1, 1.04]} /> : <Clip src="capture/class-offer.mp4" start={0} />}
        <Tap at={Math.round(split * 0.78)} x={0.84} y={0.8} />
      </Phone>
      {!vertical && f >= split && (
        <>
          <Callout at={split + 10} text="17 chapters" x={px - 250 * u} y={py + phoneH * 0.42} side="left" />
          <Callout at={split + 26} text="Chapter by chapter" x={px - 380 * u} y={py + phoneH * 0.52} side="left" />
        </>
      )}
    </AbsoluteFill>
  );
};

/* ---------- 6. read along: every word lights, Sprout moves with it ---------- */
export const N6: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <TextBlock label="Read along">
      <Headline lead="Every word lights up. Sprout" accent="follows." at={8} size={74} />
    </TextBlock>
    <Phone enter={0}>
      <Clip src="capture/class-read.mp4" start={0} />
    </Phone>
  </AbsoluteFill>
);

/* ---------- 7. ask the tutor, or tap Teach me ---------- */
export const N7: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const split = Math.round(len * 0.45);
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={f < split ? "Ask the tutor" : "Teach me"}>
        <Headline lead="Stuck on an idea?" accent="Ask." at={8} size={80} />
      </TextBlock>
      <Phone enter={0}>{f < split ? <Clip src="capture/tutor.mp4" start={0.2} /> : <Clip src="capture/teach.mp4" start={0.3} />}</Phone>
    </AbsoluteFill>
  );
};

/* ---------- 8. bring your own material ---------- */
export const N8: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const { phoneX, phoneY, phoneW, phoneH, vertical, u } = useLayout();
  const split = Math.round(len * 0.4);
  const px = phoneX - phoneW / 2;
  const py = phoneY - phoneH / 2;
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={f < split ? "Add your material" : "Clean study notes"}>
        <Headline lead="Nothing set up? Bring your" accent="own." at={8} size={74} />
      </TextBlock>
      <Phone enter={0}>
        {f < split ? <Clip src="capture/add.mp4" start={0.4} /> : <Still src="capture/still-notes-result.png" from={0} to={-6} dur={len - split} zoom={[1, 1.03]} />}
      </Phone>
      {!vertical && f >= split && (
        <>
          <Callout at={split + 14} text="Page by page" x={px - 260 * u} y={py + phoneH * 0.5} side="left" />
          <Callout at={split + 34} text="Overview first" x={px - 280 * u} y={py + phoneH * 0.66} side="left" />
          <Callout at={split + 54} text="Quiz, flashcards" x={px - 360 * u} y={py + phoneH * 0.37} side="left" />
        </>
      )}
    </AbsoluteFill>
  );
};

/* ---------- 9. retrieve: quiz, flashcards, written ---------- */
export const N9: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const a = Math.round(len * 0.45);
  const b = Math.round(len * 0.72);
  const label = f < a ? "Quiz yourself" : f < b ? "Flashcards" : "In your own words";
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={label}>
        <Headline lead="Make it stick." accent="Practise." at={8} size={82} />
      </TextBlock>
      <Phone enter={0}>
        {f < a ? <Clip src="capture/quiz-right.mp4" start={0.4} /> : f < b ? <Still src="capture/still-flash.png" dur={b - a} zoom={[1, 1.05]} /> : <Still src="capture/still-written.png" dur={len - b} zoom={[1, 1.05]} />}
      </Phone>
    </AbsoluteFill>
  );
};

/* ---------- 12. labs and the maker studio ---------- */
export const N12: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const half = Math.round(len * 0.5);
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={f < half ? "Virtual lab" : "Maker Studio"}>
        <Headline lead="See it." accent="Build it." at={8} size={96} />
      </TextBlock>
      <Phone enter={0}>
        <Still key={f < half ? "a" : "b"} src={f < half ? "capture/still-labs.png" : "capture/still-studio.png"} dur={half} zoom={[1, 1.06]} />
      </Phone>
    </AbsoluteFill>
  );
};

/* ---------- 13. together ---------- */
export const N13: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const half = Math.round(len * 0.5);
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={f < half ? "Focus rooms" : "Community"}>
        <Headline lead="Not alone." accent="Together." at={8} size={90} />
      </TextBlock>
      <Phone enter={0}>
        <Still key={f < half ? "a" : "b"} src={f < half ? "capture/still-focus.png" : "capture/still-community.png"} dur={half} zoom={[1, 1.06]} />
      </Phone>
    </AbsoluteFill>
  );
};

/* ---------- 14. why: understanding, practised at the right time ---------- */
export const N14: React.FC = () => {
  const f = useCurrentFrame();
  const len = useLen();
  const { width, height, vertical, u } = useLayout();
  // a curve that forgets, and the reviews that lift it back
  const W = width * (vertical ? 0.84 : 0.76);
  const H = height * (vertical ? 0.28 : 0.4);
  const x0 = width * (vertical ? 0.08 : 0.12);
  const y0 = height * (vertical ? 0.55 : 0.5);
  const pts: Array<[number, number]> = [];
  const lifts = [0.3, 0.52, 0.72, 0.9];
  let level = 1;
  let lastLift = -1;
  for (let i = 0; i <= 160; i++) {
    const x = i / 160;
    const hit = lifts.findIndex((l, k) => k > lastLift && x >= l);
    if (hit >= 0) {
      level = Math.min(1, level + 0.55);
      lastLift = hit;
    }
    // memory fades quickly at first, then more slowly each time it has been revisited
    level *= Math.exp(-0.035 / (1 + lastLift + 1));
    pts.push([x0 + x * W, y0 + (1 - level) * H]);
  }
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const draw = interpolate(f, [10, len - 30], [0, 1], { easing: easeInOut, ...c });
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label="Why it works">
        <Headline lead="Practise the right way, at the right" accent="time." at={8} size={72} />
      </TextBlock>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <line x1={x0} y1={y0 + H + 10 * u} x2={x0 + W} y2={y0 + H + 10 * u} stroke={color.hairline} strokeWidth={3 * u} />
        <path d={d} fill="none" stroke={color.brand} strokeWidth={9 * u} strokeLinecap="round" strokeDasharray={5000} strokeDashoffset={5000 * (1 - draw)} />
        {lifts.map((l, i) => {
          const at = 10 + l * (len - 40);
          const s = interpolate(f, [at, at + 12], [0, 1], { easing: ease, ...c });
          return <g key={i} transform={`translate(${x0 + l * W} ${y0 + H + 10 * u}) scale(${s})`}><circle r={16 * u} fill={color.card} stroke={color.brandSoft} strokeWidth={4 * u} /><circle r={6 * u} fill={color.brandPale} /></g>;
        })}
      </svg>
      <div style={{ position: "absolute", left: x0, top: y0 + H + 40 * u, fontFamily: font.mono, fontSize: 20 * u, letterSpacing: "0.16em", textTransform: "uppercase", color: color.muted, opacity: interpolate(f, [30, 50], [0, 1], c) }}>
        Each review comes back just before you forget
      </div>
      <div style={{ position: "absolute", left: x0 + W * 0.9, top: y0 - 130 * u }}><SproutMark size={90 * u} look={1} /></div>
    </AbsoluteFill>
  );
};

/* ---------- 15. end card (no pricing line) ---------- */
export const End: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, u, vertical } = useLayout();
  const t = (a: number) => interpolate(f, [a, a + 16], [0, 1], { easing: ease, ...c });
  return (
    <AbsoluteFill>
      <Backdrop glowX={50} glowY={46} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 * u, textAlign: "center", padding: `0 ${width * 0.06}px` }}>
        <div style={{ opacity: t(4), transform: `scale(${0.9 + t(4) * 0.1})` }}>
          <img src={staticFile("brand/logo-mark.svg")} width={140 * u} height={140 * u} alt="" />
        </div>
        <div style={{ opacity: t(14), fontFamily: font.sans, fontWeight: 500, fontSize: (vertical ? 76 : 72) * u, letterSpacing: "-0.03em", color: color.text, lineHeight: 1.05 }}>
          Understand it. Build it. <span style={{ fontFamily: font.serif, fontStyle: "italic", fontWeight: 400, color: color.brandPale }}>Prove it.</span>
        </div>
        <div style={{ opacity: t(30), fontFamily: font.mono, fontWeight: 500, fontSize: 42 * u, letterSpacing: "0.1em", color: color.text }}>sunrootlearn.com</div>
        <div style={{ opacity: t(48), background: color.brand, color: "#fff", fontFamily: font.sans, fontWeight: 600, fontSize: 36 * u, padding: `${18 * u}px ${44 * u}px`, borderRadius: 10 * u, marginTop: 6 * u }}>Start learning</div>
      </div>
      <div style={{ position: "absolute", bottom: height * (vertical ? 0.1 : 0.16), width: "100%", textAlign: "center", fontFamily: font.mono, fontSize: 17 * u, letterSpacing: "0.16em", textTransform: "uppercase", color: color.muted, opacity: t(70) }}>
        Founder: Shamaryah Udeakpu · Top 10 finalist, AI Builders Pitch Party H2
      </div>
    </AbsoluteFill>
  );
};
