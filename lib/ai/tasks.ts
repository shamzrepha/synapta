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
  quiz_gen: {
    key: "quiz_gen",
    label: "Quiz Generator",
    description: "Active diagnostic quizzes and mastery probes.",
  },
  flashcard_gen: {
    key: "flashcard_gen",
    label: "Flashcard Generator",
    description: "Spaced-repetition card pairs with Bloom-tagged objectives.",
  },
  embedding: {
    key: "embedding",
    label: "Text Embedding",
    description: "Semantic vector representations for chunk retrieval.",
  },
  transcribe: {
    key: "transcribe",
    label: "Audio Transcription",
    description: "Speech-to-text processing for learner voice inputs.",
  },
  voice_tts: {
    key: "voice_tts",
    label: "Voice TTS Model (Optional)",
    description: "Optional cloud speech synthesis model when not using free Edge neural voices.",
  },
} as const;

export type AiTaskKey = keyof typeof AI_TASK_DEFINITIONS;
export const ALL_AI_TASK_KEYS = Object.keys(AI_TASK_DEFINITIONS) as AiTaskKey[];
