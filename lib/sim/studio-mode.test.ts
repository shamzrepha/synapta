import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  exec: vi.fn(),
  genDesign: vi.fn(),
}));

vi.mock("@/lib/ai/router", () => ({
  executeStructuredAiTask: h.exec,
}));
vi.mock("@/lib/studio/design-ai", () => ({
  generateDesign: h.genDesign,
}));

import { classifySimulationMediumHeuristic, decideSimulationMedium, generateStudioSimulation } from "./studio-mode";

describe("classroom studio medium classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to HTML for ordinary and physics topics, even with circuit words, outside hardware subjects", () => {
    for (const input of [
      { kcTitle: "Projectile Motion", subject: "Physics" },
      { kcTitle: "Ohm's Law and Resistance", subject: "Physics" },
      { kcTitle: "Series and Parallel Circuits", subject: "Physics" },
      { kcTitle: "Gear ratios", subject: "Physics" },
      { kcTitle: "Resistors and LEDs", subject: "Science" },
      { kcTitle: "Neural circuits and synaptic plasticity", subject: "Biology" },
      { kcTitle: "Acid-Base Titration Curves", subject: "Chemistry" },
    ]) {
      expect(classifySimulationMediumHeuristic(input)).toMatchObject({ medium: "html", kind: null, confident: true });
    }
  });

  it("uses studio for unmistakable hardware topics in an electronics/engineering subject", () => {
    expect(classifySimulationMediumHeuristic({ kcTitle: "Ultrasonic HC-SR04 Obstacle Sensor with Arduino & Blockly", subject: "Robotics" })).toMatchObject({
      medium: "studio",
      kind: "circuit",
      confident: true,
    });
    expect(classifySimulationMediumHeuristic({ kcTitle: "Ohm's Law and Resistance", subject: "Electronics" })).toMatchObject({ medium: "studio", kind: "circuit" });
    expect(classifySimulationMediumHeuristic({ kcTitle: "Compound Gear Ratios & Torque", subject: "Mechanical Engineering" })).toMatchObject({
      medium: "studio",
      kind: "mechanism",
    });
  });

  it("uses studio when the instructions explicitly ask for a workbench, in any subject", () => {
    expect(classifySimulationMediumHeuristic({ kcTitle: "Ohm's Law", subject: "Physics", instructions: "Let students wire it on a circuit bench" })).toMatchObject({
      medium: "studio",
      kind: "circuit",
    });
    expect(classifySimulationMediumHeuristic({ kcTitle: "Simple machines", subject: "Physics", instructions: "Use a gear train workbench" })).toMatchObject({
      medium: "studio",
      kind: "mechanism",
    });
    expect(classifySimulationMediumHeuristic({ kcTitle: "Loops", subject: "Computing", instructions: "build with Blockly on an Arduino" })).toMatchObject({ medium: "studio" });
  });

  it("respects explicit teacher request for 2D/HTML simulation", () => {
    expect(
      classifySimulationMediumHeuristic({
        kcTitle: "Ohm's Law",
        subject: "Electronics",
        instructions: "Build a 2D graph only plotting V vs I without circuit bench",
      })
    ).toMatchObject({ medium: "html", confident: true });
  });

  it("never spends an AI call on classification", async () => {
    const hw = await decideSimulationMedium({ kcTitle: "Arduino LED", subject: "Electronics", level: "x", contextText: "", userId: "u" });
    const other = await decideSimulationMedium({ kcTitle: "Switching Systems Lab", subject: "Technology", level: "x", contextText: "switches and relays", userId: "u" });
    expect(hw.medium).toBe("studio");
    expect(other.medium).toBe("html");
    expect(h.exec).not.toHaveBeenCalled();
  });

  it("normalizes generated board labs to open in Blocks mode when a block program exists and generates checkQuestion", async () => {
    h.genDesign.mockResolvedValueOnce({
      title: "LED Blink with Button",
      spec: {
        kind: "circuit",
        summary: "Wire an LED on D9 and blink it with Scratch blocks.",
        params: [],
        parts: [],
        joints: [],
        triggers: [],
        steps: [{ id: "s1", title: "Wire D9 to the LED anode", hint: "Use a resistor", check: { kind: "wire", from: "board.D9", to: "r1.a" } }],
        tests: [],
        circuit: {
          parts: [
            { id: "board", type: "board", x: 100, y: 120 },
            { id: "led1", type: "led", x: 320, y: 120, props: { color: "red" } },
          ],
          wires: [{ id: "w1", from: "board.D9", to: "led1.anode", color: "#ef4444" }],
        },
        blocks: {
          setup: [],
          loop: [{ type: "setPin", pin: "9", level: "HIGH" }, { type: "wait", ms: 500 }],
        },
        code: "void setup(){ pinMode(9, OUTPUT); }\nvoid loop(){ digitalWrite(9, HIGH); delay(500); }",
      },
    });
    h.exec.mockResolvedValueOnce({
      data: {
        title: "Interactive LED Blink Bench",
        goal: "Toggle D9 to blink the red LED.",
        howTo: ["Check the wire from D9 to led1", "Open Blocks mode and press Run"],
        concepts: ["Digital Output", "Current Limiting"],
        checkQuestion: {
          question: "Which pin controls the LED anode in this circuit?",
          options: ["D9", "GND", "A0", "5V"],
          answer: "D9",
          explanation: "The LED anode is wired to digital pin D9.",
        },
      },
    });

    const out = await generateStudioSimulation({
      kcTitle: "Digital Outputs with Arduino",
      subject: "Electronics",
      level: "beginner",
      contextText: "Microcontroller digital pins drive LEDs.",
      kind: "circuit",
      userId: "teacher1",
    });

    expect(out.studioSpec.codeMode).toBe("blocks");
    expect(out.title).toBe("Interactive LED Blink Bench");
    expect(out.checkQuestion).toMatchObject({
      question: "Which pin controls the LED anode in this circuit?",
    });
    expect(out.checkQuestion?.options[out.checkQuestion.correctIndex]).toBe("D9");
  });
});
