# SunRoot Worlds: deploy and test checklist

Everything is on `main` once its PR is merged (Vercel deploys on merge; the "deploy-firestore" workflow deploys rules and indexes).

## One-time setup (5 minutes, admin)
1. **Admin, System tab, "Worlds AI models"**: press **Set up from my existing keys**. It reads the Gemini and Groq keys you already added and registers their models.
2. Press **Suggest by specialty**, look at each job, **Save**.
3. Press **Test** next to each job. Fix any that say "Not working".
4. Press **Run on a sample note** (Quality check). Aim for "Good enough for real notes".
5. Free tiers have daily limits. If a provider is exhausted, add a second provider key (Cerebras, OpenRouter, Mistral...) and put it as the backup for the job.

## Test as a student (nursing)
1. **More, My Worlds, New world**. Drop the Word note and the photos of the handwritten pages. Press **Create**.
2. If it shows "A few lines are hard to read", fix or confirm them.
3. Wait for "Your world is ready" (you can leave and come back). Open the library: check the facts, and settle any "Your notes say two different things".
4. **Start learning**: do the first lesson. Tap **View in my notes** on an answer: it should open your page at the right line.
5. Add a second note on the same topic (**Add notes**): it should merge, not duplicate.
6. **Find pictures** on the library page. Approve one. Its question appears in the lessons, blurred until tapped.
7. Come back tomorrow: **Review N due** on the map.

## Test as a teacher
1. Open a class, **Build from notes** (Worlds from your notes). Upload notes, Create.
2. As an enrolled student, open the class: the world appears and plays.

## What to tell me if something looks wrong
A screenshot and what you expected. The most likely issues are model quality on handwriting (use a stronger vision model) and provider daily limits.
