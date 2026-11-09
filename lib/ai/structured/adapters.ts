import { GoogleGenAI } from "@google/genai";
import { ProviderError, type ProviderAdapter, type ProviderCall, type ProviderResult } from "./types";

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Covers Groq, Cerebras, OpenRouter, Mistral, SambaNova, Together, Qwen endpoints and most others (spec 4.1). */
export function openAiCompatibleAdapter(baseUrl: string, apiKey: string, extraHeaders: Record<string, string> = {}): ProviderAdapter {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    async call(req: ProviderCall): Promise<ProviderResult> {
      const userContent: unknown =
        req.images && req.images.length
          ? [{ type: "text", text: req.user }, ...req.images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.dataBase64}` } }))]
          : req.user;
      const body: Record<string, unknown> = {
        model: req.model.id,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: userContent },
        ],
        temperature: req.temperature,
        max_tokens: Math.min(req.maxTokens, req.model.maxOutputTokens),
      };
      if (req.jsonSchema && req.model.capabilities.includes("json_schema")) {
        body.response_format = { type: "json_schema", json_schema: { name: "result", schema: req.jsonSchema } };
      } else if (req.model.capabilities.includes("json_mode") || req.model.capabilities.includes("json_schema")) {
        body.response_format = { type: "json_object" };
      }
      let res: Response;
      try {
        res = await fetch(`${root}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...extraHeaders },
          body: JSON.stringify(body),
          signal: req.signal ?? AbortSignal.timeout(90_000),
        });
      } catch (e) {
        throw new ProviderError(`Network error: ${(e as Error).message}`, 0, true);
      }
      const json = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new ProviderError(json?.error?.message || `Provider returned ${res.status}`, res.status, retryable(res.status));
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new ProviderError("The model returned an empty answer.", 200, true);
      return { text, usage: { in: json?.usage?.prompt_tokens ?? 0, out: json?.usage?.completion_tokens ?? 0 } };
    },
  };
}

export function geminiAdapter(apiKey: string): ProviderAdapter {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async call(req: ProviderCall): Promise<ProviderResult> {
      const parts: Array<Record<string, unknown>> = [{ text: req.user }];
      for (const im of req.images ?? []) parts.push({ inlineData: { mimeType: im.mime, data: im.dataBase64 } });
      try {
        const res = await ai.models.generateContent({
          model: req.model.id,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: req.system,
            temperature: req.temperature,
            maxOutputTokens: Math.min(req.maxTokens, req.model.maxOutputTokens),
            ...(req.model.capabilities.includes("json_mode") || req.model.capabilities.includes("json_schema") ? { responseMimeType: "application/json" } : {}),
          },
        });
        const text = res.text;
        if (!text || !text.trim()) throw new ProviderError("The model returned an empty answer.", 200, true);
        return { text, usage: { in: res.usageMetadata?.promptTokenCount ?? 0, out: res.usageMetadata?.candidatesTokenCount ?? 0 } };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        const msg = (e as Error).message || "Gemini error";
        const status = Number((e as { status?: number }).status) || (/429|quota|rate/i.test(msg) ? 429 : /5\d\d|unavailable|overloaded/i.test(msg) ? 503 : 400);
        throw new ProviderError(msg.slice(0, 300), status, retryable(status));
      }
    },
  };
}
