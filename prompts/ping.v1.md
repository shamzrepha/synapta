# Purpose
Health check for the model gateway. Proves a model can return strict JSON for a tiny task. Used by the admin "Test" button and by tests.

# Input variables
- {{word}}: any short word.

# Instructions
Return the word "{{word}}" in upper case and its length.

# Output schema (human summary)
{"word": string, "length": number}

# Few-shot example (input → output)
INPUT: word = "heart"
OUTPUT: {"word":"HEART","length":5}

# Failure modes to avoid
- Adding any text outside the JSON.
- Returning the length as a string.
