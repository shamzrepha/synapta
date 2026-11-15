import { describe, it, expect } from "vitest";
import {
  parseGeneratedSimulation,
  sanitizeSimulationHtml,
  extractSimMeta,
  stripHostInjection,
  buildSimulationEditPrompt,
  SIM_CSP,
} from "./build";

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

  it("strips our CSP and bridge so edits only see the simulation's own code, and re-injects once", () => {
    const sim = parseGeneratedSimulation(sample, "Ohm's Law")!;
    const own = stripHostInjection(sim.html);
    expect(own).not.toContain(SIM_CSP);
    expect(own).not.toContain("window.synapta = {");
    expect(own).toContain("<canvas");
    // Round trip: an edit returning the same code is served with exactly one injection
    const again = sanitizeSimulationHtml(own);
    expect(again.split(SIM_CSP).length - 1).toBe(1);
  });

  it("edit prompt carries the current code, the change and the answer key", () => {
    const { systemInstruction, userPrompt } = buildSimulationEditPrompt({
      kcTitle: "Ohm's Law",
      currentHtml: "<!DOCTYPE html><html><body><canvas id=\"c\"></canvas></body></html>",
      currentMeta: {
        title: "Ohm Lab",
        goal: "Reach 0.2 A",
        howTo: [],
        concepts: [],
        checkQuestion: { question: "Q?", options: ["a", "b", "c", "d"], answer: "b", explanation: "because" },
      },
      changeRequest: "Make the resistor red",
    });
    expect(systemInstruction).toMatch(/Change ONLY what the request needs/);
    expect(userPrompt).toContain("Make the resistor red");
    expect(userPrompt).toContain('<canvas id="c">');
    expect(userPrompt).toContain('"answer":"b"');
  });
});

import { diagnoseSimulation as diagnoseForTest } from "@/lib/sim/build";
describe("diagnoseSimulation", () => {
  it("names a cut-off answer", () => {
    expect(diagnoseForTest("<!DOCTYPE html><html><body><canvas></canvas><script>" + "var a=1;".repeat(80))).toMatch(/cut off/);
  });
  it("names an empty answer", () => {
    expect(diagnoseForTest("")).toMatch(/empty/);
  });
  it("names a page with nothing to draw on", () => {
    expect(diagnoseForTest("<html><body><script>" + "var a=1;".repeat(80) + "</script></body></html>")).toMatch(/canvas|svg/);
  });
});

import { buildSimulationPrompt } from "./build";
describe("simulation prompt medium selection", () => {
  it("guides 2D circuits/diagrams instead of banning 2D canvas, while keeping bounded 3D SimKit3D", () => {
    const { systemInstruction } = buildSimulationPrompt({
      kcTitle: "Ohm's Law",
      subject: "Physics & Electronics",
      level: "secondary",
      contextText: "V = I * R with battery, bulb, resistor and multimeter.",
    });
    expect(systemInstruction).not.toContain("Do NOT use <canvas> 2D for physical scenes");
    expect(systemInstruction).toContain("realistic 2D (<canvas> 2D or inline <svg>)");
    expect(systemInstruction).toContain("SimKit3D");
    expect(systemInstruction).toContain("kit.lookAt");
  });
});

import { interactionIssues } from "./build";
describe("interactionIssues", () => {
  it("accepts interactive simulations that use pointerup alongside resize, reset, warn, and complete", () => {
    const html = `<!DOCTYPE html><html><body><canvas id="c"></canvas><button id="reset">Reset</button><script>
      new ResizeObserver(() => {}).observe(document.body);
      document.getElementById("c").addEventListener("pointerup", () => {});
      window.sunroot.say("short circuit!", { tone: "warn" });
      window.sunroot.complete({ score: 100, level: 1 });
    </script></body></html>`;
    expect(interactionIssues(html)).toEqual([]);
  });
});
