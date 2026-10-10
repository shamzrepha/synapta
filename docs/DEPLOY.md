# Synapta — Vercel & Firebase Deployment Guide (DEPLOY.md)

This guide walks through deploying Synapta to production on **Vercel** with **Firebase Authentication** and **Cloud Firestore**.

---

## 1. Prerequisites
- A Google Cloud / Firebase account.
- A Google AI Studio API key (`GEMINI_API_KEY`).
- A Vercel account with GitHub / GitLab integration.

---

## 2. Firebase Setup

1. **Create a Firebase Project:**
   - Go to [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `synapta-prod`).
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
   firebase use synapta-prod
   firebase deploy --only firestore:rules,firestore:indexes
   ```
5. **Generate Firebase Admin Service Account:**
   - Go to **Project Settings > Service Accounts**.
   - Click **Generate new private key**.
   - Save the JSON file securely (never commit to git). You will extract:
     - `project_id` -> `FIREBASE_ADMIN_PROJECT_ID`
     - `client_email` -> `FIREBASE_ADMIN_CLIENT_EMAIL`
     - `private_key` -> `FIREBASE_ADMIN_PRIVATE_KEY` (formatted with `\n` preserved)
6. **Register Web App for Client Config:**
   - Go to **Project Settings > General > Your apps > Add web app**.
   - Copy the configuration object values for the `NEXT_PUBLIC_FIREBASE_*` variables.

---

## 3. Environment Variables Configuration

In your Vercel Project Dashboard (**Settings > Environment Variables**), add the following:

| Variable | Description | Target |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API Key | Production, Preview, Dev |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain (e.g. `your-app.firebaseapp.com`) | Production, Preview, Dev |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | Production, Preview, Dev |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | Production, Preview, Dev |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Sender ID | Production, Preview, Dev |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web App ID | Production, Preview, Dev |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase Admin Project ID | Production, Preview, Dev |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Service Account Email | Production, Preview, Dev |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Private key with `\n` characters | Production, Preview, Dev |
| `GEMINI_API_KEY` | Google AI Studio Gemini API Key | Production, Preview, Dev |
| `GEMINI_MODEL` | Gemini Model ID (e.g. `gemini-2.5-flash` or `gemini-1.5-flash`) | Production, Preview, Dev |
| `ADMIN_EMAILS` | Comma-separated admin emails (e.g. `admin@synapta.edu`) | Production, Preview, Dev |
| `STUDENT_TOKEN_LIMIT` | Monthly token allowance for students (e.g. `50000`) | Production, Preview, Dev |
| `TEACHER_TOKEN_LIMIT` | Monthly token allowance for teachers (e.g. `200000`) | Production, Preview, Dev |

---

## 4. Authorized Domains in Firebase Auth
After Vercel assigns your production and preview domains (e.g., `synapta.vercel.app`):
1. Go to **Firebase Console > Authentication > Settings > Authorized domains**.
2. Click **Add domain** and add your Vercel domains.

---

## 5. Deployment Verification
1. Push your branch to GitHub.
2. In Vercel, trigger a deployment.
3. Test the flow:
   - Create an account via email / Google.
   - Verify bootstrap sets default student role.
   - Test teacher class creation and syllabus synthesis.
   - Ensure student can join, complete a simulation lab, and view mastery updates.
