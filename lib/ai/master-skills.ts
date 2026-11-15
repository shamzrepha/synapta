export type SkillMode = "creating" | "analyzing";

export type SkillSpecialty =
  | "simulation_and_interactive_lab"
  | "pedagogical_authoring"
  | "assessment_design"
  | "diagnostic_grading"
  | "socratic_coaching"
  | "deep_synthesis"
  | "utility";

export type ModelFamily =
  | "gemini-flash-lite"
  | "gemini-flash"
  | "gemini-pro"
  | "deepseek-r1"
  | "deepseek"
  | "claude"
  | "gpt"
  | "qwen-coder"
  | "qwen"
  | "llama"
  | "glm"
  | "mistral"
  | "other";

export interface ModelMasterSkillProfile {
  family: ModelFamily;
  label: string;
  strengths: string;
  guardrails: string;
  creatingRule: string;
  analyzingRule: string;
}

const MARKER = "[MODEL MASTER SKILL";

const CREATING_TASKS = new Set<string>([
  "sim_build",
  "studio_build",
  "quest_build",
  "class_build",
  "structured_spec",
  "assignment_architect",
  "assignment_author",
  "quiz_gen",
  "card_gen",
  "flashcard_gen",
  "study_guide",
  "lesson_notes",
  "class_study_guide",
  "discussion_script",
  "notebook_artifacts",
  "notebook_mindmap",
  "source_guide",
]);

const ANALYZING_TASKS = new Set<string>([
  "student_evaluation",
  "grading_high_stakes",
  "assignment_reviewer",
  "tutor_chat",
  "notebook_chat",
  "explain_selection",
  "paper_analysis",
  "research_plan",
  "research_answer",
  "long_document",
  "material_route",
  "ingest_handwriting",
  "extract_outline",
]);

export function classifyTaskMode(task?: string): { mode: SkillMode; specialty: SkillSpecialty } {
  const t = (task || "").toLowerCase().trim();
  if (t === "sim_build" || t === "studio_build" || t === "quest_build") {
    return { mode: "creating", specialty: "simulation_and_interactive_lab" };
  }
  if (t === "quiz_gen" || t === "assignment_architect" || t === "assignment_author") {
    return { mode: "creating", specialty: "assessment_design" };
  }
  if (t === "student_evaluation" || t === "grading_high_stakes" || t === "assignment_reviewer") {
    return { mode: "analyzing", specialty: "diagnostic_grading" };
  }
  if (t === "tutor_chat" || t === "notebook_chat" || t === "explain_selection") {
    return { mode: "analyzing", specialty: "socratic_coaching" };
  }
  if (t === "paper_analysis" || t === "research_plan" || t === "research_answer" || t === "long_document" || t === "material_route") {
    return { mode: "analyzing", specialty: "deep_synthesis" };
  }
  if (t === "embedding" || t === "transcribe" || t === "voice_tts") {
    return { mode: "analyzing", specialty: "utility" };
  }
  if (CREATING_TASKS.has(t)) {
    return { mode: "creating", specialty: "pedagogical_authoring" };
  }
  if (ANALYZING_TASKS.has(t)) {
    return { mode: "analyzing", specialty: "deep_synthesis" };
  }
  if (t.includes("build") || t.includes("gen") || t.includes("author") || t.includes("guide") || t.includes("notes")) {
    return { mode: "creating", specialty: "pedagogical_authoring" };
  }
  return { mode: "analyzing", specialty: "deep_synthesis" };
}

export function resolveModelFamily(modelId?: string): ModelFamily {
  const id = (modelId || "").toLowerCase().trim();
  if (!id) return "other";
  if (id.includes("flash-lite")) return "gemini-flash-lite";
  if (id.includes("gemini") && id.includes("pro")) return "gemini-pro";
  if (id.includes("gemini") || id.includes("flash")) return "gemini-flash";
  if (id.includes("deepseek") && (id.includes("r1") || id.includes("reason"))) return "deepseek-r1";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("claude")) return "claude";
  if (id.includes("qwen") && id.includes("coder")) return "qwen-coder";
  if (id.includes("qwen")) return "qwen";
  if (id.includes("llama")) return "llama";
  if (id.includes("gpt")) return "gpt";
  if (id.includes("glm")) return "glm";
  if (id.includes("mistral") || id.includes("mixtral")) return "mistral";
  return "other";
}

const FAMILY_PROFILES: Record<ModelFamily, ModelMasterSkillProfile> = {
  "gemini-flash-lite": {
    family: "gemini-flash-lite",
    label: "Gemini Flash-Lite",
    strengths: "Rapid instruction following and clean structured output.",
    guardrails: "Never take shortcuts, never output placeholder stubs, and never fabricate quotes or numeric results.",
    creatingRule: "Generate complete self-contained artifacts from frame zero with real physical/math formulas wired to every slider.",
    analyzingRule: "Anchor every judgment in explicit evidence from the student response or source excerpt; verify math step-by-step.",
  },
  "gemini-flash": {
    family: "gemini-flash",
    label: "Gemini Flash",
    strengths: "High-speed multimodal reasoning, visual scene synthesis, and agile tutoring.",
    guardrails: "Stay concrete and verifiable; do not invent missing syllabus facts or omit interactive bindings.",
    creatingRule: "Ship rich visual geometry, immediate first-frame animation/state, and misconception-calibrated distractors.",
    analyzingRule: "Spot the root conceptual flaw behind an error rather than restating the surface mistake; keep feedback actionable.",
  },
  "gemini-pro": {
    family: "gemini-pro",
    label: "Gemini Pro",
    strengths: "Deep cross-document synthesis, rigorous rubric grading, and multi-constraint system design.",
    guardrails: "Keep explanations clear and learner-paced without bloated jargon or unrequested prose around JSON.",
    creatingRule: "Architect layered interactive labs and transfer-level assessments with mathematically consistent conservation laws.",
    analyzingRule: "Cross-check multi-step derivations, diagnose exact step breakpoints, and calibrate partial credit with rubric precision.",
  },
  "deepseek-r1": {
    family: "deepseek-r1",
    label: "DeepSeek Reasoning",
    strengths: "Formal symbolic reasoning, proofs, and multi-step STEM verification.",
    guardrails: "NEVER leak <think> scratchpads or internal monologue into the response or JSON; validate units before finalizing.",
    creatingRule: "Double-check all equations, initial conditions, and coordinate frames before emitting simulation specs or problems.",
    analyzingRule: "Trace the learner's derivation line-by-line to isolate the exact algebraic sign, unit, or premise slip.",
  },
  deepseek: {
    family: "deepseek",
    label: "DeepSeek V3/Coder",
    strengths: "Deterministic code architecture, 3D/2D canvas math, and structured generation.",
    guardrails: "Avoid external CDN dependencies or brittle DOM assumptions; close every bracket and string cleanly in JSON.",
    creatingRule: "Write self-contained deterministic simulation logic, immediate visual feedback loops, and responsive canvas scaling.",
    analyzingRule: "Test edge cases mentally on formulas and learner steps; highlight counterexamples that falsify flawed intuition.",
  },
  claude: {
    family: "claude",
    label: "Claude",
    strengths: "Lucid pedagogy, empathy without fluff, and high-precision rubric evaluation.",
    guardrails: "Respect schema boundaries strictly (zero conversational lead-ins in JSON mode) and quote sources verbatim when required.",
    creatingRule: "Craft vivid, culturally relatable examples and crisp guided discovery prompts tuned to the learner's cohort.",
    analyzingRule: "Pair warm, non-patronizing encouragement with surgical diagnosis of the underlying mental model gap.",
  },
  gpt: {
    family: "gpt",
    label: "GPT",
    strengths: "Balanced instructional design, clean schema fidelity, and Socratic scaffolding.",
    guardrails: "Avoid generic praise or hand-wavy summaries; give concrete worked numbers, constraints, and falsifiable checks.",
    creatingRule: "Ensure every learning object has measurable mastery payoff, crisp visual labels, and zero dead UI controls.",
    analyzingRule: "Compare student work against a stepwise reference solution and name the exact missing link plus next practice move.",
  },
  "qwen-coder": {
    family: "qwen-coder",
    label: "Qwen Coder",
    strengths: "High-density code synthesis, shaders/canvas loops, and strict technical specs.",
    guardrails: "Escape quotes and newlines cleanly inside JSON payloads; never emit truncated helper stubs.",
    creatingRule: "Build silky interactive labs where manipulating any parameter visibly transforms vectors, curves, or 3D state in real time.",
    analyzingRule: "Audit numerical and logical expressions methodically; flag domain errors, dividing by zero, or sign inversions.",
  },
  qwen: {
    family: "qwen",
    label: "Qwen",
    strengths: "Strong multilingual comprehension, STEM calculation, and concise synthesis.",
    guardrails: "Keep output strictly in the requested language and JSON shape; verify decimal arithmetic carefully.",
    creatingRule: "Produce tight, high-signal study notes, flashcards, and distractors targeting real novice traps.",
    analyzingRule: "Break complex student queries into crisp atomic checkpoints and adapt density to the student's current mastery.",
  },
  llama: {
    family: "llama",
    label: "Llama",
    strengths: "Ultra-fast conversational agility and clear direct tutoring.",
    guardrails: "Strict format lock: never wrap JSON in commentary, never trail commas, and never guess facts absent from source text.",
    creatingRule: "Follow the output schema rigidly while keeping scenarios lively, visual, and grade-appropriate.",
    analyzingRule: "State the core error, the right mental rule, and one concrete follow-up check in short readable turns.",
  },
  glm: {
    family: "glm",
    label: "GLM",
    strengths: "Bilingual fluency and structured reasoning across technical topics.",
    guardrails: "Match source language strictly; verify every JSON key name matches the schema verbatim.",
    creatingRule: "Generate complete, concrete curriculum examples and cleanly structured practice items with verified keys.",
    analyzingRule: "Separate observed evidence from inference clearly; avoid vague generalizations.",
  },
  mistral: {
    family: "mistral",
    label: "Mistral",
    strengths: "Concise technical writing and multilingual instruction.",
    guardrails: "Maintain strict delimiter/JSON validity and verify arithmetic bounds before outputting.",
    creatingRule: "Deliver compact, high-clarity explanations and interactive scenarios free of filler.",
    analyzingRule: "Pinpoint the exact premise mismatch in learner reasoning and propose one targeted verification step.",
  },
  other: {
    family: "other",
    label: "Specialist Model",
    strengths: "General multi-domain synthesis and structured instruction following.",
    guardrails: "Stay strictly faithful to schemas, verify numerical computations, and never emit stub or placeholder content.",
    creatingRule: "Optimize for completeness, interactivity, visual clarity, and real conceptual payoff.",
    analyzingRule: "Diagnose root causes, cite concrete evidence, and prescribe a personalized next action.",
  },
};

function specialtyPlaybook(mode: SkillMode, specialty: SkillSpecialty): string {
  switch (specialty) {
    case "simulation_and_interactive_lab":
      return [
        "CREATING LABS & 3D/2D ARTIFACTS:",
        "- Render something alive on frame 1 (zero blank/black screens, zero waiting before first draw).",
        "- Every slider/toggle/control MUST visibly mutate geometry, vectors, particles, readouts, or chemical/physical state.",
        "- Encode true domain laws (units, equilibria,conservation, boundaries) and readable annotations so learners verify cause-and-effect.",
      ].join("\n");
    case "assessment_design":
      return [
        "CREATING ASSESSMENTS & QUIZZES:",
        "- Every distractor must represent a genuine learner misconception (sign flip, wrong unit, boundary error), never absurd filler.",
        "- Verify the keyed answer mathematically and conceptually before finalizing.",
      ].join("\n");
    case "pedagogical_authoring":
      return [
        "CREATING LESSONS, NOTES & GUIDES:",
        "- Sequence intuition -> concrete example -> formal rule -> active check; zero wall-of-text lectures.",
        "- Ground claims strictly in provided course sources when source context is given.",
      ].join("\n");
    case "diagnostic_grading":
      return [
        "ANALYZING & GRADING WORK:",
        "- Grade process separately from final arithmetic slip; credit valid method even when a minor numeric error occurred.",
        "- Name the specific misconception pattern and give one high-leverage corrective step.",
      ].join("\n");
    case "socratic_coaching":
      return [
        "ANALYZING & SOCRATIC COACHING:",
        "- Diagnose what the learner already understands before correcting what is missing.",
        "- Adapt pacing, analogy style, and challenge level to their live Learner DNA profile when provided.",
      ].join("\n");
    case "deep_synthesis":
      return [
        "ANALYZING SOURCES & EVIDENCE:",
        "- Distinguish source-verified facts from inferred connections; quote or cite cleanly.",
        "- Surface contradictions, hidden assumptions, and exam-relevant takeaways.",
      ].join("\n");
    default:
      return mode === "creating"
        ? "CREATING DISCIPLINE: Deliver complete, schema-exact, high-utility educational output."
        : "ANALYZING DISCIPLINE: Base conclusions on verifiable evidence and precise logic.";
  }
}

export function getModelMasterSkill(opts: {
  task?: string;
  model?: string;
  jsonMode?: boolean;
}): string {
  const { mode, specialty } = classifyTaskMode(opts.task);
  const family = resolveModelFamily(opts.model);
  const profile = FAMILY_PROFILES[family];
  const modeRule = mode === "creating" ? profile.creatingRule : profile.analyzingRule;

  const lines = [
    `${MARKER} · ${profile.label.toUpperCase()} · ${mode.toUpperCase()}]`,
    `Strengths: ${profile.strengths}`,
    `Guardrails: ${profile.guardrails}`,
    `Execution Rule (${mode}): ${modeRule}`,
    specialtyPlaybook(mode, specialty),
  ];
  if (opts.jsonMode) {
    lines.push("JSON LOCK: Return ONLY syntactically valid JSON matching the exact schema. Zero prose or reasoning tags outside JSON.");
  }
  return lines.join("\n");
}

/**
 * Equips the resolved AI model's system instruction with its tailored Creating/Analyzing Master Skill.
 * Safe and idempotent across retries/fallback chains because it binds to the concrete `model` attempt.
 */
export function withModelMasterSkill(
  systemInstruction: string | undefined,
  opts: { task?: string; model?: string; jsonMode?: boolean }
): string {
  const base = (systemInstruction || "").trim();
  if (base.includes(MARKER)) return base;
  const skill = getModelMasterSkill(opts);
  return base ? `${base}\n\n${skill}` : skill;
}
