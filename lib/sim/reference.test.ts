import { describe, it, expect } from "vitest";
import { SIM_REFERENCE_HTML } from "./reference";
import { SIM_MODEL_GUIDE } from "./guide";
import { buildSimulationPrompt, interactionIssues, parseGeneratedSimulation } from "./build";

describe("simulation reference example and rulebook", () => {
  it("the reference example passes the same checks as generated labs", () => {
    const sim = parseGeneratedSimulation(SIM_REFERENCE_HTML, "Pendulum");
    expect(sim).not.toBeNull();
    expect(interactionIssues(sim!.html)).toEqual([]);
    expect(sim!.checkQuestion?.options).toHaveLength(4);
    expect(sim!.html.length).toBeLessThan(9000);
  });

  it("gives every model the rulebook and the example", () => {
    const { systemInstruction } = buildSimulationPrompt({ kcTitle: "Waves", subject: "Physics", level: "undergrad", contextText: "x" });
    expect(systemInstruction).toContain(SIM_MODEL_GUIDE.slice(0, 60));
    expect(systemInstruction).toContain("<REFERENCE_EXAMPLE>");
    expect(systemInstruction).toContain("SimKit3D.create");
  });

  it("asks a weak first attempt to fix the structural mistakes small models make", () => {
    const weak = `<script>const kit = SimKit3D.create(stage); const r = new THREE.WebGLRenderer(); stage.addEventListener("pointerdown",()=>{}); new ResizeObserver(()=>{}); window.sunroot.say("hi")</script>`;
    const issues = interactionIssues(weak).join(" | ");
    expect(issues).toMatch(/never moves/);
    expect(issues).toMatch(/own renderer/);
    expect(issues).toMatch(/no way to win/);
    expect(issues).toMatch(/Reset/);
  });
});
