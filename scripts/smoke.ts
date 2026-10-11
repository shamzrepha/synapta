/**
 * Synapta Pre-Launch Smoke Test Suite
 *
 * Runs non-destructive sanity requests against a deployed preview or local dev server.
 *
 * Usage:
 *   APP_URL=http://localhost:3000 npx tsx scripts/smoke.ts
 */

const baseUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

async function runSmokeTests() {
  console.log(`=======================================================`);
  console.log(` Synapta Pre-Launch Smoke Test Runner`);
  console.log(` Target URL: ${baseUrl}`);
  console.log(`=======================================================\n`);

  let failures = 0;

  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
      failures++;
      console.error(`  ❌ [FAIL] ${name}:`, err instanceof Error ? err.message : err);
    }
  }

  // 1. Health Endpoint
  await check("GET /api/health returns status healthy", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok || json.data?.status !== "healthy") {
      throw new Error(`Unexpected body: ${JSON.stringify(json)}`);
    }
  });

  // 2. Classes Explore Endpoint
  await check("GET /api/classes?scope=explore returns direct array", async () => {
    const res = await fetch(`${baseUrl}/api/classes?scope=explore`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok || !Array.isArray(json.data)) {
      throw new Error(`Expected direct array under data: ${JSON.stringify(json)}`);
    }
  });

  // 3. Robots.txt
  await check("GET /robots.txt returns valid directives", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("User-agent:")) throw new Error("Missing User-agent directive");
  });

  console.log("\n-------------------------------------------------------");
  if (failures === 0) {
    console.log("🎉 All smoke tests passed successfully!");
    process.exit(0);
  } else {
    console.error(`💥 Smoke test run finished with ${failures} failure(s).`);
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error("Unhandled smoke runner error:", err);
  process.exit(1);
});
