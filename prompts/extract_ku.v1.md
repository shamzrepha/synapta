# Purpose
Turn one section of a student's notes into Knowledge Units: small, single facts, each anchored to the exact lines it came from.

# Input variables
- {{subject_pack}}: name of the subject pack.
- {{ontology}}: the kinds of facts to look for in this subject, with their extra fields.
- {{pitfalls}}: warnings for this subject.
- {{section_path}}: the headings above this text.
- {{template_hint}}: "condition", "procedure" or "none".
- {{source}}: the numbered lines to read. Each line starts with its number and a page marker.
- {{retry_note}}: empty, or a list of problems to fix from the last attempt.

# Instructions
SUBJECT PACK: {{subject_pack}}. SECTION PATH: {{section_path}}. TEMPLATE HINT: {{template_hint}}.
KINDS OF FACTS TO LOOK FOR:
{{ontology}}
WARNINGS: {{pitfalls}}

SOURCE (numbered lines, written as "page:line text"):
{{source}}

{{retry_note}}

Extract every distinct fact worth learning as Knowledge Units.
Rules:
1. One fact per unit. If a line holds two facts, make two units.
2. "statement" must be understandable alone (restate the subject; no "it", "this"). At most 25 words.
3. "question" must have exactly one correct short answer that equals "answer". "answer" is at most 12 words.
4. "excerpt" must be copied exactly from the lines in lineStart..lineEnd. Use only line numbers that exist.
5. Mark "order" (1, 2, 3...) for sequences: procedure steps and chains of cause and effect.
6. Mark "critical": true for safety-critical warnings, contraindications and any "never" or "do not" instruction.
7. Include nothing that is not in SOURCE. Never change a number, a dose or a drug name.
8. Put type-specific details in "extra", for example {"drug":"Isoniazid","class":"Anti-TB","adverse":"Hepatotoxicity"}.
Return JSON: {"units":[...]}

# Output schema (human summary)
{"units":[{"type":"definition|cause|risk_factor|sign_symptom|mechanism_step|drug|procedure_step|indication|contraindication|complication|prevention|nursing_action|rationale|diagnostic|classification|formula|date_event|rule|case_holding|vocab|example|misc","statement":string,"question":string,"answer":string,"extra":object|null,"order":number|null,"critical":boolean,"source":{"pageNo":number,"lineStart":number,"lineEnd":number,"excerpt":string},"provenance":"notes","confidence":number}]}

# Few-shot example (input → output)
INPUT (section "Bolus or intermittent feeding"):
4:14 Pinch the proximal end of the gastrostomy tube (to prevent air from entering)
4:15 Attach syringe to end of tube and hang it up to 18 inches above the patient's abdomen
4:18 NOTE: The barrel should not be allowed to empty completely before refilling to avoid air from entering
OUTPUT:
{"units":[
 {"type":"procedure_step","statement":"Pinch the proximal end of the gastrostomy tube to prevent air from entering.","question":"What do you do to the proximal end of the gastrostomy tube before attaching the syringe?","answer":"Pinch it","order":1,"critical":false,"source":{"pageNo":4,"lineStart":14,"lineEnd":14,"excerpt":"Pinch the proximal end of the gastrostomy tube (to prevent air from entering)"},"provenance":"notes","confidence":0.95},
 {"type":"procedure_step","statement":"Attach the syringe to the end of the tube and hold it about 18 inches above the patient's abdomen.","question":"How high above the abdomen is the syringe held for bolus feeding?","answer":"About 18 inches","order":2,"source":{"pageNo":4,"lineStart":15,"lineEnd":15,"excerpt":"Attach syringe to end of tube and hang it up to 18 inches above the patient's abdomen"},"provenance":"notes","confidence":0.9},
 {"type":"rule","statement":"Do not let the syringe barrel empty completely before refilling, to avoid air entering.","question":"Why must the syringe barrel not empty completely before refilling?","answer":"Air would enter","critical":true,"source":{"pageNo":4,"lineStart":18,"lineEnd":18,"excerpt":"The barrel should not be allowed to empty completely before refilling to avoid air from entering"},"provenance":"notes","confidence":0.92}
]}

# Failure modes to avoid
- Paraphrasing inside "excerpt". Copy it character for character.
- Two facts in one unit.
- Answers longer than 12 words.
- Inventing a fact that is not in the source, or "fixing" a number.
