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

  it("picks studio circuit synchronously for electronics, Ohm's law, Blockly, and robotics", () => {
    expect(classifySimulationMediumHeuristic({ kcTitle: "Ohm's Law and Resistance", subject: "Physics" })).toMatchObject({
      medium: "studio",
      kind: "circuit",
      confident: true,
    });
    expect(classifySimulationMediumHeuristic({ kcTitle: "Ultrasonic HC-SR04 Obstacle Sensor with Arduino & Blockly", subject: "Robotics" })).toMatchObject({
      medium: "studio",
      kind: "circuit",
      confident: true,
    });
    expect(classifySimulationMediumHeuristic({ kcTitle: "Series and Parallel Circuits", subject: "Physics" })).toMatchObject({
      medium: "studio",
      kind: "circuit",
      confident: true,
    });
  });

  it("picks studio mechanism synchronously for gear trains and winches", () => {
    expect(classifySimulationMediumHeuristic({ kcTitle: "Compound Gear Ratios & Torque", subject: "Mechanical Engineering" })).toMatchObject({
      medium: "studio",
      kind: "mechanism",
      confident: true,
    });
  });

  it("does not misroute biology neural circuits or chemistry/calculus topics to hardware studio", () => {
    expect(classifySimulationMediumHeuristic({ kcTitle: "Neural circuits and synaptic plasticity", subject: "Biology" })).toMatchObject({
      medium: "html",
      confident: true,
    });
    expect(classifySimulationMediumHeuristic({ kcTitle: "Acid-Base Titration Curves", subject: "Chemistry" })).toMatchObject({
      medium: "html",
      confident: true,
    });
  });

  it("respects explicit teacher request for 2D/HTML simulation", () => {
    expect(
      classifySimulationMediumHeuristic({
        kcTitle: "Ohm's Law",
        instructions: "Build a 2D graph only plotting V vs I without circuit bench",
      })
    ).toMatchObject({
      medium: "html",
      confident: true,
    });
  });

  it("consults structured AI for ambiguous topics and normalizes fallback on error", async () => {
    h.exec.mockResolvedValueOnce({ data: { medium: "studio", kind: "circuit", reason: "Interactive relay bench fits best" } });
    const res = await decideSimulationMedium({
      kcTitle: "Switching Systems Lab",
      subject: "Technology",
      level: "high school",
      contextText: "Learn how switches and relays control lamps.",
      userId: "u1",
    });
    expect(h.exec).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ medium: "studio", kind: "circuit" });

    h.exec.mockRejectedValueOnce(new Error("AI timeout"));
    const fallback = await decideSimulationMedium({
      kcTitle: "Projectile Motion Parabolas",
      subject: "Physics",
      level: "high school",
      contextText: "Launch velocity and gravity trajectories.",
      userId: "u1",
    });
    expect(fallback.medium).toBe("html");
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
