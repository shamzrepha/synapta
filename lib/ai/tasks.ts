export const AI_TASK_DEFINITIONS = {
  tutor_chat: {
    key: "tutor_chat",
    label: "Tutor Chat",
    description: "Realtime Socratic dialogue, hints, and interactive classroom chat.",
  },
  structured_spec: {
    key: "structured_spec",
    label: "Structured Spec",
    description: "JSON generators: quiz questions, syllabus, SimSpec, and flashcards.",
  },
  long_document: {
    key: "long_document",
    label: "Long Document Ingest",
    description: "PDF and document parsing, topic analysis, and chapter summaries.",
  },
  class_build: {
    key: "class_build",
    label: "Class Build Architect",
    description: "Master course curriculum graph construction and topic reconciliation.",
  },
  material_route: {
    key: "material_route",
    label: "Material Router",
    description: "Incremental document mapping to topics and curriculum proposal creation.",
  },
  grading_high_stakes: {
    key: "grading_high_stakes",
    label: "High-Stakes Grading",
    description: "Rigorous pedagogical evaluation of boss quests and teach-the-bot responses.",
  },
  assignment_architect: {
    key: "assignment_architect",
    label: "Assignment Architect",
    description: "Blueprint planning for theory & practical multi-part assignments.",
  },
  assignment_author: {
    key: "assignment_author",
    label: "Assignment Author",
    description: "Complete text and rubric authoring for coursework assignments.",
  },
  assignment_reviewer: {
    key: "assignment_reviewer",
    label: "Assignment Reviewer",
    description: "Quality control and pedagogical alignment check for assignments.",
  },
  notebook_chat: {
    key: "notebook_chat",
    label: "Notebook LM Chat",
    description: "Source-grounded multi-document Q&A with verifiable citations.",
  },
  notebook_artifacts: {
    key: "notebook_artifacts",
    label: "Notebook Artifacts",
    description: "Grounded study guides, flashcard decks, and revision sheets.",
  },
  discussion_script: {
    key: "discussion_script",
    label: "Discussion Script Generation",
    description: "Two-host podcast dialogue script authoring from sources.",
  },
  source_guide: {
    key: "source_guide",
    label: "Source Guide Synthesizer",
    description: "Per-source executive summary, key topics, glossaries, and suggested inquiry questions.",
  },
  notebook_mindmap: {
    key: "notebook_mindmap",
    label: "Notebook Mind Map",
    description: "Hierarchical topic, subtopic, and concept mind-map graph builder from sources.",
  },
  study_guide: {
    key: "study_guide",
    label: "Study Guide & Briefing",
    description: "Comprehensive study guides, briefing docs, FAQs, timelines, and cheat sheets.",
  },
  explain_selection: {
    key: "explain_selection",
    label: "Explain Selection / SciSpace Reader",
    description: "Deep explanation, simplification (ELI-12), definition, and equation/figure analysis.",
  },
  paper_analysis: {
    key: "paper_analysis",
    label: "Paper Analysis Mode",
    description: "Academic paper extraction: TL;DR, contributions, methods, limits, and citations.",
  },
  card_gen: {
    key: "card_gen",
    label: "Flashcard Generator (FSRS)",
    description: "Atomic basic, cloze, and MCQ cards linked directly to source pages.",
  },
  quiz_gen: {
    key: "quiz_gen",
    label: "Practice Test & Quiz Generator",
    description: "Active diagnostic quizzes, timed practice exams, and mastery probes.",
  },
  flashcard_gen: {
    key: "flashcard_gen",
    label: "Flashcard Generator (Legacy)",
    description: "Spaced-repetition card pairs with Bloom-tagged objectives.",
  },
  research_plan: {
    key: "research_plan",
    label: "Research Planner (Perplexity-style)",
    description: "Search inquiry decomposition, query generation, and factual cross-checking.",
  },
  research_answer: {
    key: "research_answer",
    label: "Research Synthesizer",
    description: "Web-grounded research answers with rigorous cited web references.",
  },
  studio_build: {
    key: "studio_build",
    label: "Maker Studio Designer",
    description: "Generates and edits Maker Studio designs (3D assemblies, circuits with code, gear mechanisms) as validated JSON.",
  },
  sim_build: {
    key: "sim_build",
    label: "HTML5 Simulation Builder",
    description: "Interactive, game-like HTML5 simulations generated per topic (long code output; use your strongest model).",
  },
  lesson_notes: {
    key: "lesson_notes",
    label: "Lesson Notes Synthesizer",
    description: "Structured course lesson notes: overview, worked examples, key terms, check yourself.",
  },
  class_study_guide: {
    key: "class_study_guide",
    label: "Class Course Study Guide",
    description: "End-of-course consolidated study guide pack and printable exam prep notes.",
  },
  embedding: {
    key: "embedding",
    label: "Text Embedding",
    description: "Semantic vector representations for chunk retrieval.",
  },
  transcribe: {
    key: "transcribe",
    label: "Audio Transcription",
    description: "Speech-to-text processing for learner voice inputs and lecture recordings.",
  },
  voice_tts: {
    key: "voice_tts",
    label: "Voice TTS Model (Optional)",
    description: "Optional cloud speech synthesis model when not using free Edge neural voices.",
  },
} as const;

export type AiTaskKey = keyof typeof AI_TASK_DEFINITIONS;
export const ALL_AI_TASK_KEYS = Object.keys(AI_TASK_DEFINITIONS) as AiTaskKey[];
