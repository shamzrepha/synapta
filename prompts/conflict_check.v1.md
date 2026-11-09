# Purpose
Decide whether two statements from a student's notes contradict each other.

# Input variables
- {{a}}: the first statement.
- {{b}}: the second statement.

# Instructions
Two statements from the same student's notes are shown. Decide if they say different, incompatible things about the same subject (for example two different frequencies, doses, durations or numbers for the same action).
Statement A: {{a}}
Statement B: {{b}}
If they can both be true, answer "contradicts": false. Do not decide which one is right.

# Output schema (human summary)
{"contradicts": boolean, "why": string (one short sentence)}

# Few-shot example (input → output)
INPUT: A = "Clean the stoma site 1-2 times daily." B = "Clean the stoma site daily (three times daily)."
OUTPUT: {"contradicts":true,"why":"One says 1-2 times a day, the other says three times a day."}

# Failure modes to avoid
- Saying which statement is correct.
- Treating a restatement of the same fact as a contradiction.
