/**
 * Pedagogical Representation Formats for Synapta AI Teacher Engine.
 *
 * NOTE: As grounded in 2025 educational psychology research (Springer / Educ Psychol Rev),
 * these are pedagogical EXPLANATION FORMATS, NOT student "learning styles" (visual/auditory/kinesthetic).
 * Synapta adapts based on measured learning gains per format and explicit user choice,
 * never by labeling learners.
 */

export const REPRESENTATIONS = [
  "worked_example",
  "analogy",
  "step_by_step",
  "visual_diagram",
  "plain_language",
  "real_world_case",
  "short_summary",
] as const;

export type Representation = (typeof REPRESENTATIONS)[number];

export interface RepresentationMeta {
  id: Representation;
  label: string;
  shortDescription: string;
  promptInstruction: string;
}

export const REPRESENTATION_METADATA: Record<Representation, RepresentationMeta> = {
  worked_example: {
    id: "worked_example",
    label: "Worked Example",
    shortDescription: "A fully solved problem with step-by-step reasoning and mathematical formulations",
    promptInstruction:
      "Explain using a concrete, fully worked mathematical/physical example with explicit problem statement, given values, step-by-step deduction, and final verified solution.",
  },
  analogy: {
    id: "analogy",
    label: "Intuitive Analogy",
    shortDescription: "Relatable real-world physical metaphor to build mental models",
    promptInstruction:
      "Explain using a rich, intuitive physical analogy from everyday life (e.g. water pipes for electric circuits, flowing traffic for resistance) to anchor the abstract concept.",
  },
  step_by_step: {
    id: "step_by_step",
    label: "Step-by-Step Breakdown",
    shortDescription: "Numbered, sequential analytical procedure",
    promptInstruction:
      "Explain using an orderly, numbered step-by-step analytical algorithm. Break the concept into distinct discrete micro-steps without cognitive overload.",
  },
  visual_diagram: {
    id: "visual_diagram",
    label: "Visual / Diagrammatic",
    shortDescription: "Mermaid chart, ASCII schematic, or visual spatial structure",
    promptInstruction:
      "Explain using a visual structural diagram (such as a fenced mermaid diagram, flowchart, or circuit schematic) accompanied by spatial annotations.",
  },
  plain_language: {
    id: "plain_language",
    label: "Plain Language",
    shortDescription: "Simple, jargon-free conversational prose",
    promptInstruction:
      "Explain using crystal-clear, accessible, plain conversational language with zero unintroduced technical jargon. Define any necessary term immediately.",
  },
  real_world_case: {
    id: "real_world_case",
    label: "Real-World Case Study",
    shortDescription: "Practical engineering or industrial application",
    promptInstruction:
      "Explain in the context of an actual engineering, biomedical, or industrial scenario where this principle solves a real practical challenge.",
  },
  short_summary: {
    id: "short_summary",
    label: "Executive Summary",
    shortDescription: "High-density bullet points and key takeaways",
    promptInstruction:
      "Explain in concise, high-density executive bullet points covering key governing laws, boundary conditions, and core takeaways.",
  },
};

export function isValidRepresentation(val: string): val is Representation {
  return REPRESENTATIONS.includes(val as Representation);
}
