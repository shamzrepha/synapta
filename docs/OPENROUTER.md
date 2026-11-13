# OpenRouter: many models, one key

SunRoot can send its AI work through OpenRouter, so each job goes to the cheapest model that is good at it, and no feature depends on one company.

## Set it up (5 minutes)
1. Create an account at https://openrouter.ai, add a small credit ($5 to start) and create a key at https://openrouter.ai/keys. On the key, set a **monthly limit**.
2. In SunRoot: Admin, System, **AI Key & Provider**. Paste the key in the OpenRouter box (it is tested, then saved) and press the **OpenRouter** card to make it the active engine. (Or set `OPENROUTER_API_KEY` in Vercel; never put it in git or chat.)
3. Admin, **Worlds AI models**: press "Set up from my existing keys" so Worlds jobs also start with their recommended models.

If the active engine fails or runs out, any other engine that has a key steps in. With an OpenRouter key saved it also becomes the safety net when Gemini runs out, even if Gemini is the active engine.

## Which model does which job (defaults)
Edit them in the same admin box, per kind of work. IDs and prices come from OpenRouter's catalogue; run `npm run check:openrouter` to confirm they still exist.

| Work | First choice | Then | Why |
|---|---|---|---|
| Bulk text (quizzes, flashcards, notes) | deepseek/deepseek-v4-flash | claude-haiku-5.5, glm-5.3-flash | ~$0.09 in / $0.18 out per million tokens, 1M context |
| Reading photos and scans | anthropic/claude-haiku-5.5 | qwen3.7-plus, llama-4-scout | cheap and can see; test on your own handwriting |
| Long documents | claude-haiku-5.5 | deepseek-v4-flash, qwen3.7-plus | 1M tokens of room |
| Classes and worlds | deepseek/deepseek-v4-pro | claude-sonnet-5.5, qwen3.7-plus | strong, about $0.9 in / $1.5 out |
| Grading and evaluation | anthropic/claude-sonnet-5.5 | deepseek-v4-pro, qwen3.8-max | the careful model for marks |
| Labs and simulations | deepseek/deepseek-v4-pro | claude-sonnet-5.5, qwen3-coder | long correct code |
| Tutor chat | deepseek/deepseek-v4-flash | claude-haiku-5.5, gpt-oss-120b | fast and cheap (Groq is faster if you use it) |

## Voice
- The notes reader (Sprout) and the podcast keep using the free Edge voices first.
- If Edge is unavailable (it is sometimes blocked from servers) and an OpenRouter key is set, English lines are spoken by **Kokoro** (`hexgrad/kokoro-82m`, about $0.62 per million characters, so a 10-minute podcast costs under a cent), then Orpheus. Other languages keep their own voices.

## Costs and safety
- Watch spending on openrouter.ai/activity. The monthly limit on the key is your hard stop.
- Prices change; the check script prints today's.
- Only the admin screen can see or change the key. It is never sent to the browser.
