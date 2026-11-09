You are working inside the SunRoot Learning codebase in my project folder. Edit files directly in the folder. Do not ask me to download or copy anything, and do not take over my screen. Run builds and tests from the terminal (I use Windows with Git Bash).

GOAL
Add a feature called SunRoot Worlds. A student uploads notes (docx, pdf, handwritten photos, pasted text) in ANY subject (nursing, law, history, languages, accounting, biology, engineering, anything), and the app turns them into an interactive, gamified, spaced-repetition learning world built from their own notes. Right now SunRoot only feels made for engineers. My girlfriend is a nursing student and must be able to use it freely, so nursing is the first test case, but the system must work for every subject.

THE SPEC
Read `SUNROOT_WORLDS_SPEC.md` completely before doing anything. It is binding. It defines the hard rules (R1 to R22), the model-agnostic AI layer, the 9-stage pipeline, schemas, the activity template library, Subject Packs, the lecture loop, the World themes, the Firestore model and indexes, the memory engine, tests, and a phased build plan with acceptance checks. Follow it strictly. Cite rule IDs when you make design choices.

WHAT YOU MUST DO FIRST
1. Do Phase 0 (repo discovery). Write `docs/worlds/PHASE0_FINDINGS.md`: framework, existing AI plumbing and env vars, Firebase collections, rules, indexes, existing gamification, existing document upload and study-set code, serverless time limits, and any conflicts with the spec. My notes say SunRoot has existed as a vanilla TypeScript + Vite app with Groq and also as a Synapta-based app with Gemini. Do not assume which one this is. Inspect it.
2. Stop and report only if something blocks you. If a reasonable default exists, choose it, write it down, and continue.

HOW TO BUILD
- Go phase by phase (spec section 20). Do not start a phase until the previous phase's acceptance checks pass.
- Models must never be hardcoded. All model assignments come from the admin-set `config/ai` document. Every model call goes through one `generateStructured()` gateway that returns schema-validated JSON, repairs bad output, retries, and fails over. The app must work the same with Groq, Qwen, Gemini, or any other provider, so add providers through adapters only.
- Models only produce JSON data. They never produce HTML, CSS, JS, or SVG. The UI is rendered by fixed components from the activity templates and the World theme library.
- The student's notes are the source of truth. Every generated fact needs a verifiable source anchor and must pass the deterministic grounding check. Anything the AI adds itself must be labeled "AI-added" and be off by default. Never silently correct the student's notes. Flag conflicts and low-confidence text for the student to confirm.
- Keep my product principles: dark mode only (never a light theme), no fake learning-style metrics, no arbitrary code upload or execution, moderation on any social feature, no dark patterns.
- Keep it real-time (Firestore listeners) so I never need to refresh. Declare every composite index in `firestore.indexes.json`. Use direct document lookups instead of list-and-filter. Test security rules.
- Reuse existing code (XP, leaderboards, class system, document library, study-set generator, node map) instead of duplicating it. Do not break existing features.
- Use my two real fixtures (a Word note on dyspnoea and 12 handwritten pages on gastrostomy feeding and assisted feeding) as golden tests, exactly as described in spec section 19.

AFTER EVERY PHASE
Run type-check, lint, tests, and a production build locally. Never leave code that does not build. Then give me a short summary: what changed, what I need to deploy, what I should test by hand, and anything you could not verify. I run the deployments and git commits.

Begin with Phase 0 now.
