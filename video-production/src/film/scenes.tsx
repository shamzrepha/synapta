import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { color, ease, easeInOut, font, sec } from "../theme";
import { Backdrop, Callout, Clip, NotePage, SproutMark, Still, Tap, TextBlock, Headline, Label, Phone, clampOpts, useLayout } from "./parts";

const c = clampOpts;

/* ---------- 1. the notes are doing too much ---------- */
export const S1: React.FC = () => {
  const f = useCurrentFrame();
  const { vertical, u, width, height } = useLayout();
  const PAGES = 16;
  const pw = (vertical ? 560 : 400) * u;
  const ph = pw * 1.32;
  const cx = vertical ? width / 2 : width * 0.7;
  const cy = height * (vertical ? 0.7 : 0.55);
  const push = interpolate(f, [0, sec(5)], [1, 1.14], { easing: easeInOut, ...c });
  return (
    <AbsoluteFill>
      <Backdrop glowX={vertical ? 50 : 68} glowY={vertical ? 60 : 52} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${vertical ? 50 : 68}% ${vertical ? 58 : 48}%, ${color.lamp}2E 0%, ${color.lamp}12 28%, transparent 56%)` }} />
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: "50% 60%" }}>
        {Array.from({ length: PAGES }, (_, i) => {
          const start = 4 + i * 4.2;
          const t = interpolate(f, [start, start + 18], [0, 1], { easing: ease, ...c });
          const side = i % 2 === 0 ? -1 : 1;
          const rot = (random(`rot-${i}`) - 0.5) * 9;
          return (
            <div key={i} style={{ position: "absolute", left: cx - pw / 2 + (random(`dx-${i}`) - 0.5) * 36 * u + (1 - t) * side * width * 0.7, top: cy - ph / 2 - i * 13 * u + (1 - t) * 60 * u, width: pw, height: ph, transform: `rotate(${rot * t + (1 - t) * side * 14}deg)`, opacity: t, boxShadow: `0 ${10 * u}px ${28 * u}px rgba(0,0,0,0.45)`, borderRadius: 6 }}>
              <NotePage seed={`p${i}`} w={pw} h={ph} />
            </div>
          );
        })}
      </div>
      <TextBlock label="First week. Big notes.">
        <Headline lead="The notes are already doing" accent="too much." at={16} />
      </TextBlock>
    </AbsoluteFill>
  );
};

/* ---------- 2. reading is not always understanding ---------- */
export const S2: React.FC = () => {
  const f = useCurrentFrame();
  const { vertical, u, width, height } = useLayout();
  const pw = (vertical ? 760 : 560) * u;
  const ph = pw * 1.32;
  const x = vertical ? width / 2 - pw / 2 : width * 0.74 - pw / 2;
  const y = vertical ? height * 0.36 : height * 0.5 - ph / 2;
  const sweep = interpolate(f, [14, 50], [0, 1], { easing: easeInOut, ...c });
  const line = 5;
  const lh = ph / 14;
  const ly = y + (line + 1.4) * lh - lh * 0.55;
  // the maze: a tangle that grows over the page
  const knot = interpolate(f, [60, 130], [0, 1], { easing: easeInOut, ...c });
  let d = "";
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 7;
    const r = (0.1 + 0.34 * (i / 90)) * pw * (1 + 0.25 * Math.sin(a * 2.3));
    const px = pw * 0.5 + Math.cos(a) * r;
    const py = ph * 0.46 + Math.sin(a * 1.3) * r * 0.9;
    d += (i === 0 ? "M" : "L") + px.toFixed(1) + " " + py.toFixed(1) + " ";
  }
  const out = interpolate(f, [130, 168], [0, 1], { easing: ease, ...c });
  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ position: "absolute", left: x, top: y, boxShadow: `0 ${20 * u}px ${60 * u}px rgba(0,0,0,0.5)`, borderRadius: 6, transform: `translateX(${out * (vertical ? 0 : width * 0.12)}px)` }}>
        <NotePage seed="close" w={pw} h={ph} lines={13} />
        <svg width={pw} height={ph} style={{ position: "absolute", inset: 0 }}>
          <path d={d} fill="none" stroke={color.brand} strokeWidth={4 * u} strokeLinecap="round" strokeDasharray={9000} strokeDashoffset={9000 * (1 - knot)} opacity={0.9} />
        </svg>
      </div>
      {/* a single blue highlight sweeps a line, then stops */}
      <div style={{ position: "absolute", left: x + pw * 0.09, top: ly, width: pw * 0.82 * sweep, height: lh * 0.78, background: `${color.brand}55`, borderRadius: 4, transform: `translateX(${out * (vertical ? 0 : width * 0.12)}px)` }} />
      <TextBlock label="Reading isn't always understanding">
        <Headline lead="You read. You highlight." at={8} size={72} />
        <Headline lead="It still doesn't" accent="click." at={44} size={72} />
      </TextBlock>
    </AbsoluteFill>
  );
};

/* ---------- 3. bring your notes ---------- */
export const S3: React.FC = () => {
  const f = useCurrentFrame();
  const { u, phoneX, phoneY, phoneW, vertical, width } = useLayout();
  const items = [
    { t: "PDF", dy: -150 },
    { t: "PHOTO", dy: 0 },
    { t: "SCAN", dy: 150 },
  ];
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label="Bring your notes">
        <Headline lead="Bring your own" accent="material." at={6} />
      </TextBlock>
      <Phone enter={0}>
        <Clip src="capture/add.mp4" start={0.4} />
        <Tap at={30} x={0.5} y={0.93} />
      </Phone>
      {items.map((it, i) => {
        const at = 8 + i * 8;
        const t = interpolate(f, [at, at + 26], [0, 1], { easing: ease, ...c });
        const startX = vertical ? width * (0.2 + i * 0.3) : width * 0.32;
        const startY = vertical ? phoneY - phoneW * 1.9 : phoneY + (it.dy) * u;
        const x = startX + (phoneX - startX) * t;
        const y = startY + (phoneY - startY) * t;
        return (
          <div key={it.t} style={{ position: "absolute", left: x - 70 * u, top: y - 36 * u, width: 140 * u, height: 72 * u, opacity: t < 0.05 ? 0 : 1 - Math.max(0, (t - 0.8) / 0.2), transform: `scale(${1 - t * 0.5}) rotate(${(i - 1) * 6 * (1 - t)}deg)`, background: color.paper, borderRadius: 8 * u, boxShadow: "0 12px 30px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, fontWeight: 500, letterSpacing: "0.16em", fontSize: 24 * u, color: color.ink }}>
            {it.t}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ---------- 4. notes made clear ---------- */
export const S4: React.FC = () => {
  const { phoneX, phoneY, phoneW, phoneH, vertical, u } = useLayout();
  const len = sec(6.6);
  const px = phoneX - phoneW / 2;
  const py = phoneY - phoneH / 2;
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label="Your notes, made clear">
        <Headline lead="Messy lines become" accent="clean notes." at={10} />
      </TextBlock>
      <Phone enter={0}>
        <Still src="capture/still-notes-result.png" from={0} to={-6} dur={len} zoom={[1, 1.03]} />
      </Phone>
      {!vertical && (
        <>
          <Callout at={46} text="Page by page" x={px - 260 * u} y={py + phoneH * 0.5} side="left" />
          <Callout at={70} text="Overview first" x={px - 280 * u} y={py + phoneH * 0.66} side="left" />
          <Callout at={96} text="Quiz, flashcards" x={px - 360 * u} y={py + phoneH * 0.37} side="left" />
        </>
      )}
    </AbsoluteFill>
  );
};

/* ---------- 5. learn it your way ---------- */
export const S5: React.FC = () => {
  const f = useCurrentFrame();
  const { phoneX, phoneY, phoneW, phoneH, vertical, u } = useLayout();
  const first = f < sec(3.4);
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={first ? "Ask the tutor" : "Read along"}>
        <Headline lead="Learn it" accent="your way." at={6} />
      </TextBlock>
      <Phone enter={0}>
        {first ? <Clip src="capture/tutor.mp4" start={0.2} /> : <Clip src="capture/readalong.mp4" start={0.4} />}
      </Phone>
      <div style={{ position: "absolute", left: phoneX + phoneW / 2 - 70 * u, top: phoneY + phoneH / 2 - 110 * u, opacity: interpolate(f, [sec(3.6), sec(4.2)], [0, 1], c) }}>
        {!vertical && <SproutMark size={90 * u} look={interpolate(f, [sec(3.6), sec(6.4)], [-1.5, 1.5], c)} />}
      </div>
    </AbsoluteFill>
  );
};

/* ---------- 6. retrieve ---------- */
export const S6: React.FC = () => {
  const f = useCurrentFrame();
  const first = f < sec(3.6);
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={first ? "Quiz it" : "In your own words"}>
        <Headline lead="Don't just read." accent="Retrieve." at={6} />
      </TextBlock>
      <Phone enter={0}>
        {first ? <Clip src="capture/quiz-right.mp4" start={0.4} /> : <Still src="capture/still-written.png" dur={sec(2.4)} zoom={[1, 1.05]} />}
      </Phone>
    </AbsoluteFill>
  );
};

/* ---------- 7. a mistake can teach you ---------- */
export const S7: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, vertical, u, phoneX, phoneW } = useLayout();
  const t = interpolate(f, [sec(2.2), sec(4.2)], [0, 1], { easing: easeInOut, ...c });
  const cardW = 380 * u;
  const cardH = 230 * u;
  const x0 = vertical ? width * 0.1 : width * 0.07;
  const y0 = vertical ? height * 0.2 : height * 0.56;
  const tray = { x: vertical ? width * 0.5 : width * 0.3, y: vertical ? height * 0.2 : height * 0.78 };
  const px = x0 + (tray.x - x0) * t;
  const py = y0 + (tray.y - y0) * t;
  const show = interpolate(f, [sec(1.4), sec(1.9)], [0, 1], c);
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label="A mistake can teach you" tone="coral">
        <Headline lead="Got one wrong?" accent="Good." at={6} />
      </TextBlock>
      <Phone enter={0}>
        <Clip src="capture/quiz-wrong.mp4" start={0.3} />
      </Phone>
      <div style={{ position: "absolute", left: px, top: py, width: cardW * (1 - t * 0.12), minHeight: cardH * (1 - t * 0.12), opacity: show, background: color.card, border: `${2 * u}px solid ${color.coral}`, borderRadius: 10 * u, padding: 18 * u, boxShadow: "0 14px 34px rgba(0,0,0,0.45)", color: color.text, fontFamily: font.sans }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 * u, fontFamily: font.mono, fontSize: 20 * u, letterSpacing: "0.14em", textTransform: "uppercase", color: color.coral }}>
          <svg width={26 * u} height={26 * u} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke={color.coral} strokeWidth="2" /><path d="M8 8l8 8M16 8l-8 8" stroke={color.coral} strokeWidth="2.4" strokeLinecap="round" /></svg>
          Not quite
        </div>
        <div style={{ marginTop: 10 * u, fontSize: 28 * u, lineHeight: 1.15 }}>Saved to your mistakes, with the fix.</div>
      </div>
      {/* the path back to the idea */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {(() => {
          const sx = tray.x + cardW * 0.4;
          const sy = tray.y + cardH * 0.4;
          const ex = vertical ? phoneX - phoneW * 0.5 : width * 0.52;
          const ey = vertical ? height * 0.42 : height * 0.86;
          const draw = interpolate(f, [sec(3.8), sec(5.2)], [0, 1], { easing: easeInOut, ...c });
          return <path d={`M ${sx} ${sy} C ${sx + 120 * u} ${sy}, ${ex - 120 * u} ${ey}, ${ex} ${ey}`} fill="none" stroke={color.brand} strokeWidth={6 * u} strokeLinecap="round" strokeDasharray={2000} strokeDashoffset={2000 * (1 - draw)} opacity={draw > 0 ? 1 : 0} />;
        })()}
      </svg>
    </AbsoluteFill>
  );
};

/* ---------- 8. come back to what matters ---------- */
export const S8: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cell = (vertical ? 92 : 110) * u;
  const gx = vertical ? width * 0.08 : width * 0.07;
  const gy = vertical ? height * 0.158 : height * 0.58;
  const move = interpolate(f, [sec(3.4), sec(4.6)], [0, 1], { easing: easeInOut, ...c });
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label="Come back to what matters">
        <Headline lead="Remember it" accent="for the exam." at={6} />
      </TextBlock>
      <Phone enter={0}>
        <Still src="capture/still-flash.png" dur={sec(5.4)} zoom={[1, 1.06]} />
      </Phone>
      <div style={{ position: "absolute", left: gx, top: gy, display: "flex", gap: 10 * u, opacity: interpolate(f, [sec(2.2), sec(2.9)], [0, 1], c) }}>
        {days.map((d, i) => {
          const today = i === 3;
          const reached = move > 0.9;
          return (
            <div key={d} style={{ width: cell * 0.8, height: cell * 1.1, border: `${2 * u}px solid ${today && reached ? color.brand : color.hairline}`, borderRadius: 8 * u, background: today && reached ? `${color.brand}33` : color.card, color: color.muted, fontFamily: font.mono, fontSize: 18 * u, letterSpacing: "0.12em", textTransform: "uppercase", padding: 8 * u }}>
              {d}
            </div>
          );
        })}
      </div>
      {/* one due item travels into "today" */}
      <div style={{ position: "absolute", left: gx + (6 * (cell * 0.8 + 10 * u)) - move * (3 * (cell * 0.8 + 10 * u)) + 8 * u, top: gy + cell * 0.5, width: cell * 0.64, height: cell * 0.34, background: color.brand, borderRadius: 5 * u, opacity: interpolate(f, [sec(2.6), sec(3.2)], [0, 1], c) }} />
    </AbsoluteFill>
  );
};

/* ---------- 9. learn, build, share ---------- */
export const S9: React.FC = () => {
  const f = useCurrentFrame();
  const stills = [
    { src: "capture/still-labs.png", word: "Learn", label: "Virtual labs" },
    { src: "capture/still-studio.png", word: "Build", label: "Maker Studio" },
    { src: "capture/still-focus.png", word: "Share", label: "Study together" },
  ];
  const i = Math.min(2, Math.floor(f / sec(1.6)));
  const s = stills[i];
  return (
    <AbsoluteFill>
      <Backdrop />
      <TextBlock label={s.label}>
        <Headline key={i} lead={s.word + "."} at={i * sec(1.6) + 2} size={110} />
      </TextBlock>
      <Phone enter={0}>
        <Still key={i} src={s.src} dur={sec(1.7)} zoom={[1, 1.05]} />
      </Phone>
    </AbsoluteFill>
  );
};

/* ---------- 10. your notes, your pace ---------- */
export const S10: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, vertical, u } = useLayout();
  const draw = interpolate(f, [6, 70], [0, 1], { easing: easeInOut, ...c });
  const pts = [0, 1, 2, 3, 4].map((i) => {
    const k = i / 4;
    return vertical ? { x: width * (i % 2 === 0 ? 0.28 : 0.72), y: height * (0.42 + 0.4 * k) } : { x: width * (0.12 + 0.76 * k), y: height * (0.68 - 0.16 * Math.sin(k * Math.PI * 1.1) + (i % 2 === 0 ? 0.03 : -0.03)) };
  });
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    d += vertical ? ` C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}` : ` C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`;
  }
  const spX = interpolate(draw, [0, 1], [pts[0].x, pts[4].x]);
  return (
    <AbsoluteFill>
      <Backdrop />
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 14 }, (_, i) => <line key={i} x1={0} x2={width} y1={(i + 1) * (height / 15)} y2={(i + 1) * (height / 15)} stroke={color.paperLine} strokeWidth={1.5 * u} opacity={0.07} />)}
        <path d={d} fill="none" stroke={color.brand} strokeWidth={10 * u} strokeLinecap="round" strokeDasharray={4000} strokeDashoffset={4000 * (1 - draw)} />
        <path d={d} fill="none" stroke={color.brandPale} strokeWidth={3 * u} strokeLinecap="round" strokeDasharray={4000} strokeDashoffset={4000 * (1 - draw)} />
        {pts.map((p, i) => {
          const s = interpolate(f, [10 + i * 10, 26 + i * 10], [0, 1], { easing: ease, ...c });
          return <g key={i} transform={`translate(${p.x} ${p.y}) scale(${s})`}><circle r={24 * u} fill={color.card} stroke={color.brandSoft} strokeWidth={4 * u} /><circle r={8 * u} fill={color.brandPale} /></g>;
        })}
      </svg>
      <div style={{ position: "absolute", left: spX - 50 * u, top: (vertical ? height * 0.82 : height * 0.78) - 110 * u * 0 }}>
        <div style={{ position: "absolute", transform: `translate(-30%, -150%)` }}><SproutMark size={100 * u} look={1} /></div>
      </div>
      <TextBlock label="Your notes. Your pace.">
        <Headline lead="Understand it. Build it." accent="Prove it." at={14} size={72} maxW={width * 0.9} />
      </TextBlock>
    </AbsoluteFill>
  );
};

/* ---------- 11. end card ---------- */
export const S11: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height, u, vertical } = useLayout();
  const t = (a: number) => interpolate(f, [a, a + 16], [0, 1], { easing: ease, ...c });
  return (
    <AbsoluteFill>
      <Backdrop glowX={50} glowY={46} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 * u, textAlign: "center", padding: `0 ${width * 0.06}px` }}>
        <div style={{ opacity: t(4), transform: `scale(${0.9 + t(4) * 0.1})` }}>
          <img src={logoSrc} width={140 * u} height={140 * u} alt="" />
        </div>
        <div style={{ opacity: t(14), fontFamily: font.sans, fontWeight: 500, fontSize: (vertical ? 76 : 72) * u, letterSpacing: "-0.03em", color: color.text, lineHeight: 1.05 }}>
          Understand it. Build it. <span style={{ fontFamily: font.serif, fontStyle: "italic", fontWeight: 400, color: color.brandPale }}>Prove it.</span>
        </div>
        <div style={{ opacity: t(30), fontFamily: font.mono, fontWeight: 500, fontSize: 40 * u, letterSpacing: "0.1em", color: color.text }}>sunrootlearn.com</div>
        <div style={{ opacity: t(40), fontFamily: font.mono, fontSize: 22 * u, letterSpacing: "0.18em", textTransform: "uppercase", color: color.muted }}>Free to start</div>
        <div style={{ opacity: t(52), background: color.brand, color: "#fff", fontFamily: font.sans, fontWeight: 600, fontSize: 36 * u, padding: `${18 * u}px ${44 * u}px`, borderRadius: 10 * u, marginTop: 6 * u }}>Start learning</div>
      </div>
      <div style={{ position: "absolute", bottom: height * (vertical ? 0.1 : 0.16), width: "100%", textAlign: "center", fontFamily: font.mono, fontSize: 17 * u, letterSpacing: "0.16em", textTransform: "uppercase", color: color.muted, opacity: t(70) }}>
        Founder: Shamaryah Udeakpu · Top 10 finalist, AI Builders Pitch Party H2
      </div>
    </AbsoluteFill>
  );
};

import { staticFile } from "remotion";
const logoSrc = staticFile("brand/logo-mark.svg");
export { Label };
