# SUNROOT WORLDS — Design Contract and Build Spec

**Feature name:** SunRoot Worlds ("Upload a document, get a world you can learn in.")
**Audience of this file:** the AI coding agent (Claude Code or any other) that will build the feature, AND the AI models that will run inside the product at runtime (Groq, Qwen, Gemini, or any other).
**Status:** binding. Where this file conflicts with your habits, this file wins. Where it conflicts with the existing repo's *working* conventions, keep the repo's conventions and tell the owner.

---

## 0. How to read and use this file

1. Read the whole file before writing code. Do not skim.
2. Every rule has an ID (`R1`, `R2`, ...). When you make a design choice, you must be able to point at the rule that justifies it. When you must break a rule, stop and ask the owner.
3. Words: **MUST / MUST NOT** are absolute. **SHOULD** means do it unless you have a written reason. **MAY** is optional.
4. Build in the phases in section 20. Do not start phase N+1 until phase N's acceptance checks pass.
5. Before every commit: type-check and production-build locally. Never push code that has not been built. (Owner learned this the hard way.)
6. You write code. The owner (Shamaryah) runs deployments and git. Edit files directly in the project folder; do not ask the owner to download or copy files around. Do not take over the screen or click through GUI tools; run builds from the terminal.
7. The owner uses Windows with Git Bash. Give shell commands in bash syntax.

---

## 1. Mission

SunRoot started as an engineering and STEM platform. It must become a learning platform for **everyone, in every subject**: nursing, medicine, law, history, literature, languages, accounting, biology, economics, engineering, and anything else a student uploads.

The test case that defines success:

> A nursing student (non-engineer) photographs her handwritten notes on gastrostomy feeding and pastes a Word note on dyspnoea (respiratory, cardiac, blood, neurological, metabolic causes). Within a few minutes she is inside an interactive world built from *her own notes*. She learns by doing: cases, sequencing, procedure simulations, quick recall, spaced review. After a week she still remembers it. She never has to configure anything.

The product promise: **her notes stay the source of truth, but she stops re-reading them and starts using them.**

### 1.1 Why this is hard (so you design around it)

- Notes are not content for apps. They are messy: handwriting, OCR errors, typos, copy-paste junk, duplicated sections, contradictions, half-sentences.
- Dense factual subjects (anatomy, pharmacology, nursing procedures, law) do not become fun by sprinkling points on them. They become memorable by **retrieval, spacing, sequencing, contrast, and application to cases**.
- AI models differ wildly in reliability. A design that only works with the best model is a bad design. The structure must make weak models succeed.

### 1.2 The core idea in one paragraph

Never let a model freely invent screens or code. Instead: (1) turn the document into a **verified Knowledge Model** (small atomic facts, each anchored to the exact place in the source); (2) have the model **fill fixed Activity Templates** with those facts, in strict JSON; (3) have **deterministic app code** validate, ground-check, and render the activities inside a **World** (a themed map made from fixed visual building blocks); (4) schedule everything with **spaced repetition** so it sticks. Models produce *data*. The app owns *structure, UI, scoring, and memory*. That is what makes it work identically with Groq, Qwen, Gemini, or anything else.

---

## 2. Hard rules (the Design Contract)

### Product and safety rules

- **R1.** The student's uploaded content is the source of truth. Every fact shown as "from your notes" MUST carry a verifiable source anchor (section 6.2). Facts the AI adds from general knowledge MUST be labeled **"AI-added"** with a distinct visual badge, MUST be off by default, and MUST never appear in scored exam-style questions unless the student switches on "Enrichment mode".
- **R2.** MUST NOT silently "fix" the student's notes. If something looks wrong, contradictory, or unreadable, flag it for the student to confirm (section 8). The student's lecturer is the authority, not the AI.
- **R3.** MUST NOT present learning-style metrics (visual/auditory/kinesthetic) or any trait the platform cannot actually measure. Personalisation is based on measured performance only (accuracy, response time, recall after delay).
- **R4.** MUST NOT add any feature that uploads or executes arbitrary user code. Algorithms and code appear only as static, trace-by-hand puzzles.
- **R5.** Any social or messaging surface MUST ship with moderation from day one.
- **R6.** Dark mode is the only theme. MUST NOT reintroduce a light theme. Visual variety comes from World themes (section 12), which are palettes *within* dark.
- **R7.** For medicine, nursing, pharmacology, and law content show a persistent, unobtrusive notice: "Study aid built from your notes. Not clinical or legal advice. Follow your lecturer and local protocols." Never present generated clinical content as authoritative for real patient care.
- **R8.** Student data: minimum necessary. Uploaded documents are private to the uploader (or class, if a teacher uploaded them to a class). MUST be deletable by the owner of the upload, with derived worlds deleted too.
- **R9.** No dark patterns: no guilt-trip notifications, no loss-aversion hearts that lock learning, no fake urgency. Streaks MAY exist but with forgiveness (freeze days).

### AI architecture rules

- **R10.** Model assignment MUST come only from admin-set configuration (section 4.3). NO model name is hardcoded anywhere in code, prompts, or comments.
- **R11.** Every model call that returns structure MUST go through the single `generateStructured()` gateway (section 4.2): JSON-only, schema-validated, repaired, retried, and failed over. No ad-hoc `fetch` to a model elsewhere in the codebase.
- **R12.** Models MUST NOT output HTML, CSS, JavaScript, SVG, or markup to be rendered. They output JSON data matching schemas. UI is rendered by fixed components.
- **R13.** No per-user or per-request app-side AI quota or token cap for teachers creating classes. (Protect the system with concurrency control and queueing, section 17, not with refusal.)
- **R14.** Every generated learning item MUST pass the deterministic **grounding check** (section 9.3) before it can be shown to a student. Items that fail are discarded or regenerated, never shown.
- **R15.** Prompts MUST be versioned, stored as files in the repo (`/prompts`), and loaded by name. Never inline long prompts in business logic.
- **R16.** Pipeline stages MUST be idempotent and resumable. A browser refresh, a serverless timeout, or a model failure MUST NOT lose work or double-bill.

### Engineering rules

- **R17.** Direct Firestore document lookups beat list-and-filter. Any compound query MUST have its composite index declared in `firestore.indexes.json` and verified (section 15.3). A missing index is a silent hang.
- **R18.** Dashboards and progress MUST read from Firestore, never from stale local session state.
- **R19.** Real-time by default: pipeline progress, new worlds, and review queues update via Firestore listeners. The user MUST never need to refresh the page.
- **R20.** Accessibility is a requirement, not polish (section 14.5).
- **R21.** Mobile-first and low-bandwidth tolerant. Many users are on phones and unstable networks (section 14.6).
- **R22.** Preserve the existing stack and conventions found in Phase 0. Do not introduce a UI framework the repo does not already use without asking.

---

## 3. Phase 0 — Repository discovery (do this before any code)

The owner's notes show SunRoot has existed in two forms (a vanilla TypeScript + Vite app with Firebase Auth/Firestore and a Vercel serverless `/api/ask` proxy to Groq; and a Synapta/SunRoot learning platform deployed on Vercel with Firebase and Gemini, with classes, teacher dashboards, node maps, and an AI teacher). **Do not assume which you are in.** Inspect and report.

Do all of this and write the findings to `docs/worlds/PHASE0_FINDINGS.md` before coding:

1. Framework, bundler, language, package manager, node version, lint and test setup.
2. How routing and views are rendered (SPA router? component pattern?). Find the closest existing page to copy structure from (a class page, study-set generator, or node map).
3. Existing AI plumbing: where model calls happen, env var names, the serverless function layout, any existing model-routing or admin-settings code. Reuse it; wrap it behind `generateStructured()`.
4. Firebase: collections that already exist (`classes`, `invites`, users, progress, study sets, leaderboards), security rules, `firestore.indexes.json`.
5. Existing gamification (XP, leaderboards, streaks, badges). Extend, do not duplicate.
6. Existing document upload / document library / study-set generator code. Worlds should build on top of it.
7. Serverless time limits on the host (Vercel function max duration for the current plan) because the pipeline must fit (section 17).
8. List risks and conflicts with this spec. If a conflict needs an owner decision, stop and ask one clear question with a recommended default.

---

## 4. Model-agnostic AI layer

### 4.1 Provider interface

Create `src/ai/` (or the repo's equivalent) with:

```ts
type Capability = 'json_schema' | 'json_mode' | 'vision' | 'long_context' | 'streaming' | 'tool_use';

interface ModelProfile {
  id: string;                 // provider-qualified id, comes from admin config only
  provider: string;           // 'groq' | 'gemini' | 'openai-compatible' | ...
  capabilities: Capability[];
  contextTokens: number;      // admin-provided
  maxOutputTokens: number;
  tier: 'tiny' | 'standard' | 'strong';   // drives batch sizes (4.4)
}

interface ProviderAdapter {
  call(req: {
    model: ModelProfile;
    system: string;
    user: string;
    images?: { mime: string; dataBase64: string }[];
    jsonSchema?: object;       // used only if model has 'json_schema'
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; usage?: { in: number; out: number } }>;
}
```

Write one adapter per provider family. An "OpenAI-compatible" adapter covers Groq, Qwen endpoints, and most others. A Gemini adapter covers Gemini. Adding a new provider MUST require only a new adapter and an admin config entry.

### 4.2 `generateStructured()` — the only door

```ts
generateStructured<T>({
  task: TaskName,              // routes to a model chain, see 4.3
  promptName: string,          // file in /prompts
  promptVars: Record<string,string>,
  schema: ZodType<T>,          // zod schema, source of truth for validation
  images?: ...,
  maxRepairs?: number,         // default 2
}): Promise<{ data: T; meta: { modelId: string; repairs: number; latencyMs: number } }>
```

Algorithm (MUST implement exactly):

1. Resolve model chain for `task` from admin config (primary, then fallbacks).
2. Build the prompt from the named file plus vars. Always prepend the **Universal Preamble** (section 4.5).
3. If the model has `json_schema`, pass the JSON schema; else if `json_mode`, request JSON mode; else rely on the prompt alone.
4. Parse: strip markdown fences, strip any text before the first `{`/`[` and after the matching close (brace-matching, not regex-greedy), `JSON.parse`.
5. Validate with zod. On failure, **repair loop**: send the model its own output plus the exact zod error paths and ask for corrected JSON only. Max `maxRepairs`.
6. If still failing, fail over to the next model in the chain with the original prompt. If the chain is exhausted, return a typed error; the pipeline marks that unit `needs_retry` (never crash the job).
7. Log model id, repairs, latency, and token usage to the job doc (for admin visibility). Never log raw student document text to third-party logs.
8. Temperature: 0.0–0.3 for extraction/validation tasks, up to 0.7 only for creative text (mnemonics, hooks).

### 4.3 Admin configuration (no hardcoded models)

Firestore doc `config/ai` (admin-writable only):

```ts
interface AiConfig {
  models: Record<string, ModelProfile>;          // registry
  routes: {
    ingest_vision:  string[];   // model keys in priority order
    outline:        string[];
    extract:        string[];
    audit:          string[];
    world_design:   string[];
    activity_gen:   string[];
    grader:         string[];   // high-stakes grading of free text
    tutor_chat:     string[];
    hook_creative:  string[];
  };
  limits: { maxConcurrentJobs: number; maxChunkTokens: Record<'tiny'|'standard'|'strong', number> };
}
```

If a route is empty, the admin UI shows a clear "assign a model to this task" warning and the pipeline refuses to start with an actionable message. Provide a small admin screen to edit this doc and a **Model Conformance Test** button (section 19.4) that runs the golden fixtures against a chosen model and reports pass/fail per stage.

### 4.4 Tier-aware batching (this is how weak models succeed)

| Tier | Max input chunk | Items per call | Extra rules |
|---|---|---|---|
| tiny | ~1,500 tokens | ≤ 5 | One task per call, shortest possible schema, mandatory few-shot example in prompt |
| standard | ~4,000 tokens | ≤ 12 | Normal |
| strong | ~10,000 tokens | ≤ 25 | May combine S3+S4 |

The pipeline reads `tier` and adjusts chunk size and batch size. The same prompts and schemas are used for every tier; only the batching changes.

### 4.5 Universal Preamble (prepended to every prompt)

```
You are a precise data-extraction and content-structuring engine inside a learning app.
Output ONLY valid JSON that matches the requested schema. No prose, no markdown fences, no comments.
Never invent facts. Use only the provided SOURCE text unless a field is explicitly marked "ai_added".
Copy source excerpts character-for-character; do not paraphrase inside "excerpt" fields.
If information is missing, use null or an empty array as the schema allows. Do not guess.
Write all learner-facing text in the same language as the SOURCE.
Keep learner-facing sentences short (max 22 words) and concrete.
```

### 4.6 Prompt file contract

Each file in `/prompts/<name>.v<N>.md` has: `# Purpose`, `# Input variables`, `# Instructions`, `# Output schema (human summary)`, `# Few-shot example (input → output)`, `# Failure modes to avoid`. Few-shot examples MUST be drawn from the fixtures in section 19.1 so they are tested.

---

## 5. The pipeline at a glance

```
Upload (docx, pdf, images, pasted text, URL?)
  → S0 Ingest & clean            (OCR + junk cleanup + confidence flags)
  → S1 Structure / outline       (headings, sections, tables, lists)
  → [HUMAN REVIEW GATE 1]        (student confirms outline + flagged text)
  → S2 Subject detection         (picks Subject Pack)
  → S3 Knowledge extraction      (atomic Knowledge Units, source-anchored)
  → S4 Graph & merge             (relations, duplicates, merge into existing class map)
  → S5 Quality & conflict audit  (contradictions, gaps, low confidence)
  → [HUMAN REVIEW GATE 2]        (student resolves conflicts; skippable)
  → S6 World design              (zones, nodes, quests, theme)
  → S7 Activity generation       (fill templates from Knowledge Units)
  → S8 Validation & grounding    (deterministic; discard bad items)
  → S9 Publish & preview         (world goes live; review queue seeded)
```

Each stage reads/writes Firestore job state and can be re-run alone (R16). The student sees a friendly progress screen with stage names in plain language ("Reading your notes", "Finding the key facts", "Building your world") and may leave and come back.

---

## 6. Data schemas (zod is the source of truth; TypeScript shown for readability)

### 6.1 Document and chunks

```ts
interface SourceDoc {
  id: string; ownerUid: string; classId?: string;
  kind: 'docx'|'pdf'|'image'|'text'|'url';
  title: string; language: string;           // BCP-47, detected
  pages: SourcePage[];                       // after S0
  status: 'uploaded'|'cleaned'|'outlined'|'reviewed';
}
interface SourcePage {
  pageNo: number; imageRef?: string;
  lines: { lineNo: number; text: string; confidence: number /*0..1*/; flagged?: boolean }[];
}
```

### 6.2 Source anchor (the backbone of grounding)

```ts
interface SourceAnchor {
  docId: string; pageNo: number;
  lineStart: number; lineEnd: number;
  excerpt: string;          // verbatim substring of the cleaned source text
}
```

### 6.3 Knowledge Unit (KU) — the atom of the whole app

```ts
type KUType =
  | 'definition' | 'cause' | 'risk_factor' | 'sign_symptom' | 'mechanism_step'
  | 'drug' | 'procedure_step' | 'indication' | 'contraindication' | 'complication'
  | 'prevention' | 'nursing_action' | 'rationale' | 'diagnostic' | 'classification'
  | 'formula' | 'date_event' | 'rule' | 'case_holding' | 'vocab' | 'example' | 'misc';

interface KnowledgeUnit {
  id: string;
  conceptId: string;               // which Concept it belongs to
  type: KUType;
  statement: string;               // ONE fact, <= 25 words, self-contained
  question: string;                // a cue that elicits the statement ("What is a first-line sign of X?")
  answer: string;                  // short answer (<= 12 words) for recall cards
  extra?: Record<string, string>;  // type-specific fields, e.g. {drug:'Isoniazid', class:'Anti-TB', adverse:'Hepatotoxicity'}
  order?: number;                  // for ordered sequences (procedure steps, mechanism chains)
  critical?: boolean;              // safety-critical, e.g. "do not use the tube for the first 4-6 hours"
  source: SourceAnchor;
  provenance: 'notes' | 'ai_added'; // R1
  confidence: number;              // 0..1, from OCR + extraction agreement
  tags: string[];
}
```

### 6.4 Concept and graph

```ts
interface Concept {
  id: string; name: string;
  kind: 'condition'|'procedure'|'process'|'drug_class'|'case'|'event'|'theme'|'topic';
  parentId?: string;               // hierarchy: topic > concept > sub-concept
  summary: string;                 // <= 40 words, from notes
  kuIds: string[];
}
interface Relation {
  from: string; to: string;
  type: 'causes'|'leads_to'|'part_of'|'treated_by'|'contrasts_with'|'prerequisite_of'|'example_of';
  source?: SourceAnchor;
}
```

### 6.5 World, Zone, Node, Beat

```ts
interface World {
  id: string; classId?: string; ownerUid: string;
  title: string; subjectPackId: string; themeId: ThemeId;
  zones: Zone[]; version: number;
  stats: { kuCount: number; activityCount: number };
}
interface Zone {
  id: string; title: string; conceptIds: string[];
  nodes: Node[]; boss: BossSpec; unlock: { requiresZoneId?: string; minMastery: number };
}
interface Node {            // one lesson, ~5-7 minutes
  id: string; title: string; conceptId: string;
  beats: Beat[];            // the lecture loop, section 11
  activityIds: string[];
  estMinutes: number;
}
interface Beat {
  id: string;
  kind: 'hook'|'teach'|'check'|'contrast'|'worked_example'|'recap';
  text: string;             // <= 90 words, from KUs
  kuIds: string[];          // MUST reference real KUs (R14)
  visual?: VisualSpec;      // from the fixed visual library (12.3)
  checkActivityId?: string; // retrieval before moving on
}
```

### 6.6 Activity (discriminated union — see section 10 for each template)

```ts
interface ActivityBase {
  id: string; nodeId?: string; kuIds: string[];
  template: ActivityTemplateId;
  difficulty: 1|2|3;
  explain: string;          // shown after answering: why, <= 40 words
  anchors: SourceAnchor[];  // grounding for the answer
  provenance: 'notes'|'ai_added';
}
```

---

## 7. Stage specifications and prompts

Each stage lists: input, output, prompt skeleton, and deterministic checks. Put the prompt text in `/prompts` files.

### S0 — Ingest & clean

**Inputs:** docx, pdf, images (including handwriting), pasted text.
**Process (deterministic where possible):**

1. docx: extract text with structure (headings, lists, tables) using a library, not a model.
2. pdf: text layer first; if empty or garbled, rasterize pages and use vision OCR.
3. images/handwriting: vision model with the OCR prompt below, one page per call, returning lines with confidence.
4. Cleanup (rule-based first, model second):
   - Remove citation and tool artefacts such as stray `�`, repeated source tags (for example standalone "CDC" or "World Health Organization" lines after sentences), and assistant boilerplate lines like "In the next part, I will cover..." or "Next: Comprehensive Note on ...". These appear in real student documents pasted from chat tools.
   - Normalise bullet glyphs, merge hard-wrapped lines, fix common symbol substitutions (for example a stray `®` or `€` after a drug name in a list like "Rifampicin ®" and "Ethambutol €" meaning the letters (R) and (E) of the RHZE regimen). Flag these as "symbol repaired" rather than silently changing them.
   - Detect and remove exact duplicate paragraphs (keep first, log removal).
5. Store `confidence` per line. Any line < 0.75 is `flagged` for Review Gate 1.

**OCR prompt (vision tasks) — skeleton:**

```
TASK: Transcribe this handwritten notebook page exactly.
RULES: Keep the author's wording and spelling. Keep headings as headings (mark with "# "). Keep numbering and arrows.
For each line output text and a confidence 0-1. If a word is unclear, put your best guess and lower the line confidence.
Do NOT correct medical or technical terms. Do NOT summarize.
Return: {"lines":[{"text":"...","confidence":0.0}]}
```

**Fixture to remember:** a handwritten line says peristomal infection is "the most common complication (5-6?% cases)". A good OCR run MUST lower confidence on the number and the app MUST ask the student to confirm it instead of guessing.

### S1 — Structure / outline

**Input:** cleaned pages. **Output:** outline tree of sections with line ranges; detect lists, tables, procedures (numbered steps), definitions, and "Nursing management"-style repeated sub-headings.

```ts
interface Outline { sections: { id:string; title:string; level:number; lineStart:number; lineEnd:number; pageNo:number; kindHint:'definition'|'list'|'procedure'|'table'|'prose'|'mixed' }[] }
```

**Prompt skeleton:** "Given numbered lines, return the section tree. Use ONLY line numbers that exist. Do not rewrite text." **Check (deterministic):** ranges cover the doc without gaps/overlaps; every title string appears in the source lines (fuzzy ≥ 0.9).

**Pattern recogniser (rule-based, before the model):** repeated headings such as DEFINITION / CAUSES / PATHOPHYSIOLOGY / SIGNS AND SYMPTOMS / PREVENTION / MEDICAL MANAGEMENT / PHARMACOLOGICAL MANAGEMENT / NURSING MANAGEMENT strongly imply a *condition template*. Numbered "PROCEDURE" steps and "REQUIREMENT" lists imply a *procedure template*. Pass these as hints to the model.

### Review Gate 1 (UI, 30–60 seconds)

Show the outline as an editable tree next to the original page images or text. The student can rename, merge, split, delete sections, and confirm flagged lines (side-by-side original vs transcription, one tap to accept/edit). A big "Looks good, build my world" button. This is the highest-leverage quality step. Do not skip it, but allow "Auto-accept" for returning users.

### S2 — Subject detection

**Output:** `{ subjectPackId, secondaryPackIds[], language, audienceLevel: 'school'|'undergrad'|'professional', confidence }`. Choose from available Subject Packs (section 13). If confidence < 0.6, use the `general` pack and let the student change it in one tap. Rule-based keyword scoring first; model confirms.

### S3 — Knowledge extraction (the most important stage)

**Input:** one outline section (plus section title path) at a time, sized by tier. **Output:** array of KUs. The Subject Pack supplies the **ontology** (which KU types to look for and what `extra` keys to fill).

**Prompt skeleton (standard):**

```
SOURCE (lines numbered). SECTION PATH: {path}. SUBJECT PACK ONTOLOGY: {ontology}.
Extract every distinct fact worth learning as Knowledge Units.
Rules:
1. One fact per unit. If a line holds two facts, make two units.
2. "statement" must be understandable alone (restate the subject; no "it", "this").
3. "question" must have exactly one correct short answer that equals "answer".
4. "excerpt" must be copied exactly from the lines in lineStart..lineEnd.
5. Mark order for sequences (procedure steps, pathophysiology chains).
6. Mark critical=true for safety-critical warnings, contraindications, and "never/do not" instructions.
7. Include nothing that is not in SOURCE.
Return JSON: {"units":[...]}
```

**Deterministic checks:** excerpt exists in cited lines (fuzzy ≥ 0.9); statement ≤ 25 words; answer ≤ 12 words; no duplicate statements (normalised Jaccard ≥ 0.85 → merge). Units failing checks are re-asked once with the specific failure, then dropped and counted in the job report.

**Coverage check:** compare extracted unit lines against section lines. If > 15% of non-heading lines are unreferenced, run a "missed facts" pass over only the uncovered lines.

**Sequences are special.** Pathophysiology chains ("Irritant exposure → chronic inflammation → airway narrowing → air trapping → hypoxaemia") and procedure steps MUST be extracted as ordered KUs (`order` set), because they power ordering and simulation activities.

### S4 — Graph and merge

1. Group KUs into Concepts by section (condition, procedure, etc.).
2. Add Relations (causes, contrasts_with, part_of, treated_by). Example: "Heart failure → pleural effusion (transudative)"; "COPD vs asthma" contrasts; "orthopnoea and PND occur in left ventricular failure".
3. **Merging into an existing class map** (the owner wants uploaded documents routed into the map: add new or merge): for each new Concept, compare with existing concepts using normalised name match + embedding or token-overlap similarity. Decision: `merge` (≥ 0.85, same kind) → append new KUs to the existing concept, dedupe; `link` (0.6–0.85) → create new concept with a `related_to` relation and show a "similar to" chip; `new` (< 0.6). Always record a merge log; allow undo for 24 hours.
4. Mark **look-alike groups** (concepts that share ≥ 40% of sign/symptom KUs) for contrast activities.

### S5 — Quality and conflict audit

Run deterministic checks first, model second.

- **Internal conflicts:** same concept, same attribute, different values. Fixture: handwritten gastrostomy notes say to clean the stoma "1–2 times daily" in one place and "daily (twice daily)" / "three times daily" in another. Detect by grouping KUs with the same `conceptId` + `type` + overlapping subject nouns and asking the model to compare pairs only when token similarity is high. Output a `Conflict { kuIdA, kuIdB, why }`.
- **Out-of-range numbers:** flag unusual values for the student to confirm (not to correct).
- **Gaps:** a condition template missing expected sections (for example no "Prevention") is noted as "not in your notes", which is informational and never auto-filled (R1).
- **Low confidence KUs** (< 0.7) go to the review list.

Output: `AuditReport { conflicts[], lowConfidence[], gaps[] }` shown at Review Gate 2 as a short card list: "Your notes say two different things here. Which is right?" The student's answer becomes the canonical KU; the other is marked `superseded`.

### S6 — World design

**Input:** Concepts, Relations, Subject Pack theme candidates. **Output:** a `World` skeleton: zones, node order, theme, boss specs.

Design rules:

- **Zones = top-level topics.** Keep 3–8 zones. If more, group.
- **Nodes = lessons of 5–7 minutes.** A node covers 6–14 KUs. Split large concepts (for example "Pneumonia" may be one node; "COPD" two).
- **Order:** prerequisites first (use `prerequisite_of`), then by document order. Procedures after their related concepts. The first node of the world MUST be a quick win (≤ 4 minutes, high success rate).
- **Boss per zone:** a mixed, interleaved challenge pulling from every node in the zone plus 20% from earlier zones.
- **Theme:** choose from the Subject Pack's `themes`, student can change it later (12.2).
- Naming: titles are concrete and plain ("Pulmonary Embolism: Spot the Clot", not "Module 3"). Max 5 words, from the notes' vocabulary.

The model proposes; **deterministic code enforces** counts, ordering constraints, and that every KU is assigned to exactly one node.

### S7 — Activity generation

For each node, the app builds an **Activity Plan** by rule, then asks the model to fill each slot. The model never decides which templates exist; the Subject Pack and KU types decide (section 10.2 mapping table). Each call gets: the KUs (with ids), the template schema, 1 few-shot example, and the instruction to return only that template's JSON.

Per node produce at minimum: 1 hook, 3–5 teach beats each followed by a check, 1 contrast or worked example if applicable, 1 mixed recap, plus activities covering **every KU at least twice with different templates**.

Difficulty progression inside a node: 1 (recognise) → 2 (recall) → 3 (apply to a case or sequence).

### S8 — Validation and grounding (deterministic, mandatory — R14)

See 9.3 for the full rules. Items that fail are regenerated once with the failure reason, then dropped. The job report lists how many items were dropped and why. If a node ends with < 70% KU coverage, mark it `thin` and show it as "Practice only" instead of a full lesson.

### S9 — Publish

Write the world, nodes, activities, and seed per-user FSRS cards for first-seen KUs (not yet due; they become due after the first exposure). Fire a real-time notification ("Your world is ready"). Open the world map with the first node highlighted.

---

## 8. Human-in-the-loop UX (what makes it trustworthy)

- **Side-by-side verification:** for any flagged item show the original image/line next to the transcription.
- **One-tap confirm** for numbers, drug names, doses.
- **Conflict cards:** two quotes, two buttons ("This one", "That one"), plus "Ask my lecturer later" which adds the item to a personal "To confirm" list.
- **"From my notes" vs "AI-added" badges** on every fact and activity.
- **Report a problem** button on every activity (wrong answer, unclear, not in my notes). Reports feed an admin queue and automatically deprioritise that item for the reporter.

---

## 9. Quality gates

### 9.1 Schema validity
Zod validation at every boundary (model output, Firestore reads of generated content, API requests).

### 9.2 Pedagogical lint (deterministic)
- MCQ: exactly one correct option; 3–4 options; options not identical after normalisation; no "all of the above"/"none of the above"; options within ±40% of each other in length (avoid "longest answer wins"); correct option position is randomised by the app, not the model.
- Cloze: blank must be a content word or a number/drug name; never a stop word.
- Ordering: 3–7 items, strictly ordered KUs, no ties.
- Case vignette: must not contain the answer term verbatim in the stem.
- Teach beat: ≤ 90 words, ≤ 22 words per sentence.

### 9.3 Grounding check
For each activity:
1. Every `kuIds` entry exists.
2. Every `anchors[].excerpt` is a substring (fuzzy ≥ 0.9) of the cleaned source.
3. The **correct answer string** (or each correct element) appears in, or is entailed by, one of the cited KU statements. Implement as: normalised substring/token-overlap ≥ 0.8 against KU `answer` or `statement`. If a model-based entailment check is used, it is a second line of defence, never the only one.
4. Distractors MAY come from other KUs in the same concept or look-alike concepts (preferred, since they teach contrast) or from the Subject Pack's distractor lists. Distractors MUST NOT be factually the same as the correct answer.
5. `provenance: ai_added` items are excluded from scoring and from the review queue unless Enrichment mode is on.

### 9.4 Safety-critical items
KUs with `critical: true` MUST be practiced in at least one "never event" style activity and MUST be shown with a distinct marker. Wrong answers on critical items return the student to a short corrective beat.

---

## 10. Activity template library

All templates share `ActivityBase`. The renderer for each is a fixed component. Models only fill fields.

### 10.1 Catalogue

| ID | Name | Use for | Core fields |
|---|---|---|---|
| `flip_recall` | Flip card with self-rating | any KU | `prompt`, `answer` |
| `cloze` | Fill the missing key term | definitions, drug-action, rules | `text`, `blanks[{answer, accept[]}]` |
| `mcq` | Single best answer | everything | `stem`, `options[]`, `correctIndex`, `distractorWhy[]` |
| `ordering` | Put steps in order | procedures, pathophysiology, timelines | `items[]` (in correct order; app shuffles) |
| `matching` | Pair up | drug↔class↔adverse effect, term↔definition | `pairs[{left,right}]` |
| `classify` | Drag into buckets | acute vs chronic, causes by system, transudate vs exudate | `buckets[]`, `items[{text,bucket}]` |
| `case_vignette` | Short patient/scenario, choose diagnosis or next action | signs, differential, priority | `stem`, `question`, `options[]`, `correctIndex`, `clues[]` |
| `procedure_sim` | Branching bedside simulation | any step-based skill | `scenario`, `steps[{prompt, choices[{text,correct,consequence}]}]` |
| `spot_the_error` | Find the unsafe/incorrect step or statement | procedures, rules | `items[]`, `errorIndex`, `why` |
| `contrast_table` | Fill a compare table | look-alike diseases | `columns[]`, `rows[{attribute, cells[]}]`, `blanks[]` |
| `why_chain` | Complete a cause→effect chain | mechanisms | `chain[]` (ordered), `hiddenIdx[]` |
| `rationale_pick` | Match nursing action to its reason | nursing/clinical, ethics | `action`, `options[]`, `correctIndex` |
| `teach_back` | Explain in own words, AI-graded against rubric | deep understanding | `prompt`, `rubric[{point, mustMention[]}]` |
| `mnemonic_builder` | Create or choose a memory hook | long lists | `list[]`, `suggestions[]` (AI creative, labeled) |
| `hotspot_label` | Label parts of a diagram | anatomy, circuits, maps | `diagramId` (from fixed library), `labels[]` |
| `calc_walkthrough` | Stepwise calculation with deterministic checking | math, physics, finance, dosage-style arithmetic | `given`, `steps[{prompt, expr, expected}]` |
| `source_analysis` | Short source with guided questions | history, literature, law | `source`, `questions[]` |
| `boss` | Timed mixed challenge | end of zone | `pool: activityIds[]`, `rules` |

### 10.2 Mapping: KU type → recommended templates

| KU type | Primary templates | Secondary |
|---|---|---|
| definition | flip_recall, cloze | mcq |
| cause / risk_factor | classify, mcq | flip_recall |
| sign_symptom | case_vignette, matching | contrast_table |
| mechanism_step | ordering, why_chain | cloze |
| drug | matching, mcq | cloze, case_vignette |
| procedure_step | ordering, procedure_sim, spot_the_error | cloze |
| nursing_action + rationale | rationale_pick, procedure_sim | teach_back |
| indication / contraindication | classify, case_vignette | mcq |
| complication | case_vignette, mcq | flip_recall |
| prevention | mcq, classify | flip_recall |
| formula | calc_walkthrough | flip_recall |
| date_event | ordering (timeline) | matching |
| case_holding / rule | source_analysis, mcq | teach_back |
| vocab | flip_recall, matching | cloze |

### 10.3 Detailed schemas for the most important templates

**`procedure_sim`** (this is the signature feature for practical subjects):

```ts
interface ProcedureSim extends ActivityBase {
  template: 'procedure_sim';
  scenario: string;                    // 1-2 sentences, from notes' context
  steps: {
    id: string;
    kuId: string;                      // the procedure_step KU this tests
    prompt: string;                    // "The patient is in bed. What do you do first?"
    choices: { text: string; correct: boolean; consequence: string }[]; // exactly one correct
    criticalIfWrong?: boolean;         // triggers corrective beat (9.4)
  }[];
  scoring: { perfectBonus: number };
}
```
Rules: choices ≤ 4; consequences are short and concrete ("Air enters the tube and the patient may get abdominal distension."); consequences MUST be consistent with the notes (grounded) or marked AI-added and shown dimmed. The wrong choices should come from realistic mistakes: skipped hand hygiene, wrong position, skipped verification.

**`ordering`:** the *correct order is the KU `order`*. The model only writes the display text; the app enforces order from KU metadata, never from model-claimed order.

**`case_vignette`:** stem presents 3–5 clues (signs, history, vitals) without naming the condition. The question asks for diagnosis, priority action, or likely complication. Options come from the look-alike group. Provide `clues[]` so the explanation can highlight which clue pointed where.

**`teach_back`:** the grader prompt (task `grader`) receives rubric, student answer, and the cited KUs. It returns `{ covered: [pointIds], missed: [pointIds], feedback: string<=40 words }`. Scores are bounded and never treated as "wrong/right" for the FSRS rating by themselves. Show feedback; do not block progress.

**`calc_walkthrough`:** the app computes `expected` with a safe math evaluator. A model never decides whether a number is right.

### 10.4 Scoring and feedback
- Each activity returns `{ correct: boolean | partial, firstTry: boolean, ms: number, hintsUsed: number }`.
- Feedback after every answer: result, the one-line `explain`, and a tap to see the source line in the student's notes ("View in my notes"), which opens the original page at the anchor.
- Never shame. Wrong answers show the right one immediately and offer "try a similar one".

---

## 11. The "lecture loop" (how a node is taught)

Every node is a mini-lecture, 5–7 minutes, driven by data (`beats`). The loop:

1. **Hook (≤ 20 s):** a one-sentence scenario or question from the notes' domain ("A patient wakes at night gasping for air. Why?"). Creative text allowed but MUST be answerable from the node's KUs.
2. **Teach beat (≤ 60–90 s each, 3–5 per node):** a short explanation built from 2–3 KUs, plus an optional fixed visual (12.3). One idea per beat.
3. **Check (immediately after each beat):** one low-stakes retrieval question *before* revealing more. Retrieval, not rereading, is what builds memory.
4. **Contrast beat (when the concept has look-alikes):** side-by-side "Left heart failure vs right heart failure" with a contrast_table check.
5. **Worked example then fade (for procedures and calculations):** first show the full procedure with reasons; second time hide step text and ask the student to supply it (`ordering` → `cloze` → `procedure_sim`). Novices learn procedures better from studying worked examples before problem-solving, then practicing.
6. **Recap (≤ 30 s):** 3 bullet sentences from KUs, then a mixed 5-question quiz including 1–2 items from earlier nodes (interleaving).
7. **Close:** show XP, mastery bars for the KUs, and "Your notes" source links. Seed the review queue.

The student can always **skip to practice** or **open the original notes**. Never trap them in a lecture.

---

## 12. The World (visual and structural design)

### 12.1 What a World is
A themed, navigable map of the student's learning, rendered by fixed components from the `World` JSON. Zones are regions. Nodes are stops. Bosses are gates. Mastery colors the map (locked / new / learning / strong / mastered). The map is the dashboard.

### 12.2 Themes (palettes inside dark mode)

```ts
type ThemeId = 'ward'|'courtroom'|'archive'|'lab'|'studio'|'garden'|'market'|'observatory'|'workshop'|'island';
```

Each theme is a fixed object: color tokens, icon set (inline SVG), map style (path/grid/islands), zone-label style, sounds off by default. Examples:

- `ward` (nursing/medicine): zones are hospital wings, nodes are beds/patient charts, procedures are "Procedure Room" with equipment icons, bosses are "Ward Rounds".
- `courtroom` (law): zones are branches of law, nodes are cases/statutes, bosses are "Moots".
- `archive` (history/literature): zones are eras/works, nodes are documents/chapters, timeline path.
- `lab` (sciences), `workshop` (engineering), `studio` (arts/design), `market` (business/economics), `garden` (biology/agriculture), `observatory` (physics/astronomy), `island` (generic fallback).

The Subject Pack lists candidate themes; the student can switch theme any time. Themes change visuals only, never content.

### 12.3 Fixed visual library (no model-generated graphics)
Components models may *reference by id*: `flow_chain`, `compare_columns`, `timeline`, `body_system_icon`, `cycle`, `pyramid`, `venn`, `bar_chart`, `equation_card`, `step_stairs`, `anatomy_outline_{system}` (simple SVG outlines authored by the team). Beats carry `visual: { component: 'flow_chain', data: {...} }`. Unknown ids are dropped by validation.

### 12.4 Animation budget
Animations are short (≤ 300 ms), meaningful (state change, success, unlock), and respect `prefers-reduced-motion`. No autoplay audio.

---

## 13. Subject Packs (the extension point that makes it work for every subject)

A Subject Pack is a data file (`/subject-packs/<id>.json`) plus optional few-shot examples. Adding a subject MUST NOT require code changes in the pipeline.

```ts
interface SubjectPack {
  id: string; name: string; keywords: string[];       // for rule-based detection
  concepts: { kind: ConceptKind; template: string[] }[];   // ordered sections expected
  ontology: KUTypeSpec[];                              // what to extract, with extra keys
  activityPreferences: Record<KUType, ActivityTemplateId[]>;
  themes: ThemeId[];
  distractorHints: string[];                            // where to draw plausible wrong answers
  pitfalls: string[];                                   // model warnings injected into prompts
  disclaimer?: string;
}
```

### 13.1 Packs to ship in v1

**`nursing_medical`** (primary test case)
- Concept templates: *Condition* = Definition → Causes/Risk factors → Pathophysiology (ordered chain) → Signs & symptoms → Diagnostics → Prevention → Medical management → Pharmacological management → Nursing management (action + rationale) → Complications. *Procedure* = Definition → Indications → Contraindications → Requirements/equipment → Steps (ordered) → Aftercare → Complications → Documentation.
- Extract drugs as `drug` KUs with `extra: {drug, class, action, adverse, nursingNote}`.
- Nursing management lines become `nursing_action` KUs and, when the notes give a reason, a paired `rationale` KU.
- Prefer: `case_vignette`, `ordering`, `procedure_sim`, `rationale_pick`, `contrast_table`, `matching`.
- Contrast groups: left vs right heart failure, COPD vs asthma, ischemic vs hemorrhagic stroke, DKA vs metabolic acidosis in general, transudate vs exudate, MI vs heart failure, pneumothorax vs tension pneumothorax, GBS vs myasthenia gravis.
- Pitfalls: never alter doses; never merge two drugs; preserve "do not" statements; keep drug abbreviations (RHZE) intact; do not add reference ranges that are not in the notes.
- Themes: `ward`, `lab`.
- Disclaimer: R7.

**`law`**
- Concepts: *Case* = Facts → Issue → Rule → Holding → Reasoning → Significance; *Statute* = Provision → Elements → Exceptions → Remedies; *Doctrine*.
- Prefer: `source_analysis`, `case_vignette` (apply rule to new facts), `classify` (element present/absent), `mcq`, `teach_back` (IRAC).
- Pitfalls: never invent citations; quote only the student's own text.
- Themes: `courtroom`, `archive`.

**`history_social`**
- Concepts: *Event* = When → Who → Causes → Course → Consequences → Significance; *Period*; *Source*.
- Prefer: `ordering` (timeline), `why_chain`, `matching` (person↔role), `source_analysis`, `classify` (short/long-term causes).
- Themes: `archive`.

**`literature_arts`**
- Concepts: *Work* = Author/context → Plot → Characters → Themes → Motifs/devices → Key quotes (only from student's notes).
- Prefer: `matching` (character↔trait), `classify` (device types), `teach_back` (theme essays), `case_vignette` ("which device is this?").
- Themes: `archive`, `studio`.

**`language_learning`**
- Concepts: *Vocab set*, *Grammar rule* (form, use, exceptions, examples).
- Prefer: `flip_recall` (production first: native→target), `cloze`, `matching`, `ordering` (sentence assembly).
- Pitfall: generate example sentences only in the target language level the notes show.

**`math_physics`**
- Concepts: *Definition*, *Formula* (conditions, units, variables), *Worked example*, *Common errors*.
- Prefer: `calc_walkthrough`, `spot_the_error`, `cloze` (formula parts), `matching` (symbol↔meaning↔unit).
- Pitfall: numeric correctness is computed by code, never by the model.
- Themes: `observatory`, `workshop`.

**`life_sciences`** (biology/chemistry/agriculture)
- Concepts: *Process* (ordered stages), *Structure* (parts↔functions), *Reaction/Cycle*.
- Prefer: `ordering`, `hotspot_label`, `matching`, `classify`, `why_chain`.
- Themes: `garden`, `lab`.

**`business_economics`**
- Concepts: *Concept*, *Model/formula*, *Scenario*, *Journal entry* (accounting).
- Prefer: `case_vignette` (scenarios), `calc_walkthrough`, `classify` (debit/credit, fixed/variable), `contrast_table`.
- Themes: `market`.

**`engineering_cs`** (keeps the existing audience first-class)
- Concepts: *Principle*, *Circuit/system*, *Algorithm* (static trace only, R4), *Standard/spec*.
- Prefer: `calc_walkthrough`, `ordering` (algorithm steps), `spot_the_error`, `hotspot_label` (block diagrams), existing SunRoot simulations linked from nodes where relevant.
- Themes: `workshop`, `lab`.

**`general`** (fallback)
- Concepts: *Topic* → *Concept* (definition, explanation, examples, non-examples, relations).
- Prefer: `flip_recall`, `cloze`, `mcq`, `matching`, `classify`, `why_chain`, `teach_back`.
- Themes: `island`.

### 13.2 Custom packs
Teachers/admins MAY create custom packs from a form (name, section template, themes). Validate with zod. Never execute pack content.

---

## 14. UI/UX rules

### 14.1 Navigation
- Home → **My Worlds** (cards with mastery ring, "Continue" button) → World map → Node (lecture loop) → Practice/Review.
- A persistent **Review (Ward Round)** button shows today's due count. One tap starts a 5–10 minute mixed session.
- An always-visible **"My notes"** drawer opens the source document at any anchor.

### 14.2 Upload experience
- One drop zone: "Drop notes, photos, or paste text". Accept multiple files; allow camera capture on mobile.
- Immediately show a friendly progress screen with the 9 stage names and real-time ticks (R19). Allow leaving.
- Estimated time based on page count; show a preview of the first generated zone as soon as it is ready (progressive reveal) so the wait feels short.

### 14.3 Design tokens (dark only, R6)
Define tokens once (CSS variables): background, surface, surface-raised, border, text, text-muted, accent, success, warning, danger, plus per-theme accent pairs. Contrast ≥ WCAG AA. Provide a type scale, spacing scale (4px base), radius scale. Components consume tokens only; no hard-coded colors in components.

### 14.4 Component inventory (build as reusable, no framework change per R22)
`WorldMap`, `ZoneCard`, `NodeCard`, `LectureBeat`, `ActivityShell` (common chrome: progress, hint, report, source link), one renderer per template, `MasteryRing`, `XPToast`, `ReviewSession`, `ConflictCard`, `OutlineEditor`, `SourceViewer`, `ProgressStages`, `AdminAiConfig`.

### 14.5 Accessibility (R20)
- Full keyboard operation; visible focus; ARIA roles for drag-and-drop with a non-drag alternative (tap to select then tap to place).
- Screen-reader friendly feedback (live regions).
- `prefers-reduced-motion` honored. Optional **Calm mode**: fewer animations, no timers, softer feedback.
- Optional dyslexia-friendly font and larger text. Timed bosses have an untimed option.
- Never rely on color alone for correct/incorrect.

### 14.6 Low-bandwidth and offline (R21)
- Worlds, activities, and the user's FSRS state are cached for offline use (service worker + Firestore offline persistence where the repo supports it). Reviews done offline sync when back online.
- Lazy-load visuals; keep the world JSON compact. Avoid large images; use SVG.

### 14.7 Tone of copy
Warm, short, specific. Examples: "Nice, that's the second-line drug." / "Close. The tube stays untouched for 24 hours so the tract can form." No sarcasm, no shaming, no exclamation overload.

---

## 15. Data model (Firestore)

### 15.1 Collections

```
users/{uid}
  progress/{worldId}                       # summary: xp, streak, lastActiveAt, masteryByZone
  cards/{kuId_worldId}                     # FSRS card: due, stability, difficulty, state, lastReview, reps, lapses
  reviewLogs/{autoId}                      # kuId, rating, ms, templateUsed, ts

sourceDocs/{docId}                         # SourceDoc + pages (subcollection pages/{pageNo})
jobs/{jobId}                               # pipeline state per stage, errors, model meta, counts
knowledge/{worldId}/units/{kuId}           # KnowledgeUnit
knowledge/{worldId}/concepts/{conceptId}
knowledge/{worldId}/relations/{relId}
worlds/{worldId}                           # World skeleton (zones/nodes summarised)
worlds/{worldId}/nodes/{nodeId}            # Node with beats
worlds/{worldId}/activities/{activityId}   # Activity
reports/{reportId}                         # user problem reports on items
config/ai                                  # admin AI config (4.3)
```

Classes: add `classes/{classId}.worldIds[]` to attach worlds to a class. A teacher uploading to a class creates a class-scoped world; students get read access via existing membership rules.

### 15.2 Security rules (principles)
- Owners read/write their own `sourceDocs`, `jobs`, `cards`, `reviewLogs`.
- Class members read class worlds, nodes, activities; only the class teacher/admin writes them.
- `config/ai` writable by admins only; readable server-side only (never ship keys or provider secrets to the client).
- Validate shape in rules for writes the client performs (progress, cards).
- Test the rules (emulator) for: stranger cannot read another user's doc; student cannot edit a class world; admin can.

### 15.3 Indexes (R17)
Declare and verify in `firestore.indexes.json`. Minimum:
- `users/{uid}/cards`: `(worldId ASC, due ASC)` and `(worldId ASC, state ASC, due ASC)`.
- `worlds`: `(ownerUid ASC, updatedAt DESC)` and `(classId ASC, updatedAt DESC)`.
- `jobs`: `(ownerUid ASC, createdAt DESC)`.
- `reports`: `(status ASC, createdAt DESC)`.
Avoid `in` queries across ids that rules may reject; prefer direct gets or small fan-out gets. Every new compound query gets an index entry in the same commit, and the agent runs the emulator or a staging check before declaring done.

---

## 16. Memory engine (spaced repetition + mastery)

### 16.1 Why
Active retrieval, spaced over time, with mixed practice, is among the best-supported ways to make learning last. Evidence also says no strategy works equally for everyone or in every context (for example worked examples can beat extra practice for novices on procedures), which is why this spec combines them and adapts from measured performance only.

### 16.2 Scheduler
Use an existing open-source FSRS implementation (the `ts-fsrs` TypeScript package, MIT-licensed, implements FSRS) rather than writing your own. Wrap it in `src/memory/scheduler.ts`:

```ts
rateFromResult(r: ActivityResult): 1|2|3|4 // Again, Hard, Good, Easy
// wrong -> 1; correct but hint used or slow (>p90 for template) -> 2; correct -> 3; correct, first try, fast -> 4
```

One FSRS card per **KU per user per world**. Activities are *views* of the same KU; answering any activity for a KU updates its card, and the template used is logged so later reviews rotate templates (same fact, different question) to avoid memorising the card rather than the fact.

### 16.3 Review queue builder
- Pull due cards sorted by priority: critical KUs first, then most overdue.
- Cap a session: 20 reviews default (user-adjustable), plus up to 5 new KUs.
- **Interleave:** no more than 3 consecutive items from the same concept; mix templates.
- Choose the template for each review by rotating through that KU's valid templates, preferring higher difficulty as stability rises.
- On weak KUs (lapses ≥ 2) insert a short corrective beat from the source, then re-ask later in the session.

### 16.4 Mastery model
Per KU: `new → learning → review → mastered` (mastered = stability above a threshold and ≥ 3 successful spaced reviews across ≥ 2 templates). Concept and zone mastery = weighted average of KU mastery with critical KUs weighted ×2. Zone unlock uses `minMastery` (default 0.6) but always offers "Test out" (a boss attempt) so strong students are not blocked.

### 16.5 Notifications (R9)
Optional, opt-in, one per day max, text like "12 facts are ready to review (6 minutes)". Never guilt.

---

## 17. Runtime and performance

### 17.1 Resumable job architecture
Serverless functions time out. Therefore:
- The client creates a `jobs/{jobId}` doc and calls `POST /api/worlds/advance` with `{jobId}`.
- Each invocation performs **one bounded unit of work** (for example S3 on up to N sections, or S7 on up to M nodes), writes results and updated stage pointers, then, if work remains, the function re-invokes itself (or the client calls it again on snapshot change). Keep each invocation well under the host's max duration found in Phase 0.
- Units of work are keyed (`stage:sectionId` or `stage:nodeId`) and **idempotent**: re-running overwrites the same doc ids.
- Concurrency: use a lease field on the job (`lockedBy`, `lockedUntil`) so two invocations never process the same unit.
- Parallelism inside a stage: bounded fan-out (default 3–5 concurrent model calls) to respect provider rate limits. On `429`, back off exponentially with jitter and fail over per 4.2.
- Global protection: `limits.maxConcurrentJobs` queues jobs rather than refusing them (R13). Show "You're in line, about N min".

### 17.2 Progressive delivery
After S6, publish the first zone as soon as its S7/S8 finish and let the student start learning while later zones continue building. The map shows remaining zones as "Building…" with live updates.

### 17.3 Cost discipline
- Use rule-based passes before model passes (outline pattern recogniser, dedupe, pedagogical lint).
- Cache by content hash: re-uploading the same document or section reuses results.
- Route cheap/small models to cheap tasks (outline, classification) and stronger ones to extraction and grading, purely through admin routes (R10).

### 17.4 Failure UX
Stage fails → job pauses at that stage, the student sees "We couldn't finish 'Pulmonary Embolism' yet. Retry or continue without it." Never lose the rest of the world.

---

## 18. AI tutor and study helpers (grounded)

- **Grounded chat:** retrieval over the world's KUs and source pages; every answer cites anchors ("From your notes, page 3"). If the answer is not in the notes, say so, then offer an *AI-added* explanation clearly marked.
- **Modes:** "Explain simply", "Exam style", "Quiz me on…", "Compare A vs B", "Make a mnemonic", "Test me on only what I got wrong".
- **Audience modes** (existing idea): school, undergrad, professional, neurodivergent-friendly (shorter beats, more structure, calm mode).
- **Teach-back grading** via the `grader` route (10.3).
- The tutor MUST obey R1 and R7, and MUST NOT give patient-specific clinical advice.

---

## 19. Testing and evaluation

### 19.1 Golden fixtures (commit these under `/fixtures/worlds/`)

1. **`dyspnoea_docx.txt`** — the Word note on dyspnoea (respiratory, cardiovascular, blood, neurological, metabolic causes; Part Two on management). Includes junk to be cleaned (stray `�`, source-tag artefacts, chat boilerplate, "Rifampicin ®" and "Ethambutol €" symbol substitutions).
2. **`gastrostomy_handwritten/`** — 12 photographed notebook pages on gastrostomy feeding, assisted feeding, feeding and elimination problems, and feeding a helpless patient (CamScanner scans).
3. **`history_sample.txt`**, **`law_case_sample.txt`**, **`math_sample.txt`**, **`language_sample.txt`** — short fixtures proving non-nursing subjects work.

Expected facts the pipeline MUST get right (examples; write complete expected JSON files):

- Gastrostomy: "Do not use the tube for the first 4–6 hours after insertion." `critical: true`. "Leave the tube undisturbed for the first 24 hours to allow the stoma tract to form." `critical: true`. Bolus feeding steps ordered (pinch proximal end → attach syringe, hold about 18 inches above the abdomen → fill barrel → let empty gradually and refill → do not let the barrel empty completely to avoid air). Tube dislodgement: place a clean catheter in the stoma immediately to keep the tract open, especially within the first 4 weeks.
- Conflict to detect: stoma-site cleaning frequency appears as "1–2 times daily" and as "daily (three times daily)". The app MUST raise a `Conflict`, not choose one.
- Low-confidence OCR item: the peristomal infection frequency percentage. The app MUST flag it.
- Dyspnoea: COPD pathophysiology chain extracted as an ordered chain; orthopnoea vs PND vs trepopnoea vs platypnoea as a contrast/`matching` set; RHZE drugs as `drug` KUs with the repaired (R)/(E) symbols logged.
- Contrast groups detected: left vs right heart failure features, ischemic vs hemorrhagic stroke, transudative vs exudative effusion.

### 19.2 Automated tests
- Unit: JSON extraction/repair, zod schemas, fuzzy-excerpt matcher, pedagogical lint, merge logic, FSRS wrapper, queue interleaving, scoring.
- Integration (mock providers returning recorded outputs): full pipeline on each fixture, idempotent re-runs, failover, repair loop, tier batching.
- Rules tests (Firebase emulator): section 15.2 cases.
- UI tests for each activity renderer (keyboard path included).

### 19.3 Quality metrics to compute and display in an admin report per job
- KU coverage % of non-heading source lines.
- Grounding pass rate (target ≥ 98% of shown items).
- Items dropped and why.
- Repair rate per model; failover count.
- Median time-to-first-zone.

### 19.4 Model Conformance Test (admin button)
Runs the fixtures through every stage with a chosen model (or chain) and reports, per stage: schema-valid %, grounding pass %, repairs per call, latency, and a pass/fail against thresholds (schema-valid ≥ 95% after repair; grounding ≥ 95%). A model that fails a stage MUST NOT be assignable to that route without a warning. This is how "any model works" is verified instead of assumed.

### 19.5 Human evaluation rubric (for the owner and a few students)
1. Did the world feel like *my* notes? 2. Did any question surprise me with something not in my notes? 3. Could I answer the same fact in a different format next day? 4. Did the lectures feel short and clear? 5. Would I use it before an exam?

---

## 20. Build plan (phases and acceptance checks)

**Phase 0: Discovery** (section 3). Done when `PHASE0_FINDINGS.md` exists and the owner has no blocking questions.

**Phase 1: AI gateway and admin config.** `generateStructured`, adapters (OpenAI-compatible + Gemini), `config/ai` with admin screen, prompt loader, zod base schemas. *Accept:* a test task returns validated JSON from two different providers with the same prompt; a deliberately broken output is repaired; a dead model fails over.

**Phase 2: Ingestion and review gate 1.** S0 and S1, upload UI, OCR with confidence, outline editor, side-by-side verification. *Accept:* both fixtures produce cleaned text; flagged lines appear; outline is editable; real-time progress works without refresh.

**Phase 3: Knowledge extraction.** S2–S5, Subject Packs (`nursing_medical`, `general` first), conflict cards. *Accept:* golden expected KUs found (≥ 90% recall, 100% grounded); gastrostomy conflict raised; ordered sequences extracted.

**Phase 4: Activities and renderers.** Templates in this order: `flip_recall`, `cloze`, `mcq`, `ordering`, `matching`, `classify`, `case_vignette`, `procedure_sim`, `spot_the_error`, `contrast_table`, `why_chain`, `rationale_pick`, then the rest. S7 + S8 with lint and grounding. *Accept:* every KU covered by ≥ 2 templates; grounding pass ≥ 98%; keyboard-accessible renderers.

**Phase 5: World and lecture loop.** S6, WorldMap, lecture beats, themes (`ward`, `island` first), progressive publish. *Accept:* a student can upload the fixtures and learn the first node within minutes; map updates live.

**Phase 6: Memory engine and Ward Round.** FSRS wrapper, queue builder, mastery, XP/streak integration with existing gamification. *Accept:* simulated 30-day schedule test passes; interleaving constraints hold; offline review syncs.

**Phase 7: More Subject Packs and themes.** `law`, `history_social`, `literature_arts`, `language_learning`, `math_physics`, `life_sciences`, `business_economics`, `engineering_cs`. *Accept:* each non-nursing fixture builds a sensible world with no code changes beyond the pack file.

**Phase 8: Tutor, merge-into-class, teacher tools, admin report, conformance test.** *Accept:* section 19.3/19.4 reports work; merge log and undo work.

**Phase 9: Hardening.** Security rules tests, index verification, performance pass, accessibility audit, error UX, docs. *Accept:* definition of done (section 22).

At the end of every phase: type-check, lint, tests, production build, short written summary for the owner (what changed, what to deploy, what to test by hand, what you could not verify).

---

## 21. Prompt library to create under `/prompts`

Create each as a versioned file following 4.6. Names and purposes:

- `ocr_page.v1` — handwriting transcription with confidence.
- `clean_repair.v1` — only for ambiguous symbol repairs flagged by rules.
- `outline.v1` — section tree from numbered lines.
- `subject_detect.v1` — pick subject pack.
- `extract_ku.v1` — Knowledge Units from a section using the pack ontology.
- `missed_facts.v1` — second pass on uncovered lines.
- `relations.v1` — relations and look-alike groups.
- `merge_decide.v1` — borderline merge vs link vs new.
- `conflict_check.v1` — compare two KUs for contradiction.
- `world_design.v1` — zones/nodes/theme proposal.
- `beat_write.v1` — hook/teach/recap text from KUs.
- `activity_<template>.v1` — one per template.
- `grader_teachback.v1` — rubric grading.
- `mnemonic.v1` — memory hooks (AI-added, labeled).
- `tutor_grounded.v1` — grounded Q&A with citations.

### 21.1 Example: `extract_ku.v1` few-shot (use this literally)

INPUT (lines 14–18, section "Bolus or intermittent feeding"):
```
14 Pinch the proximal end of the gastrostomy tube (to prevent air from entering)
15 Attach syringe to end of tube and hang it up to 18 inches above the patient's abdomen
16 Fill up the syringe barrel with feed, and
17 Allow to empty gradually, continue to refill until the prescribed amount is consumed.
18 NOTE: The barrel should not be allowed to empty completely before refilling to avoid air from entering
```
OUTPUT:
```json
{"units":[
 {"type":"procedure_step","statement":"Pinch the proximal end of the gastrostomy tube to prevent air from entering.","question":"What do you do to the proximal end of the gastrostomy tube before attaching the syringe?","answer":"Pinch it","order":1,"critical":false,"source":{"pageNo":4,"lineStart":14,"lineEnd":14,"excerpt":"Pinch the proximal end of the gastrostomy tube (to prevent air from entering)"},"provenance":"notes","confidence":0.95},
 {"type":"procedure_step","statement":"Attach the syringe to the end of the tube and hold it about 18 inches above the patient's abdomen.","question":"How high above the abdomen is the syringe held for bolus feeding?","answer":"About 18 inches","order":2,"source":{"pageNo":4,"lineStart":15,"lineEnd":15,"excerpt":"Attach syringe to end of tube and hang it up to 18 inches above the patient's abdomen"},"provenance":"notes","confidence":0.9},
 {"type":"rule","statement":"Do not let the syringe barrel empty completely before refilling, to avoid air entering.","question":"Why must the syringe barrel not empty completely before refilling?","answer":"Air would enter","critical":true,"source":{"pageNo":4,"lineStart":18,"lineEnd":18,"excerpt":"The barrel should not be allowed to empty completely before refilling to avoid air from entering"},"provenance":"notes","confidence":0.92}
]}
```

---

## 22. Definition of Done (the whole feature)

- [ ] Phase 0 findings written; no unresolved blocking questions.
- [ ] A non-engineering student can upload a docx and handwritten photos and reach a playable world without configuration.
- [ ] Every shown fact has a working "View in my notes" anchor, and AI-added content is visibly labeled and off by default.
- [ ] Conflicts and low-confidence items are surfaced for confirmation, never silently fixed.
- [ ] All 9 stages are idempotent and resumable; refresh and function timeout lose no work.
- [ ] Works with at least two different providers via admin config; the conformance test is green for the configured models.
- [ ] No model names, keys, or prompts hardcoded outside config and `/prompts`.
- [ ] At least 12 activity templates shipped with accessible renderers; grounding pass ≥ 98%.
- [ ] FSRS-backed Ward Round with interleaving; offline reviews sync.
- [ ] Subject Packs for all listed subjects built without pipeline code changes.
- [ ] Dark theme only; WCAG AA contrast; reduced motion and calm mode work.
- [ ] Security rules and composite indexes verified (emulator tests pass); no query hangs.
- [ ] Type-check, lint, tests, and production build all pass locally.
- [ ] Owner receives a short deploy-and-test checklist.

---

## 23. Evidence basis (why the design looks like this)

- Retrieval practice (actively recalling) improves long-term retention compared with restudying, and shorter delays between learning and the first retrieval help more. This is why every beat ends with a check.
- Spacing and interleaving are widely recommended, but effects are not universal; students often misjudge which strategy helps them. This is why scheduling is automatic and mixed practice is built in rather than left to the learner.
- For complex procedural learning, studying worked examples can outperform problem-solving practice for novices, which is why procedures are shown fully first, then faded.
- Learning-style matching is not supported by evidence, which is why R3 forbids it.
- FSRS is an open-source scheduler with implementations in many languages, including the MIT-licensed `ts-fsrs` TypeScript package.

Sources to consult while building:
- Open Spaced Repetition (FSRS): https://github.com/open-spaced-repetition
- ts-fsrs: https://github.com/open-spaced-repetition/ts-fsrs
- "One size does not fit all" (spacing, interleaving, retrieval, heterogeneity): https://pmc.ncbi.nlm.nih.gov/articles/PMC10950551
- Retrieval practice and worked examples (cognitive load, effort, metacognition): https://link.springer.com/article/10.1007/s10648-020-09562-w
- Retrieval practice in medical education (spaced retrieval, active recall, testing effect): https://www.lecturio.com/pulse/retrieval-based-learning-strategies-in-medical-education/

---

## 24. Final instructions to the building agent

- Start with Phase 0 and report. Then build phase by phase.
- Prefer small, reviewable commits that each build cleanly.
- When something in the repo contradicts this spec, say so plainly and propose the smallest fix.
- If you are a weaker model reading this: do not try to do everything at once. Do one phase, one stage, one template at a time, and run the checks. The structure of this document exists so that small steps add up to the whole.
- If anything would require guessing about the owner's data, ask. If something is a reasonable default, choose it, write it down, and move on.
