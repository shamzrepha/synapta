# How SunRoot teaches: the closed learning loop

Plain summary of the learning-science ideas behind the reader, labs, quizzes and map, and where each one lives in the product.
These are well-established findings from the education and cognitive-psychology literature (cited by author and year from memory,
not re-checked against the sources; treat the names as pointers to read further).

## The loop

A closed loop has four beats that repeat: **goal -> attempt -> feedback -> adjust**. Reading alone is open-loop (nothing comes
back to the learner). Every chapter therefore ends in a loop, and the next step is chosen from the result.

| Beat | What the learner does | Where in SunRoot |
| --- | --- | --- |
| Goal | sees what this chapter is for | learning objectives at the top of each chapter; the mind map shows where it sits |
| Attempt | tries to recall or do, before being shown | "Close the book" recall check; quizzes; labs (predict, then run) |
| Feedback | gets the answer and the reason at once | answer reveal; quiz explanations; "Where is this in my notes?" jumps to the passage |
| Adjust | the next step depends on the result | recalled most -> quiz; missed some -> flashcards; mastery colours on the map |

## Principles and how we use them

- **Retrieval practice (the testing effect; Roediger and Karpicke, 2006).** Trying to remember beats re-reading. The recall check at the
  end of each chapter turns its summary bullets and key terms into fill-in-the-blank and "what is X?" prompts, answered *before* the answer shows.
- **Spaced and interleaved practice (Cepeda et al., 2006; Rohrer and Taylor, 2007).** Flashcards use FSRS spacing; quizzes mix topics.
- **Feedback that answers three questions (Hattie and Timperley, 2007).** Where am I going (objectives), how am I going (recall score,
  mastery colour), where next (the next-step buttons). Feedback is about the task and the strategy, not the person.
- **Formative assessment (Black and Wiliam, 1998).** Small checks inside learning, used to steer, not to grade.
- **Scaffolding and the zone of proximal development (Vygotsky; Wood, Bruner and Ross, 1976).** Hints first, answers later; support
  fades as mastery rises. The map recommends the next topic from mastery.
- **Concrete before abstract (Piaget; Bruner's enactive, iconic, symbolic; Fyfe et al., 2014 on "concrete fading").** Every concept
  opens with a physical analogy, then a diagram or lab, then the formal term. Younger learners: more concrete steps, shorter chunks.
- **Dual coding and multimedia principles (Paivio; Mayer).** Words plus a matching picture; no decoration that does not teach;
  signal what matters (highlighted key words); present in small segments the learner controls.
- **Cognitive load and worked examples (Sweller).** Each chapter has fully worked examples before practice; one new idea per step.
- **Predict, observe, explain (White and Gunstone, 1992).** Labs ask for a prediction before the run, then compare.
- **Self-explanation (Chi et al., 1994).** "Teach me" and the tutor ask the learner to explain in their own words.
- **Desirable difficulties (Bjork).** Recall before reveal feels harder than re-reading and works better; we keep it short so it stays motivating.
- **Motivation (Self-Determination Theory: autonomy, competence, relatedness).** Learners choose their path (map, reader, labs); progress
  is visible; classes and leaderboards give belonging. Rewards are small and capped so they do not replace interest.
- **Attention and ADHD/dyslexia support.** Short pages, one operation per step, readable type, text-size control, read-aloud with the
  paragraph highlighted, and an on-screen "where I am" at all times.

## What a chapter is

Number, objectives, a concrete hook, short sections that build up, definitions, a worked example, common mistakes, a summary, key terms,
review questions. Then the loop: recall -> quiz -> flashcards -> next chapter. After the last chapter the learner is pointed to the
learning map for the next phase.

## Not built yet

- Predict-before-run prompts inside every lab.
- Interleaving across chapters in the quiz.
- Adaptive fading of hints from mastery.
- The declarative animated-lesson engine (see `docs/design/INTERACTIVE-LESSON-ENGINE.md`).
