import { describe, it, expect } from "vitest";
import { parseGeneratedSimulation, sanitizeSimulationHtml, extractSimMeta, SIM_CSP } from "./build";

const bigScript = `let t = 0; function loop(){ t += 1; requestAnimationFrame(loop); }\n`.repeat(8);

const sample = `Here you go!
\`\`\`html
<!DOCTYPE html>
<html><head><title>x</title>
<script type="application/json" id="sim-meta">{"title":"Ohm Lab","goal":"Reach 0.2 A","howTo":["Drag the slider"],"checkQuestion":{"question":"If R doubles at fixed V, current…","options":["doubles","halves","stays the same","quadruples"],"answer":"halves","explanation":"I = V/R"}}</script>
<script src="https://cdn.example.com/evil.js"></script>
<link rel="stylesheet" href="https://fonts.example.com/x.css">
<base href="https://evil.example.com/">
<meta http-equiv="refresh" content="0;url=https://evil.example.com">
<style>@import url("https://evil.example.com/a.css"); body{margin:0}</style>
</head><body><canvas id="c"></canvas><iframe src="https://evil.example.com"></iframe>
<script>${bigScript}</script></body></html>
\`\`\``;

describe("AI simulation pipeline", () => {
  it("extracts metadata and removes it from the served HTML", () => {
    const { html, meta } = extractSimMeta(sample);
    expect(meta?.title).toBe("Ohm Lab");
    expect(html).not.toContain("sim-meta");
  });

  it("strips remote resources and injects CSP + bridge", () => {
    const out = sanitizeSimulationHtml(sample);
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).not.toMatch(/evil\.js|fonts\.example|<base|http-equiv="refresh"|<iframe|@import/i);
    expect(out).toContain(SIM_CSP);
    expect(out).toContain("window.synapta");
    expect(out).toContain("<canvas");
    expect(out).not.toContain("Here you go");
  });

  it("parses a full generation and keeps the answer key server-side", () => {
    const sim = parseGeneratedSimulation(sample, "Ohm's Law");
    expect(sim).not.toBeNull();
    expect(sim!.title).toBe("Ohm Lab");
    expect(sim!.goal).toBe("Reach 0.2 A");
    expect(sim!.html).not.toContain("halves\",\"explanation");
    const q = sim!.checkQuestion!;
    expect(q.options[q.correctIndex]).toBe("halves");
  });

  it("rejects output that has no runnable script or drawing surface", () => {
    expect(parseGeneratedSimulation("<html><body><p>Sorry, I can't.</p></body></html>", "X")).toBeNull();
  });
});
