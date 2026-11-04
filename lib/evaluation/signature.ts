import crypto from "node:crypto";
import type { EvidenceSummary } from "./evidence";

/** A short fingerprint of the evidence, so the same evidence isn't sent to the AI twice. Scores count in 5% steps. */
export function evidenceSignature(s: EvidenceSummary): string {
  const core = s.topics.map((t) => [t.topic, t.kcId, t.openMistakes, t.totalWrong, t.pL === null ? null : Math.round(t.pL * 20)]);
  return crypto.createHash("sha1").update(JSON.stringify([core, s.openMistakes, s.masteredMistakes])).digest("hex").slice(0, 16);
}
