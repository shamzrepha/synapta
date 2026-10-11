# Synapta — Production Deployment Guide

This document describes the steps required to deploy Synapta to **Vercel** and **Firebase**.

---

## 1. Firebase Configuration

### Deploy Firestore Security Rules and Indexes
Ensure you have the Firebase CLI installed (`npm i -g firebase-tools`) and authenticated (`firebase login`):

```bash
# Deploy strict Firestore security rules and composite indexes
firebase deploy --only firestore:rules,firestore:indexes --project synapta-learning
```

### Firebase Console Authentication Settings
In the [Firebase Console](https://console.firebase.google.com/project/synapta-learning/authentication/settings):
1. Navigate to **Authentication > Settings > Authorized domains**.
2. Add your production Vercel domain (e.g., `synapta-zeta.vercel.app` or custom domain).
3. Under **Sign-in method**, ensure **Google** and **Email/Password** are enabled.

---

## 2. Vercel Environment Variables

Set the following environment variables in your Vercel Project Settings (**Settings > Environment Variables**):

| Variable | Description | Example / Note |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `synapta-learning.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | `synapta-learning` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Cloud Storage Bucket | `synapta-learning.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID | `39168865444` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web App ID | `1:39168865444:web:...` |
| `FIREBASE_PROJECT_ID` | Server Project ID | `synapta-learning` |
| `FIREBASE_CLIENT_EMAIL` | Service Account Email | `firebase-adminsdk-...@synapta-learning.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Private Key (PEM) | Replace `\n` with actual newlines |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `GEMINI_MODEL` | Gemini Model ID | `gemini-3.8-flash` |
| `ADMIN_EMAILS` | Comma-separated admin whitelist | `admin@synapta.app` |
| `STUDENT_TOKEN_LIMIT` | Monthly student token cap | `50000` |
| `TEACHER_TOKEN_LIMIT` | Monthly teacher token cap | `200000` |

---

## 3. Build & Production Verification

Run the verification suite locally before deploying:

```bash
npm run verify
```

This validates TypeScript compilation, ESLint, Vitest test suites, and CI array guards.
