/**
 * Checks the recommended OpenRouter models against OpenRouter's public catalogue (no key needed): every model id must still exist,
 * models that read pictures must accept images, every model must support structured answers, and each voice model must list the
 * voices we ask for. Prints prices. Run it before a release and whenever you change lib/ai/openrouter-models.ts:
 *   npm run check:openrouter
 */
import { OR_CLASSES, OR_CLASS_INFO, OR_TTS, OR_TTS_CHOICES } from "../lib/ai/openrouter-models";

interface Entry {
  id: string;
  context_length: number;
  architecture: { input_modalities: string[]; output_modalities: string[] };
  pricing: { prompt?: string; completion?: string };
  supported_parameters: string[];
  supported_voices?: string[];
}

async function main() {
  const urls = ["https://openrouter.ai/api/v1/models", "https://openrouter.ai/api/v1/models?output_modalities=all"];
  const lists = await Promise.all(urls.map(async (u) => ((await (await fetch(u)).json()) as { data: Entry[] }).data));
  const byId = new Map(lists.flat().map((m) => [m.id, m]));
  const per = (x?: string) => (x ? `$${(Number(x) * 1e6).toFixed(3)}` : "?");
  let bad = 0;
  for (const c of OR_CLASSES) {
    console.log(`\n${OR_CLASS_INFO[c].label}`);
    for (const id of OR_CLASS_INFO[c].chain) {
      const m = byId.get(id);
      if (!m) {
        console.log(`  MISSING  ${id}`);
        bad++;
        continue;
      }
      const problems: string[] = [];
      if (OR_CLASS_INFO[c].needsImages && !m.architecture.input_modalities.includes("image")) problems.push("cannot read images");
      if (!m.supported_parameters.some((p) => p === "structured_outputs" || p === "response_format")) problems.push("no structured output");
      if (problems.length) bad++;
      const flag = problems.length ? `  <- ${problems.join(", ")}` : "";
      console.log(`  ${problems.length ? "PROBLEM " : "ok      "} ${id}  in ${per(m.pricing.prompt)}/M  out ${per(m.pricing.completion)}/M  ctx ${m.context_length}${flag}`);
    }
  }
  console.log("\nVoices (price per million characters)");
  for (const id of OR_TTS.models) {
    const m = byId.get(id);
    if (!m) {
      console.log(`  MISSING  ${id}`);
      bad++;
      continue;
    }
    const want = id === OR_TTS.models[0] ? [OR_TTS.voices.female, OR_TTS.voices.male] : Object.values(OR_TTS.otherVoices[id] ?? {});
    const lack = want.filter((v) => !(m.supported_voices ?? []).includes(v));
    if (lack.length) bad++;
    console.log(`  ${lack.length ? "PROBLEM " : "ok      "} ${id}  ${per(m.pricing.prompt)}/M chars${lack.length ? `  <- no voice ${lack.join(", ")}` : ""}`);
  }
  console.log("\nAdmin voice choices");
  for (const c of OR_TTS_CHOICES) {
    const m = byId.get(c.model);
    const lack = m ? [c.female, c.male].filter((v) => !(m.supported_voices ?? []).includes(v)) : [c.female, c.male];
    if (!m || lack.length) bad++;
    console.log(`  ${!m ? "MISSING " : lack.length ? "PROBLEM " : "ok      "} ${c.model}  ${m ? per(m.pricing.prompt) : "?"}/M chars${lack.length && m ? `  <- no voice ${lack.join(", ")}` : ""}`);
  }
  if (bad) {
    console.log(`\n${bad} problem(s): update lib/ai/openrouter-models.ts`);
    process.exit(1);
  }
  console.log("\nAll recommended models are available.");
}

void main();
