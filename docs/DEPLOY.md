# Synapta — Vercel & Firebase Deployment Guide (DEPLOY.md)

This guide walks through deploying Synapta to production on **Vercel** with **Firebase Authentication**, **Cloud Firestore**, **Firebase Storage**, and **Google Gemini AI**.

---

## 1. Prerequisites
- A Google Cloud / Firebase account (`synapta-learning`).
- A Google AI Studio API key (`GEMINI_API_KEY`).
- A Vercel account with GitHub / GitLab integration.

---

## 2. Firebase Setup

1. **Create a Firebase Project:**
   - Go to [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `synapta-learning`).
2. **Enable Authentication:**
   - Go to **Build > Authentication > Sign-in method**.
   - Enable **Email/Password**.
   - Enable **Google** provider and provide project support email.
3. **Provision Cloud Firestore:**
   - Go to **Build > Firestore Database > Create database**.
   - Select Production mode and choose your primary region (e.g., `us-central1`).
4. **Deploy Firestore Rules & Indexes:**
   ```bash
   firebase login
   firebase use synapta-learning
   firebase deploy --only firestore:rules,firestore:indexes
   ```
5. **Firebase Storage (Direct Uploads):**
   - Go to **Build > Storage > Get Started**.
   - Direct signed URL uploads allow PDF textbooks, slide decks, and past papers up to 100 MB directly from student/teacher browsers, completely bypassing the 4.5 MB Vercel serverless request body ceiling.
6. **Generate Firebase Admin Service Account:**
   - Go to **Project Settings > Service Accounts**.
   - Click **Generate new private key**.
   - Save the JSON file securely (never commit to git). Extract:
     - `project_id` -> `FIREBASE_ADMIN_PROJECT_ID`
     - `client_email` -> `FIREBASE_ADMIN_CLIENT_EMAIL`
     - `private_key` -> `FIREBASE_ADMIN_PRIVATE_KEY` (formatted with `\n` preserved)
7. **Register Web App for Client Config:**
   - Go to **Project Settings > General > Your apps > Add web app**.
   - Copy the configuration object values for the `NEXT_PUBLIC_FIREBASE_*` variables.

---

## 3. Environment Variables Configuration (Fix Pack C Architecture)

In your Vercel Project Dashboard (**Settings > Environment Variables**), add the following:

| Variable | Description | Recommended Value |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API Key | Production key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `synapta-learning.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | `synapta-learning` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `synapta-learning.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Sender ID | Config from Firebase |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web App ID | Config from Firebase |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase Admin Project ID | `synapta-learning` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Service Account Email | `firebase-adminsdk-...` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Private key with `\n` characters | Private key string |
| `GEMINI_API_KEY` | Google AI Studio Gemini API Key | Secret key |
| `GEMINI_MODEL_TUTOR` | Realtime Socratic tutor & hints | `gemini-3.1-flash-lite` (500 RPD) |
| `GEMINI_MODEL_STRUCTURED` | Syllabus/KC maps, quizzes, SimSpecs | `gemini-3.1-flash-lite` (500 RPD) |
| `GEMINI_MODEL_LONGDOC` | Document & PDF topic extraction | `gemini-3.1-flash-lite` (500 RPD) |
| `GEMINI_MODEL_BUILD` | Initial course map synthesis | `gemini-3.6-flash` (20 RPD heavy tier) |
| `GEMINI_MODEL_GRADING` | High-stakes boss quests & grading | `gemini-3.6-flash` (20 RPD heavy tier) |
| `GEMINI_CHAIN_LIGHT` | Light tier fallback chain | `gemini-3.1-flash-lite,gemini-3.5-flash-lite` |
| `GEMINI_CHAIN_HEAVY` | Heavy tier fallback chain | `gemini-3.6-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-3.8-flash` |
| `ADMIN_EMAILS` | Comma-separated admin emails | `admin@synapta.app` |
| `STUDENT_TOKEN_LIMIT` | Monthly token allowance for students | `50000` |
| `TEACHER_TOKEN_LIMIT` | Monthly token allowance for teachers | `200000` |

---

## 4. Free-Tier Capacity Reality & Production Launch

Google AI Studio free-tier quotas are **per project, per model, shared by all users of the application**:
- **Light Models (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`)**: 500 requests/day each (≈1,000 requests/day combined).
- **Heavy Models (`gemini-3.6-flash`, `gemini-3.7-flash`, etc.)**: 20 requests/day each.
- **Capacity Reality**: Free tier handles ~1,000 light requests/day, suitable for a pilot of a few dozen active learners with caching.
- **For Real Public Launch**: Simply **enable billing** on the Google Cloud / Gemini project. The application code immediately scales without any code changes to higher rate limits (1,000+ RPM).

---

## 5. Authorized Domains in Firebase Auth
After Vercel assigns your production and preview domains (e.g., `synapta.vercel.app`):
1. Go to **Firebase Console > Authentication > Settings > Authorized domains**.
2. Click **Add domain** and add your Vercel domains.

---

## 6. Verification Checklist
1. `npx tsc --noEmit && npx eslint . && npx vitest run` passes with 0 errors.
2. In the Admin Console under the **System & AI Health** tab, check the real-time status of all Gemini models and click **Test Call** to verify provider connectivity.
3. Upload a PDF textbook or syllabus in a course to verify direct Firebase Storage signed URL upload and the call-minimizing ingestion pipeline.
