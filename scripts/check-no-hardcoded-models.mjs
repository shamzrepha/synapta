/**
 * CI Guard: Enforce zero hardcoded Gemini model strings outside lib/ai/** (tests/docs excepted)
 * and ensure models.generateContent is only called through lib/ai/**
 */
import fs from "fs";
import path from "path";

const ALLOWED_MODEL_ID_PATHS = [
  path.normalize("lib/ai/"),
  path.normalize("lib/env.ts"),
  path.normalize("scripts/"),
  path.normalize(".test.ts"),
  path.normalize(".spec.ts"),
];

const ALLOWED_GENERATE_PATHS = [
  path.normalize("lib/ai/"),
  path.normalize("scripts/"),
  path.normalize(".test.ts"),
  path.normalize(".spec.ts"),
];

function checkDirectory(dir, errors) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
        continue;
      }
      checkDirectory(fullPath, errors);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
      const content = fs.readFileSync(fullPath, "utf8");
      const normalizedPath = path.normalize(fullPath);

      // Check models.generateContent
      const isGenerateAllowed = ALLOWED_GENERATE_PATHS.some((p) => normalizedPath.includes(p));
      if (!isGenerateAllowed && content.includes("models.generateContent")) {
        errors.push(`[DIRECT_GEMINI_CALL] File "${fullPath}" directly calls "models.generateContent". All calls must route via lib/ai/**!`);
      }

      // Check hardcoded "gemini-..." model strings
      const isModelIdAllowed = ALLOWED_MODEL_ID_PATHS.some((p) => normalizedPath.includes(p));
      if (!isModelIdAllowed) {
        // Look for string literals containing "gemini-"
        const matches = content.match(/["']gemini-[a-zA-Z0-9.-]+["']/g);
        if (matches && matches.length > 0) {
          errors.push(`[HARDCODED_MODEL_ID] File "${fullPath}" contains hardcoded model ID literal(s): ${matches.join(", ")}. Use resolveModelChain(task) or lib/ai/tasks.ts!`);
        }
      }
    }
  }
}

const errors = [];
checkDirectory("app", errors);
checkDirectory("lib", errors);
checkDirectory("components", errors);

if (errors.length > 0) {
  console.error("❌ CI GUARD FAILED: Found prohibited hardcoded models or direct SDK invocations:\n");
  errors.forEach((e) => console.error(` - ${e}`));
  process.exit(1);
} else {
  console.log("✅ CI GUARD PASSED: Zero hardcoded Gemini model literals and zero direct generateContent outside lib/ai/**.");
}
