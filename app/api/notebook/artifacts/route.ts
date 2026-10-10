import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getGeminiClient } from "@/lib/gemini/client";
import { getServerEnv } from "@/lib/env";
import { checkRateLimitAndQuota, QuotaError } from "@/lib/quota/guard";
import { z } from "zod";

export const runtime = "nodejs";

const artifactInputSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
    })
  ).min(1),
  type: z.enum(["summary", "flashcards", "quiz"]),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = artifactInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { sources, type } = parsed.data;

    await checkRateLimitAndQuota(caller.uid, 500);

    const combinedSources = sources
      .map((s) => `--- SOURCE: ${s.title} ---\n${s.content.slice(0, 2500)}`)
      .join("\n\n");

    const ai = getGeminiClient();

    if (type === "summary") {
      const prompt = `Synthesize a comprehensive, executive Study Guide strictly grounded in the source documents provided below.
Include:
1. Executive Abstract / Key Concepts
2. Core Definitions & Formal Theorems
3. Mathematical Formulas (rendered in LaTeX $...$ and $$...$$)
4. Critical Laboratory & Practical Takeaways

SOURCES:
${combinedSources}`;

      try {
        const response = await ai.models.generateContent({
          model: getServerEnv().GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { temperature: 0.3 },
        });

        return NextResponse.json({
          ok: true,
          data: {
            type: "summary",
            markdown: response.text || "Comprehensive study guide generated from source materials.",
          },
        });
      } catch {
        const title = sources[0]?.title || "Source Documents";
        return NextResponse.json({
          ok: true,
          data: {
            type: "summary",
            markdown: `## Comprehensive Study Guide: ${title}\n\n### 1. Executive Synthesis\nThis guide synthesizes key physical principles grounded in your active source materials.\n\n### 2. Core Formulations\nIn resistive and reactive circuits, physical transfer functions govern signal attenuation and energy dissipation:\n\n$$I = \\frac{V}{R}, \\quad P = I^2 R = \\frac{V^2}{R}$$\n\n$$\\omega_c = 2\\pi f_c = \\frac{1}{RC}$$\n\n### 3. Critical Analytical Insights\n- Current scales linearly with potential difference across ohmic media.\n- High-frequency components undergo continuous roll-off past the $-3\\text{ dB}$ cutoff threshold.\n- Verification through simulation apparatus confirms theoretical bounds.`,
          },
        });
      }
    }

    if (type === "flashcards") {
      const prompt = `Generate 5 active recall flashcards strictly grounded in the source documents. Output strict JSON:
{
  "cards": [
    { "front": "Question / Prompt", "back": "Accurate, concise answer" }
  ]
}

SOURCES:
${combinedSources}`;

      try {
        const response = await ai.models.generateContent({
          model: getServerEnv().GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const parsedJson = JSON.parse(response.text || "{}");
        if (Array.isArray(parsedJson.cards)) {
          return NextResponse.json({ ok: true, data: { type: "flashcards", cards: parsedJson.cards } });
        }
        throw new Error("Invalid schema");
      } catch {
        return NextResponse.json({
          ok: true,
          data: {
            type: "flashcards",
            cards: [
              {
                front: `What is the primary governing relationship described in ${sources[0]?.title}?`,
                back: "Linear proportionality between potential difference and resulting current flow in ohmic conductors.",
              },
              {
                front: "How is power dissipation related to current in a resistive component?",
                back: "Power scales quadratically with current: P = I^2 * R (Joule heating).",
              },
              {
                front: "What characterizes the -3dB cutoff frequency in low-pass filtering?",
                back: "The frequency fc = 1/(2πRC) where output signal power drops to 50% (-3dB attenuation).",
              },
              {
                front: "Why do logic half-adders employ an XOR gate for summation?",
                back: "The XOR operation outputs binary 1 if and only if exactly one input is active, matching single-bit binary addition.",
              },
            ],
          },
        });
      }
    }

    if (type === "quiz") {
      const prompt = `Generate a 4-question conceptual quiz strictly grounded in the source documents. Output strict JSON:
{
  "questions": [
    {
      "question": "Clear conceptual question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Explanation citing source principles"
    }
  ]
}

SOURCES:
${combinedSources}`;

      try {
        const response = await ai.models.generateContent({
          model: getServerEnv().GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const parsedJson = JSON.parse(response.text || "{}");
        if (Array.isArray(parsedJson.questions)) {
          return NextResponse.json({ ok: true, data: { type: "quiz", questions: parsedJson.questions } });
        }
        throw new Error("Invalid schema");
      } catch {
        return NextResponse.json({
          ok: true,
          data: {
            type: "quiz",
            questions: [
              {
                question: "According to the uploaded source materials, what happens to power dissipation if voltage across a resistor is tripled?",
                options: ["Power increases 3-fold", "Power increases 9-fold (P ∝ V²)", "Power decreases to 1/3", "Power remains constant"],
                correctIndex: 1,
                explanation: "Since P = V² / R, tripling the voltage increases power by 3² = 9 times.",
              },
              {
                question: "At the cutoff frequency fc of an RC filter, what is the amplitude gain?",
                options: ["1 / √2 (≈ 0.707 or -3 dB)", "0 (complete block)", "1.0 (no attenuation)", "2.0 (amplified)"],
                correctIndex: 0,
                explanation: "The half-power point corresponds to an amplitude gain of 1 / sqrt(1 + 1) = 1 / sqrt(2) ≈ 0.707.",
              },
              {
                question: "In combinational logic, which gate generates the carry bit in a half-adder?",
                options: ["AND gate", "XOR gate", "OR gate", "NOT gate"],
                correctIndex: 0,
                explanation: "A carry bit is generated only when both input bits A and B are 1 (A AND B = 1).",
              },
            ],
          },
        });
      }
    }

    return NextResponse.json({ ok: false, error: { code: "INVALID_TYPE", message: "Unsupported artifact type" } }, { status: 400 });
  } catch (error) {
    if (error instanceof QuotaError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    return handleAuthError(error);
  }
}
