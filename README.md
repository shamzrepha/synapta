# Synapta 🧠

> **AI-Native Adaptive Learning Platform** combining an LMS layer, student **Cognitive Digital Twin** powered by **Bayesian Knowledge Tracing (BKT)**, in-situ interactive simulation labs, source-grounded research AI (NotebookLM style), and peer study lounges.

[![Next.js](https://img.shields.io/badge/Next.js-16.4.0-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth_%26_Firestore-ffca28?logo=firebase)](https://firebase.google.com/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-3.1_Flash_Lite_%26_3.6_Flash-8e75ff?logo=google)](https://deepmind.google/technologies/gemini/)
[![Vitest](https://img.shields.io/badge/Vitest-Passed-729b1b?logo=vitest)](https://vitest.dev/)

---

## 🌟 Key Architecture & Capabilities

1. **Student Cognitive Digital Twin (Bayesian Knowledge Tracing)**
   - Pure TypeScript, mathematically rigorous implementation of classical Bayesian Knowledge Tracing.
   - Dynamic prior estimation ($P(L_0)$), slip ($S$), guess ($G$), and transition probabilities ($T$) calibrated per Knowledge Component (KC).
   - Real-time posterior updates upon submitting evidence from quizzes, interactive labs, flashcard recalls, and peer tutoring.
   - Anti-farming transaction guard preventing duplicate or automated evidence grinding.
   - Interactive Mastery Radar (`Recharts`) mapping multi-dimensional cognitive competencies.

2. **Source-Grounded NotebookLM Research Studio**
   - Client-side PDF and plaintext extractor with automatic sentence tokenization.
   - Pure client-side TF-IDF vector retrieval engine with BM25-style saturation and inverse document frequency scoring.
   - Source-grounded AI answering with verifiable inline citation chips (`[S1]`, `[S2]`) and exact quote popovers.
   - Two-host "Deep Dive" audio podcast generator (Alex & Sam) powered by the Web Speech API (`speechSynthesis`).
   - One-click studio artifact synthesis (Comprehensive Study Guides, Adaptive Flashcards, and Practice Quizzes).

3. **In-Situ Simulation Apparatus Labs**
   - **Ohm's Law Lab**: Animated SVG circuit showing real-time electron drift velocity, resistor Joule heating, and $I = V/R$ power constraints.
   - **RC Filter Frequency Response Lab**: Interactive cutoff frequency calculator ($f_c = \frac{1}{2\pi RC}$) with dynamic Bode magnitude plot and $-3\text{ dB}$ attenuation threshold.
   - **Digital Logic Gates Lab**: Interactive toggle switches powering XOR sum and AND carry gates to simulate a live 1-bit binary adder.
   - **Ballistic Projectile Lab**: Kinematic motion simulation with gravitational acceleration ($g = 9.8\text{ m/s}^2$) and trajectory tracing.

4. **Peer Study Lounge & BKT Matchmaking**
   - Algorithmic matchmaking connecting students struggling with a concept ($P(L) < 0.60$) to peer mentors who have mastered it ($P(L) \ge 0.75$).
   - Synchronous collaborative scratchpad with debounced synchronization and quick-insert LaTeX formula buttons.
   - Real-time room chat with active presence avatars and evidence awards for peer explanations (+40 XP).

5. **Teacher Heatmap & Curriculum Control**
   - Class-wide mastery matrix displaying all enrolled students against all curriculum Knowledge Components.
   - Automatic identification of systemically struggling concepts ($P(L) < 0.60$).
   - One-click Cognitive Twin drill-down modal per student with historical mastery radar.
   - CSV export of gradebook and mastery data.
   - AI-assisted syllabus generator decomposing high-level course topics into a directed acyclic graph (DAG) of prerequisite KCs.

6. **Admin Superuser Console & Quota Guard**
   - Platform-wide token usage telemetry, estimated API expenditure ($/1M tokens), and call volume tracking.
   - Role management (`student`, `teacher`, `admin`) with self-lockout prevention.
   - User account activation/deactivation synchronized with Firebase Auth and Firestore.
   - Dual-tier token quota limits enforcing fair-share Gemini API consumption per billing cycle.

---

## 📐 Mathematical Formulation of BKT

Synapta implements the standard 4-parameter Bayesian Knowledge Tracing model:

$$\theta = \{ P(L_0), T, S, G \}$$

Where:
- $P(L_0) \in [0, 1]$: Initial probability that the student already knows the knowledge component.
- $T \in [0, 1]$: Transition probability that an unlearned state transitions to learned after an opportunity.
- $S \in [0, 1]$: Slip probability that a student knows the concept but makes an error ($P(\text{Incorrect} \mid \text{Learned})$).
- $G \in [0, 1]$: Guess probability that an unlearned student guesses correctly ($P(\text{Correct} \mid \text{Unlearned})$).

### 1. Observation Update (Bayes' Rule)

Upon observing an answer at step $t$:

**If the student responds correctly ($C$):**
$$P(L_t \mid C) = \frac{P(L_t)(1 - S)}{P(L_t)(1 - S) + (1 - P(L_t))G}$$

**If the student responds incorrectly ($I$):**
$$P(L_t \mid I) = \frac{P(L_t)S}{P(L_t)S + (1 - P(L_t))(1 - G)}$$

### 2. Knowledge Transition (Markov Step)

Before the next observation $t+1$, knowledge acquisition can occur:

$$P(L_{t+1}) = P(L_t \mid \text{obs}) + (1 - P(L_t \mid \text{obs})) \cdot T$$

### 3. Mastery Criteria & XP Allocation

A Knowledge Component is deemed **Mastered** when:
$$P(L) \ge 0.85$$

When a student crosses the mastery threshold for the first time, a bonus of **+100 XP** is awarded. Everyday evidence submissions earn standard XP scaled by the activity weight:
$$\Delta\text{XP} = \text{Base XP} \cdot \Omega_{\text{activity}}$$
Where $\Omega_{\text{peer}} = 2.0$, $\Omega_{\text{lab}} = 1.5$, $\Omega_{\text{quiz}} = 1.0$, and $\Omega_{\text{flashcard}} = 0.5$.

---

## 🛠 Tech Stack

- **Framework**: Next.js 16.4.0 (Turbopack, App Router, React 19)
- **Styling**: Tailwind CSS v4, Lucide React Icons
- **Database & Auth**: Firebase Authentication & Cloud Firestore (Client SDK + `firebase-admin` Server SDK)
- **AI Engine**: `@google/genai` Official SDK (Dual-Tier Quota Architecture: `gemini-3.1-flash-lite` light tier & `gemini-3.6-flash` heavy tier with multi-tier fallback chains and RPM pacer)
- **Mathematics & Visualizations**: Recharts, KaTeX (`rehype-katex`, `remark-math`), React Markdown
- **Testing**: Vitest 5.0 with TypeScript strict mode

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- A Firebase project with Firestore and Authentication enabled (or use demo mode)
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### 1. Installation

```bash
# Clone or navigate to the project directory
cd synapta

# Install dependencies
npm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env.local
```

Populate the required credentials in `.env.local`:

```ini
# Public Firebase Config (Client-Side)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-app
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:...

# Server-Only Secrets (Never exposed to browser)
FIREBASE_ADMIN_PROJECT_ID=your-app
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@your-app.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...-----END PRIVATE KEY-----\n"

# Gemini AI Model Configuration
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-3.8-flash

# Platform Governance
ADMIN_EMAILS=admin@synapta.edu,superuser@synapta.edu
STUDENT_TOKEN_LIMIT=50000
TEACHER_TOKEN_LIMIT=200000
```

> **Note on Demo/Offline Mode:**
> If `GEMINI_API_KEY` is omitted or set to `mock-demo`, the platform automatically activates graceful offline fallback simulators for syllabus generation, quizzes, tutor streaming, and discussion podcasts.

### 3. Running Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to open the platform.

---

## 🧪 Testing & Verification Suite

Synapta enforces strict 4-stage quality checks:

```bash
# 1. Vitest Unit Test Suite (BKT mathematics & TF-IDF vector retrieval)
npm test

# 2. TypeScript Strict Type-Checking
npx tsc --noEmit

# 3. ESLint Standard Verification (0 errors, 0 warnings)
npm run lint

# 4. Next.js Production Build (Turbopack compilation of all 30 routes)
npm run build
```

---

## 🌐 Production Deployment

### Deploying to Vercel

1. Push your repository to GitHub / GitLab.
2. Import the project into [Vercel](https://vercel.com).
3. Set the Framework Preset to **Next.js**.
4. In the **Environment Variables** panel, add all keys defined in `.env.example`.
   - *Ensure the `FIREBASE_ADMIN_PRIVATE_KEY` maintains its quotes and `\n` line delimiters.*
5. Deploy! Next.js 16 will compile all static and dynamic edge routes.

### Firestore Security Rules

Ensure your Firestore deployment enforces the security policies in `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

---

## 🔒 Security & Privacy Architecture

- **Zero Client Credential Leakage**: Client bundles strictly consume `NEXT_PUBLIC_*` identifiers. All `firebase-admin` and `GoogleGenAI` calls are isolated behind protected Next.js Route Handlers.
- **Role-Based Session Guard**: Cookies are verified via HMAC session verification and Next.js middleware, blocking unauthorized access to `/admin` or `/classes/manage`.
- **Anti-Farming Rate Limiting**: The `/api/evidence` endpoint validates timestamps, minimum elapsed duration, and prevents automated state grinding.

---

## 📄 License

MIT © 2026 Synapta Core Team. All rights reserved.
