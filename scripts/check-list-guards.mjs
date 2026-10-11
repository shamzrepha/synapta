import fs from "fs";
import path from "path";

const targets = ["app", "components"];
const riskyListPatterns = [
  /\brooms\.map\(/,
  /\bclasses\.map\(/,
  /\bmatchedPeers\.map\(/,
  /\bclassKcs\.map\(/,
];

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        scanDirectory(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      if (!entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
}

function checkFiles() {
  const infractions = [];
  const files = [];

  for (const target of targets) {
    const targetPath = path.resolve(process.cwd(), target);
    scanDirectory(targetPath, files);
  }

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of riskyListPatterns) {
        if (pattern.test(line)) {
          // Check if guarded with asArray(...) on the same line
          const hasAsArray = line.includes("asArray(");
          if (!hasAsArray) {
            infractions.push({
              file: path.relative(process.cwd(), file),
              line: i + 1,
              snippet: line.trim(),
            });
          }
        }
      }
    }
  }

  if (infractions.length > 0) {
    console.error(`\n❌ CI GUARD FAILURE: Found ${infractions.length} unguarded list .map() call(s):`);
    for (const inf of infractions) {
      console.error(`  - ${inf.file}:${inf.line} -> ${inf.snippet}`);
    }
    console.error("\nPlease wrap with asArray(...) to prevent runtime .map is not a function crashes.\n");
    process.exit(1);
  } else {
    console.log(`✅ CI GUARD PASSED: Checked ${files.length} files. All critical list mappings are protected with asArray().`);
  }
}

checkFiles();
