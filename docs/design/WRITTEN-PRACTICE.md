# Written (theory) practice

Most Nigerian university exams after 100 level are handwritten. This mode asks exam-style theory questions (define, state, explain, differentiate, derive, calculate with steps), the learner types the answer, and the AI marks it against a marking guide.

## Flow
1. Entry points: the topic's Quiz tab, the notes screen (`Written practice` chip), the past-questions page (picks a topic). All open `/practice/written?classId&kcId` or `?noteId`.
2. Learner picks difficulty (Easier / Exam level / Tricky) and strictness.
3. `POST /api/practice/theory/generate` returns 4 questions with command word and marks (2, 5, 10). The marking guide, model answer and tip stay on the server.
4. Learner types (max 4,000 characters; "Save draft" uses localStorage in try/catch; optional "Photo of my handwritten answer" reads the photo through `/api/documents/read` into the box, to be corrected before marking).
5. `POST /api/practice/theory/mark` returns score out of marks, each key point (got it / partly / missed) with the learner's own quoted words, short feedback, model answer and one exam-writing tip.

## Sources and gating
- Class topic: `assertClassAccess(view)`. Students are set questions only from the lesson the lecturer has pushed (`lessonForStudents`, i.e. `liveMode` respected, snapshot not draft). Teachers use their working copy.
- Own study note: owner only, current version.

## AI and caching
- Tasks `theory_set` (structured group, cheap model) and `theory_mark` (structured group, cheap model; deliberately not `grading_high_stakes`, which uses the strongest model). Registered in `lib/ai/tasks.ts`, `models.ts`, `master-skills.ts`.
- The question set is shared and student-free. Cache key `theory_v1_<hash(scope|difficulty|hash(notes))>`: changing the notes or pushing a new snapshot makes a fresh set, drafts never leak into students' sets. Generated in English (`learnerLanguage:false`).
- Marking is never cached. The answer is capped, scrubbed and fenced (`fenceUntrusted`, label `STUDENT_ANSWER`).

## Strictness
- **Strict**: close to textbook wording; at least one required term/unit/formula per key point must appear or that point is capped at half marks; partial marks round down.
- **Balanced**: key ideas needed, wording free; unsupported marks are halved.
- **Lenient**: correct idea in own words earns the marks; no term requirement. Never counts as mastery evidence.

## Scoring (never trusts the AI)
The marker returns judgements per key point only. We clamp each to its marks, round to half marks, apply the strictness caps, drop quotes that are not in the learner's answer (marks without a verifiable quote are halved except in lenient), then sum and clamp to the question's marks. Key-point marks are rebalanced to equal the question's marks when the set is made. Answers under 3 words or 12 characters score 0 with no AI call.

## Cost estimate per marking
About 700 to 1,100 input tokens (guide, answer, instructions) and 250 to 450 output tokens on the light model: roughly 1,500 tokens, about a tenth of a quiz-bank build. The set (about 3,500 tokens) is made once per topic, difficulty and notes version. Plan accounting: marking counts one `practice` use (checked before, recorded after success; zero-score short answers are free). Setting questions from a learner's own notes also counts one `practice` use on a cache miss; class topics are shared work and not charged to a learner.

## Attempts and mastery evidence
- Attempts are stored in `theoryAttempts` (server-written, owner-only read in `firestore.rules`).
- New BKT activity `theory`, omega **0.6** (quiz is 1.0, flashcard 1.25): written marks are AI-judged, so they move mastery less. Correct = at least 60% of the marks. XP 6 when correct, 1 otherwise.
- Anti-gaming: class topics only (active enrolment); not in lenient mode; answers of 15 words or more; one credited attempt per question per day; at most 5 credited attempts per topic per day (`THEORY_DAILY_CAP` in `lib/evidence/apply.ts`, over it the learner still gets marks but no mastery change); plus the route's shared rate limits (12 sets and 15 markings per minute).

## Not done
- Handwritten photo reading reuses `/api/documents/read` and costs one `scan_pages` unit.
- Teacher-facing view of written attempts and a lecturer-authored marking guide are follow-ups.
