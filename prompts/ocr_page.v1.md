# Purpose
Transcribe one photographed or scanned page of notes (including handwriting) exactly, with a confidence for each line.

# Input variables
- {{page_no}}: the page number.

# Instructions
TASK: Transcribe this page (page {{page_no}}) exactly.
RULES: Keep the author's wording and spelling. Keep headings as headings (mark them with "# "). Keep numbering and arrows.
For each line output its text and a confidence from 0 to 1. If a word or number is unclear, put your best guess and lower the confidence of that line.
Do NOT correct medical or technical terms. Do NOT summarise. Do not add anything that is not on the page.
Return: {"lines":[{"text":"...","confidence":0.0}]}

# Output schema (human summary)
{"lines":[{"text":string,"confidence":number}]}

# Few-shot example (input → output)
INPUT: a handwritten page with the heading "Complications" and the line "Peristomal infection is the most common complication (5-6?% cases)".
OUTPUT: {"lines":[{"text":"# Complications","confidence":0.97},{"text":"Peristomal infection is the most common complication (5-6?% cases)","confidence":0.55}]}

# Failure modes to avoid
- "Fixing" an unclear number instead of lowering the confidence.
- Merging two lines into one.
